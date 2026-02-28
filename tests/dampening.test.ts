/**
 * Confidence-Weighted Dampening Tests
 *
 * Verifies applyConfidenceDampening() — the function that prevents
 * high-confidence scores from swinging wildly between calculations
 * while letting low-confidence scores converge freely.
 *
 * Pure function tests (no DB needed).
 */

import { describe, expect, it } from 'vitest'
import { DAMPENING_CONFIG } from '../src/config/constants.js'
import { applyConfidenceDampening, type DampeningInput } from '../src/scoring/dampening.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dampen(overrides: Partial<DampeningInput> = {}) {
  return applyConfidenceDampening({
    newScore: 60,
    previousScore: 50,
    confidence: 0.5,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// No previous score (first calculation)
// ---------------------------------------------------------------------------

describe('applyConfidenceDampening — first calculation', () => {
  it('passes through unchanged when no previous score', () => {
    const result = dampen({ newScore: 72, previousScore: null, confidence: 0.9 })
    expect(result.finalScore).toBe(72)
    expect(result.maxDelta).toBe(0)
    expect(result.actualDelta).toBe(0)
    expect(result.wasDampened).toBe(false)
  })

  it('clamps to [0, 100] on first calculation', () => {
    expect(dampen({ newScore: 105, previousScore: null }).finalScore).toBe(100)
    expect(dampen({ newScore: -5, previousScore: null }).finalScore).toBe(0)
  })

  it('rounds to nearest integer on first calculation', () => {
    expect(dampen({ newScore: 72.7, previousScore: null }).finalScore).toBe(73)
    expect(dampen({ newScore: 72.3, previousScore: null }).finalScore).toBe(72)
  })
})

// ---------------------------------------------------------------------------
// Low confidence (0.0) — free to swing
// ---------------------------------------------------------------------------

describe('applyConfidenceDampening — low confidence', () => {
  it('allows large positive swing at confidence=0.0', () => {
    const result = dampen({ newScore: 80, previousScore: 50, confidence: 0.0 })
    // maxDelta should be MAX_DELTA_LOW_CONF (30)
    expect(result.maxDelta).toBe(DAMPENING_CONFIG.MAX_DELTA_LOW_CONF)
    expect(result.finalScore).toBe(80) // delta=30 fits within maxDelta=30
    expect(result.wasDampened).toBe(false)
  })

  it('allows large negative swing at confidence=0.0', () => {
    const result = dampen({ newScore: 20, previousScore: 50, confidence: 0.0 })
    expect(result.finalScore).toBe(20) // delta=-30 fits within maxDelta=30
    expect(result.wasDampened).toBe(false)
  })

  it('clamps swing exceeding maxDelta at confidence=0.0', () => {
    const result = dampen({ newScore: 90, previousScore: 50, confidence: 0.0 })
    // rawDelta=40 > maxDelta=30, so clamped to prev+30=80
    expect(result.finalScore).toBe(80)
    expect(result.wasDampened).toBe(true)
    expect(result.actualDelta).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// High confidence (1.0) — sticky
// ---------------------------------------------------------------------------

describe('applyConfidenceDampening — high confidence', () => {
  it('restricts swing to MAX_DELTA_HIGH_CONF at confidence=1.0', () => {
    const result = dampen({ newScore: 80, previousScore: 50, confidence: 1.0 })
    // maxDelta should be MAX_DELTA_HIGH_CONF (8)
    expect(result.maxDelta).toBe(DAMPENING_CONFIG.MAX_DELTA_HIGH_CONF)
    expect(result.finalScore).toBe(58) // prev + 8
    expect(result.wasDampened).toBe(true)
  })

  it('allows small change within maxDelta at confidence=1.0', () => {
    const result = dampen({ newScore: 55, previousScore: 50, confidence: 1.0 })
    expect(result.finalScore).toBe(55) // delta=5 < maxDelta=8
    expect(result.wasDampened).toBe(false)
  })

  it('restricts negative swing at confidence=1.0', () => {
    const result = dampen({ newScore: 30, previousScore: 50, confidence: 1.0 })
    expect(result.finalScore).toBe(42) // prev - 8
    expect(result.wasDampened).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Mid confidence (0.5) — interpolated maxDelta
// ---------------------------------------------------------------------------

describe('applyConfidenceDampening — mid confidence', () => {
  it('interpolates maxDelta at confidence=0.5', () => {
    const result = dampen({ newScore: 60, previousScore: 50, confidence: 0.5 })
    // maxDelta = 30 + 0.5 * (8 - 30) = 30 - 11 = 19
    expect(result.maxDelta).toBe(19)
    expect(result.finalScore).toBe(60) // delta=10 < maxDelta=19
    expect(result.wasDampened).toBe(false)
  })

  it('clamps at interpolated maxDelta when exceeded', () => {
    const result = dampen({ newScore: 80, previousScore: 50, confidence: 0.5 })
    // maxDelta = 19, rawDelta = 30, clamped to prev+19=69
    expect(result.finalScore).toBe(69)
    expect(result.wasDampened).toBe(true)
    expect(result.actualDelta).toBe(19)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('applyConfidenceDampening — edge cases', () => {
  it('no change when newScore equals previousScore', () => {
    const result = dampen({ newScore: 50, previousScore: 50, confidence: 0.8 })
    expect(result.finalScore).toBe(50)
    expect(result.actualDelta).toBe(0)
    expect(result.wasDampened).toBe(false)
  })

  it('clamps final score to 0 floor', () => {
    const result = dampen({ newScore: -10, previousScore: 5, confidence: 0.0 })
    expect(result.finalScore).toBe(0) // clamped to floor
  })

  it('clamps final score to 100 ceiling', () => {
    const result = dampen({ newScore: 120, previousScore: 95, confidence: 0.0 })
    expect(result.finalScore).toBe(100) // clamped to ceiling
  })

  it('handles confidence out of bounds (clamped internally)', () => {
    // Confidence > 1 → treated as 1.0
    const overConf = dampen({ newScore: 80, previousScore: 50, confidence: 1.5 })
    expect(overConf.maxDelta).toBe(DAMPENING_CONFIG.MAX_DELTA_HIGH_CONF)

    // Confidence < 0 → treated as 0.0
    const underConf = dampen({ newScore: 80, previousScore: 50, confidence: -0.3 })
    expect(underConf.maxDelta).toBe(DAMPENING_CONFIG.MAX_DELTA_LOW_CONF)
  })

  it('wasDampened is accurate for exactly-at-boundary swing', () => {
    // rawDelta exactly equals maxDelta → NOT dampened (boundary is inclusive)
    const result = dampen({
      newScore: 50 + DAMPENING_CONFIG.MAX_DELTA_LOW_CONF,
      previousScore: 50,
      confidence: 0.0,
    })
    expect(result.wasDampened).toBe(false)
    expect(result.finalScore).toBe(80) // 50 + 30
  })

  it('previousScore at 0 with improvement', () => {
    const result = dampen({ newScore: 25, previousScore: 0, confidence: 1.0 })
    // maxDelta=8, rawDelta=25, clamped to 0+8=8
    expect(result.finalScore).toBe(8)
    expect(result.wasDampened).toBe(true)
  })

  it('previousScore at 100 with decline', () => {
    const result = dampen({ newScore: 70, previousScore: 100, confidence: 1.0 })
    // maxDelta=8, rawDelta=-30, clamped to 100-8=92
    expect(result.finalScore).toBe(92)
    expect(result.wasDampened).toBe(true)
  })
})
