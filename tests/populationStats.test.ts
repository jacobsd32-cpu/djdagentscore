/**
 * Population Statistics Tests
 *
 * Verifies computePopulationStats(), getCachedPopulationStats(), and
 * getPercentileRank() — functions that compute & retrieve dimension
 * distributions across all scored wallets for adaptive breakpoints.
 *
 * Uses in-memory SQLite to test DB reads and cache round-trips.
 */

import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { POPULATION_CONFIG } from '../src/config/constants.js'
import {
  computePopulationStats,
  type DimensionStats,
  getCachedPopulationStats,
  getPercentileRank,
} from '../src/scoring/populationStats.js'
import { createTestDb } from './helpers/testDb.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
})

/** Insert a score row with given dimension scores. */
function insertScore(
  wallet: string,
  composite: number,
  reliability: number,
  viability: number,
  identity: number,
  capability: number,
): void {
  db.prepare(
    `INSERT INTO scores (wallet, composite_score, reliability_score, viability_score,
     identity_score, capability_score, tier, raw_data, calculated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Emerging', '{}', datetime('now'), datetime('now', '+1 day'))`,
  ).run(wallet, composite, reliability, viability, identity, capability)
}

/** Insert N wallets with linearly distributed scores. */
function insertLinearScores(n: number): void {
  for (let i = 0; i < n; i++) {
    const score = Math.round((i / (n - 1)) * 100) // 0 to 100
    insertScore(`0x${i.toString(16).padStart(40, '0')}`, score, score, score, score, score)
  }
}

// ---------------------------------------------------------------------------
// computePopulationStats()
// ---------------------------------------------------------------------------

describe('computePopulationStats', () => {
  it('returns null when fewer than MIN_SAMPLE_SIZE wallets exist', () => {
    // Insert fewer than threshold (50)
    for (let i = 0; i < POPULATION_CONFIG.MIN_SAMPLE_SIZE - 1; i++) {
      insertScore(`0x${i.toString(16).padStart(40, '0')}`, 50, 50, 50, 50, 50)
    }

    const result = computePopulationStats(db)
    expect(result).toBeNull()
  })

  it('returns stats when exactly MIN_SAMPLE_SIZE wallets exist', () => {
    for (let i = 0; i < POPULATION_CONFIG.MIN_SAMPLE_SIZE; i++) {
      insertScore(`0x${i.toString(16).padStart(40, '0')}`, 50, 50, 50, 50, 50)
    }

    const result = computePopulationStats(db)
    expect(result).not.toBeNull()
    expect(result!.sampleSize).toBe(POPULATION_CONFIG.MIN_SAMPLE_SIZE)
  })

  it('computes correct percentiles for a known linear distribution', () => {
    // 101 wallets with scores 0, 1, 2, ... 100 (linear distribution)
    insertLinearScores(101)

    const result = computePopulationStats(db)
    expect(result).not.toBeNull()

    // For a uniform 0-100 distribution, percentiles should be close to their values
    expect(result!.composite.p10).toBe(10)
    expect(result!.composite.p25).toBe(25)
    expect(result!.composite.p50).toBe(50)
    expect(result!.composite.p75).toBe(75)
    expect(result!.composite.p90).toBe(90)
  })

  it('computes correct mean and stdev', () => {
    // 5 wallets with known values: 10, 20, 30, 40, 50
    for (let i = 0; i < POPULATION_CONFIG.MIN_SAMPLE_SIZE; i++) {
      const score = ((i % 5) + 1) * 10 // cycles through 10,20,30,40,50
      insertScore(`0x${i.toString(16).padStart(40, '0')}`, score, score, score, score, score)
    }

    const result = computePopulationStats(db)
    expect(result).not.toBeNull()
    // Mean of 10,20,30,40,50 repeated 10 times = 30
    expect(result!.composite.mean).toBe(30)
    // Stdev: sqrt(200) ≈ 14.14
    expect(result!.composite.stdev).toBeCloseTo(14.14, 1)
  })

  it('includes computedAt timestamp', () => {
    insertLinearScores(POPULATION_CONFIG.MIN_SAMPLE_SIZE)
    const result = computePopulationStats(db)
    expect(result!.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('computes stats for all dimensions independently', () => {
    // Insert wallets where each dimension has different score distributions
    for (let i = 0; i < 100; i++) {
      insertScore(
        `0x${i.toString(16).padStart(40, '0')}`,
        50, // composite: constant
        i, // reliability: 0-99
        100 - i, // viability: 100-1
        50, // identity: constant
        i * 0.5, // capability: 0-49.5
      )
    }

    const result = computePopulationStats(db)
    expect(result).not.toBeNull()

    // Reliability and viability should have similar spreads (mirror images)
    expect(result!.reliability.stdev).toBeGreaterThan(20)
    expect(result!.viability.stdev).toBeGreaterThan(20)

    // Identity constant at 50 → stdev ≈ 0
    expect(result!.identity.stdev).toBe(0)

    // Capability should have half the range
    expect(result!.capability.p50).toBeLessThan(result!.reliability.p50)
  })
})

// ---------------------------------------------------------------------------
// getCachedPopulationStats()
// ---------------------------------------------------------------------------

describe('getCachedPopulationStats', () => {
  it('returns null when no cached stats exist', () => {
    expect(getCachedPopulationStats(db)).toBeNull()
  })

  it('round-trips through indexer_state correctly', () => {
    insertLinearScores(101)
    const computed = computePopulationStats(db)!

    // Persist to indexer_state (same as autoRecalibration does)
    db.prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)').run(
      'population_stats',
      JSON.stringify(computed),
    )

    const cached = getCachedPopulationStats(db)
    expect(cached).not.toBeNull()
    expect(cached!.sampleSize).toBe(computed.sampleSize)
    expect(cached!.composite.p50).toBe(computed.composite.p50)
    expect(cached!.reliability.mean).toBe(computed.reliability.mean)
    expect(cached!.computedAt).toBe(computed.computedAt)
  })

  it('returns null on malformed JSON', () => {
    db.prepare('INSERT INTO indexer_state (key, value) VALUES (?, ?)').run('population_stats', 'not valid json{{{')

    expect(getCachedPopulationStats(db)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getPercentileRank()
// ---------------------------------------------------------------------------

describe('getPercentileRank', () => {
  const stats: DimensionStats = {
    mean: 50,
    stdev: 20,
    p10: 20,
    p25: 35,
    p50: 50,
    p75: 65,
    p90: 80,
  }

  it('returns ~50 for a score at the median', () => {
    expect(getPercentileRank(50, stats)).toBe(50)
  })

  it('returns ~25 for a score at p25', () => {
    expect(getPercentileRank(35, stats)).toBe(25)
  })

  it('returns ~75 for a score at p75', () => {
    expect(getPercentileRank(65, stats)).toBe(75)
  })

  it('returns ~90 for a score at p90', () => {
    expect(getPercentileRank(80, stats)).toBe(90)
  })

  it('interpolates between percentile breakpoints', () => {
    // Midpoint between p25 (35) and p50 (50) → should be ~37.5 percentile
    const midScore = (35 + 50) / 2 // 42.5
    const rank = getPercentileRank(midScore, stats)
    expect(rank).toBeGreaterThanOrEqual(25)
    expect(rank).toBeLessThanOrEqual(50)
    // Linear interpolation: t = (42.5 - 35) / (50 - 35) = 0.5 → rank = 25 + 0.5 * 25 = 37.5 → rounds to 38
    expect(rank).toBe(38)
  })

  it('returns near 0 for scores well below p10', () => {
    expect(getPercentileRank(0, stats)).toBe(0)
    expect(getPercentileRank(5, stats)).toBeLessThanOrEqual(5)
  })

  it('returns near 100 for scores well above p90', () => {
    expect(getPercentileRank(100, stats)).toBeGreaterThanOrEqual(95)
    expect(getPercentileRank(100, stats)).toBeLessThanOrEqual(100)
  })

  it('handles edge case where all percentiles are the same', () => {
    const flat: DimensionStats = {
      mean: 50,
      stdev: 0,
      p10: 50,
      p25: 50,
      p50: 50,
      p75: 50,
      p90: 50,
    }

    // Score at the median — below p10 branch will return (50/50)*10 = 10
    const rank = getPercentileRank(50, flat)
    expect(rank).toBeGreaterThanOrEqual(0)
    expect(rank).toBeLessThanOrEqual(100)
  })
})
