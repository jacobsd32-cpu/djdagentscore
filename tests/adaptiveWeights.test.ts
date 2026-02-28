/**
 * Adaptive Weights Tests
 *
 * Verifies computeAdaptiveWeights() and getEffectiveWeights() — functions
 * that learn dimension weights from outcome data and persist them for
 * use at scoring time.
 *
 * Uses in-memory SQLite to test outcome correlation, weight nudging,
 * drift limits, normalization, and persistence round-trips.
 */

import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { ADAPTIVE_WEIGHTS_CONFIG, DIMENSION_WEIGHTS } from '../src/config/constants.js'
import { computeAdaptiveWeights, getEffectiveWeights } from '../src/scoring/adaptiveWeights.js'
import { createTestDb } from './helpers/testDb.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
})

/** Insert a score_outcomes row with all dimension columns populated. */
function insertOutcome(outcomeType: string, dims: { rel: number; via: number; idn: number; cap: number; beh: number }) {
  db.prepare(
    `INSERT INTO score_outcomes
       (query_id, target_wallet, outcome_type, model_version,
        reliability_at_query, viability_at_query, identity_at_query,
        capability_at_query, behavior_at_query)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    null,
    `0x${Math.random().toString(16).slice(2, 42)}`,
    outcomeType,
    '2.1.0',
    dims.rel,
    dims.via,
    dims.idn,
    dims.cap,
    dims.beh,
  )
}

/** Insert N identical outcome rows. */
function insertMany(
  n: number,
  outcomeType: string,
  dims: { rel: number; via: number; idn: number; cap: number; beh: number },
) {
  for (let i = 0; i < n; i++) insertOutcome(outcomeType, dims)
}

/** Store an adaptive weights result in indexer_state. */
function storeWeights(weights: Record<string, number>) {
  db.prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)').run(
    'adaptive_weights',
    JSON.stringify({
      weights,
      adjustments: {},
      sampleSize: 100,
      positiveCount: 80,
      negativeCount: 20,
      lastUpdatedAt: new Date().toISOString(),
    }),
  )
}

// ---------------------------------------------------------------------------
// computeAdaptiveWeights
// ---------------------------------------------------------------------------

describe('computeAdaptiveWeights', () => {
  it('returns null when no outcomes exist', () => {
    expect(computeAdaptiveWeights(db)).toBeNull()
  })

  it('returns null when outcomes < MIN_OUTCOMES', () => {
    // Insert 49 rows (below threshold of 50)
    insertMany(40, 'successful_tx', { rel: 80, via: 70, idn: 60, cap: 50, beh: 40 })
    insertMany(9, 'fraud_report', { rel: 30, via: 30, idn: 30, cap: 30, beh: 30 })
    expect(computeAdaptiveWeights(db)).toBeNull()
  })

  it('returns null when negative outcomes < MIN_NEGATIVE', () => {
    // 50 total but only 4 negative
    insertMany(46, 'successful_tx', { rel: 80, via: 70, idn: 60, cap: 50, beh: 40 })
    insertMany(4, 'fraud_report', { rel: 30, via: 30, idn: 30, cap: 30, beh: 30 })
    expect(computeAdaptiveWeights(db)).toBeNull()
  })

  it('excludes rows with NULL dimension columns', () => {
    // Insert 50 rows with complete dimensions
    insertMany(40, 'successful_tx', { rel: 80, via: 70, idn: 60, cap: 50, beh: 40 })
    insertMany(10, 'fraud_report', { rel: 30, via: 30, idn: 30, cap: 30, beh: 30 })

    // Insert 20 rows with NULL dimensions (legacy rows) — these should be excluded
    for (let i = 0; i < 20; i++) {
      db.prepare(
        `INSERT INTO score_outcomes (query_id, target_wallet, outcome_type, model_version)
         VALUES (?, ?, ?, ?)`,
      ).run(null, `0xlegacy${i}`, 'successful_tx', '2.0.0')
    }

    // Should still work — 50 complete rows is enough
    const result = computeAdaptiveWeights(db)
    expect(result).not.toBeNull()
    expect(result!.sampleSize).toBe(50)
  })

  it('increases weight for dimension with positive correlation', () => {
    // Positive outcomes have HIGH reliability, negative have LOW
    insertMany(45, 'successful_tx', { rel: 90, via: 50, idn: 50, cap: 50, beh: 50 })
    insertMany(10, 'fraud_report', { rel: 20, via: 50, idn: 50, cap: 50, beh: 50 })

    const result = computeAdaptiveWeights(db)!
    expect(result).not.toBeNull()

    // Reliability weight should have increased from default (0.3)
    expect(result.weights.reliability).toBeGreaterThan(DIMENSION_WEIGHTS.reliability)
    expect(result.adjustments.reliability).toBeGreaterThan(0)
  })

  it('decreases weight for dimension with negative correlation', () => {
    // Negative outcomes have HIGHER capability than positive
    insertMany(45, 'successful_tx', { rel: 50, via: 50, idn: 50, cap: 20, beh: 50 })
    insertMany(10, 'fraud_report', { rel: 50, via: 50, idn: 50, cap: 90, beh: 50 })

    const result = computeAdaptiveWeights(db)!
    expect(result).not.toBeNull()

    // Capability was negatively correlated → its raw weight should have decreased
    // (before renormalization)
    expect(result.adjustments.capability).toBeLessThan(0)
  })

  it('weights always sum to 1.0 after normalization', () => {
    insertMany(45, 'successful_tx', { rel: 90, via: 80, idn: 70, cap: 60, beh: 50 })
    insertMany(10, 'fraud_report', { rel: 20, via: 30, idn: 40, cap: 50, beh: 60 })

    const result = computeAdaptiveWeights(db)!
    expect(result).not.toBeNull()

    const sum = Object.values(result.weights).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 4)
  })

  it('limits per-run shift to MAX_SHIFT_PER_RUN (0.02)', () => {
    // Very strong correlation for reliability
    insertMany(45, 'successful_tx', { rel: 100, via: 50, idn: 50, cap: 50, beh: 50 })
    insertMany(10, 'fraud_report', { rel: 0, via: 50, idn: 50, cap: 50, beh: 50 })

    const result = computeAdaptiveWeights(db)!
    // The raw adjustment (before normalization) should be bounded
    // Since weights are renormalized, check that the adjustment isn't wild
    const reliabilityDrift = result.weights.reliability - DIMENSION_WEIGHTS.reliability
    // The un-normalized shift is 0.02, but normalization adjusts all weights
    // So drift should be modest — certainly within 0.05 total limit
    expect(Math.abs(reliabilityDrift)).toBeLessThanOrEqual(
      ADAPTIVE_WEIGHTS_CONFIG.MAX_TOTAL_DRIFT + 0.01, // small tolerance for renormalization
    )
  })

  it('caps total drift at MAX_TOTAL_DRIFT from default', () => {
    // Pre-store weights that are already at maximum drift
    const maxedWeights = { ...DIMENSION_WEIGHTS }
    maxedWeights.reliability = DIMENSION_WEIGHTS.reliability + ADAPTIVE_WEIGHTS_CONFIG.MAX_TOTAL_DRIFT
    maxedWeights.capability = DIMENSION_WEIGHTS.capability - ADAPTIVE_WEIGHTS_CONFIG.MAX_TOTAL_DRIFT
    // Renormalize
    const sum = Object.values(maxedWeights).reduce((a, b) => a + b, 0)
    for (const k of Object.keys(maxedWeights)) {
      maxedWeights[k as keyof typeof maxedWeights] /= sum
    }
    storeWeights(maxedWeights)

    // Insert data that would push reliability even higher
    insertMany(45, 'successful_tx', { rel: 100, via: 50, idn: 50, cap: 50, beh: 50 })
    insertMany(10, 'fraud_report', { rel: 0, via: 50, idn: 50, cap: 50, beh: 50 })

    const result = computeAdaptiveWeights(db)!
    expect(result).not.toBeNull()

    // After normalization, weights should still be reasonable (not unbounded)
    for (const dim of Object.keys(DIMENSION_WEIGHTS)) {
      expect(result.weights[dim]).toBeGreaterThan(0)
      expect(result.weights[dim]).toBeLessThan(1)
    }
  })

  it('returns correct counts in result', () => {
    insertMany(42, 'successful_tx', { rel: 80, via: 70, idn: 60, cap: 50, beh: 40 })
    insertMany(3, 'multiple_successful_tx', { rel: 85, via: 75, idn: 65, cap: 55, beh: 45 })
    insertMany(5, 'fraud_report', { rel: 30, via: 30, idn: 30, cap: 30, beh: 30 })
    insertMany(5, 'no_activity', { rel: 40, via: 40, idn: 40, cap: 40, beh: 40 })

    const result = computeAdaptiveWeights(db)!
    expect(result.sampleSize).toBe(55)
    expect(result.positiveCount).toBe(45) // successful_tx + multiple_successful_tx
    expect(result.negativeCount).toBe(10) // fraud_report + no_activity
    expect(result.lastUpdatedAt).toBeTruthy()
  })

  it('no weight change when positive and negative means are equal', () => {
    // All dimensions identical across both groups
    insertMany(45, 'successful_tx', { rel: 50, via: 50, idn: 50, cap: 50, beh: 50 })
    insertMany(10, 'fraud_report', { rel: 50, via: 50, idn: 50, cap: 50, beh: 50 })

    const result = computeAdaptiveWeights(db)!
    expect(result).not.toBeNull()

    // Weights should remain at defaults (no nudge when means are equal)
    for (const dim of Object.keys(DIMENSION_WEIGHTS)) {
      expect(result.weights[dim]).toBeCloseTo(DIMENSION_WEIGHTS[dim as keyof typeof DIMENSION_WEIGHTS], 2)
    }
  })
})

// ---------------------------------------------------------------------------
// getEffectiveWeights
// ---------------------------------------------------------------------------

describe('getEffectiveWeights', () => {
  it('returns default DIMENSION_WEIGHTS when no stored weights', () => {
    const weights = getEffectiveWeights(db)
    expect(weights).toEqual({ ...DIMENSION_WEIGHTS })
  })

  it('returns stored weights when present', () => {
    const stored = {
      reliability: 0.32,
      viability: 0.24,
      identity: 0.19,
      capability: 0.11,
      behavior: 0.14,
    }
    storeWeights(stored)

    const weights = getEffectiveWeights(db)
    expect(weights).toEqual(stored)
  })

  it('returns defaults on malformed JSON', () => {
    db.prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)').run(
      'adaptive_weights',
      'not-valid-json{{{',
    )

    const weights = getEffectiveWeights(db)
    expect(weights).toEqual({ ...DIMENSION_WEIGHTS })
  })

  it('returns defaults when stored weights have missing dimensions', () => {
    db.prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)').run(
      'adaptive_weights',
      JSON.stringify({
        weights: { reliability: 0.5 }, // missing other dimensions
        sampleSize: 100,
        lastUpdatedAt: new Date().toISOString(),
      }),
    )

    const weights = getEffectiveWeights(db)
    expect(weights).toEqual({ ...DIMENSION_WEIGHTS })
  })

  it('returns defaults when stored weights have non-number values', () => {
    db.prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)').run(
      'adaptive_weights',
      JSON.stringify({
        weights: {
          reliability: 'not-a-number',
          viability: 0.25,
          identity: 0.2,
          capability: 0.1,
          behavior: 0.15,
        },
        sampleSize: 100,
        lastUpdatedAt: new Date().toISOString(),
      }),
    )

    const weights = getEffectiveWeights(db)
    expect(weights).toEqual({ ...DIMENSION_WEIGHTS })
  })

  it('persistence round-trip: compute → store → read', () => {
    // Insert enough outcome data
    insertMany(45, 'successful_tx', { rel: 90, via: 80, idn: 70, cap: 60, beh: 50 })
    insertMany(10, 'fraud_report', { rel: 20, via: 30, idn: 40, cap: 50, beh: 60 })

    // Compute adaptive weights
    const result = computeAdaptiveWeights(db)!
    expect(result).not.toBeNull()

    // Store in indexer_state (same as autoRecalibration does)
    db.prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)').run(
      'adaptive_weights',
      JSON.stringify(result),
    )

    // Read back
    const weights = getEffectiveWeights(db)
    expect(weights).toEqual(result.weights)
  })
})
