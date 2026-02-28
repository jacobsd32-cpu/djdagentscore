/**
 * Adaptive Breakpoints Tests
 *
 * Verifies maturityFactor() and computeAdaptedBreakpoints() — pure functions
 * that shift dimension scoring curves upward as the ecosystem matures.
 *
 * No DB needed: inputs are PopulationStats, outputs are adapted breakpoint arrays.
 */
import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_BREAKPOINTS,
  POPULATION_CONFIG,
  RELIABILITY_BREAKPOINTS,
  VIABILITY_BREAKPOINTS,
} from '../src/config/constants.js'
import { computeAdaptedBreakpoints, maturityFactor } from '../src/scoring/adaptiveBreakpoints.js'
import type { DimensionStats, PopulationStats } from '../src/scoring/populationStats.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDimStats(overrides: Partial<DimensionStats> = {}): DimensionStats {
  return {
    mean: 40,
    stdev: 15,
    p10: 10,
    p25: 25,
    p50: 40,
    p75: 60,
    p90: 80,
    ...overrides,
  }
}

function makePopStats(
  overrides: {
    reliability?: Partial<DimensionStats>
    viability?: Partial<DimensionStats>
    capability?: Partial<DimensionStats>
    composite?: Partial<DimensionStats>
    identity?: Partial<DimensionStats>
  } = {},
): PopulationStats {
  return {
    composite: makeDimStats(overrides.composite),
    reliability: makeDimStats(overrides.reliability),
    viability: makeDimStats(overrides.viability),
    identity: makeDimStats(overrides.identity),
    capability: makeDimStats(overrides.capability),
    sampleSize: 200,
    computedAt: '2025-06-15T00:00:00.000Z',
  }
}

// ---------------------------------------------------------------------------
// maturityFactor()
// ---------------------------------------------------------------------------

describe('maturityFactor', () => {
  const baseline = POPULATION_CONFIG.MATURITY_BASELINE // 25
  const ceiling = POPULATION_CONFIG.MATURITY_CEILING // 65

  it('returns 0 when median is at or below baseline', () => {
    expect(maturityFactor(25, baseline, ceiling)).toBe(0)
    expect(maturityFactor(10, baseline, ceiling)).toBe(0)
    expect(maturityFactor(0, baseline, ceiling)).toBe(0)
  })

  it('returns 1 when median is at or above ceiling', () => {
    expect(maturityFactor(65, baseline, ceiling)).toBe(1)
    expect(maturityFactor(80, baseline, ceiling)).toBe(1)
  })

  it('returns 0.5 when median is halfway between baseline and ceiling', () => {
    const midpoint = (baseline + ceiling) / 2 // 45
    expect(maturityFactor(midpoint, baseline, ceiling)).toBe(0.5)
  })

  it('returns correct interpolation for arbitrary value', () => {
    // median=35, baseline=25, ceiling=65 → (35-25)/(65-25) = 10/40 = 0.25
    expect(maturityFactor(35, baseline, ceiling)).toBe(0.25)
  })

  it('handles degenerate case where ceiling <= baseline', () => {
    expect(maturityFactor(50, 65, 25)).toBe(0)
    expect(maturityFactor(50, 50, 50)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeAdaptedBreakpoints()
// ---------------------------------------------------------------------------

describe('computeAdaptedBreakpoints', () => {
  it('returns breakpoints for all expected dimensions', () => {
    const result = computeAdaptedBreakpoints(makePopStats())

    expect(result.reliability).toHaveProperty('txCount')
    expect(result.reliability).toHaveProperty('nonce')
    expect(result.viability).toHaveProperty('walletAge')
    expect(result.capability).toHaveProperty('revenue')
    expect(result.capability).toHaveProperty('counterparties')
    expect(result.capability).toHaveProperty('longevity')
  })

  it('does not shift breakpoints when maturity factor is 0 (early ecosystem)', () => {
    // p50 at or below baseline (25) → factor = 0 → no shift
    const stats = makePopStats({
      reliability: { p50: 20 },
      viability: { p50: 10 },
      capability: { p50: 25 },
    })

    const result = computeAdaptedBreakpoints(stats)

    // Adapted should equal originals since factor = 0
    const originalTxCount = RELIABILITY_BREAKPOINTS.txCount as unknown as Array<[number, number]>
    for (let i = 0; i < originalTxCount.length; i++) {
      expect(result.reliability.txCount[i][0]).toBe(originalTxCount[i][0])
      expect(result.reliability.txCount[i][1]).toBe(originalTxCount[i][1])
    }
  })

  it('shifts breakpoint inputs upward when maturity factor > 0', () => {
    // p50 = 45 → factor = (45-25)/(65-25) = 0.5
    // shift = input × (1 + 0.5 × 0.3) = input × 1.15
    const stats = makePopStats({
      reliability: { p50: 45 },
    })

    const result = computeAdaptedBreakpoints(stats)
    const originalTxCount = RELIABILITY_BREAKPOINTS.txCount as unknown as Array<[number, number]>

    for (let i = 0; i < originalTxCount.length; i++) {
      const [origInput, origOutput] = originalTxCount[i]
      const [adaptedInput, adaptedOutput] = result.reliability.txCount[i]

      // Output points are never changed
      expect(adaptedOutput).toBe(origOutput)

      // Input thresholds shift up (or stay at 0 for the origin anchor)
      if (origInput === 0) {
        expect(adaptedInput).toBe(0)
      } else {
        expect(adaptedInput).toBeGreaterThanOrEqual(origInput)
        // With factor=0.5 and MAX_SHIFT_RATIO=0.3: expected = input × 1.15
        const expected = Math.round(origInput * 1.15 * 100) / 100
        expect(adaptedInput).toBe(expected)
      }
    }
  })

  it('shifts maximum when maturity factor is 1 (mature ecosystem)', () => {
    // p50 = 65+ → factor = 1.0
    // shift = input × (1 + 1.0 × 0.3) = input × 1.3
    const stats = makePopStats({
      capability: { p50: 70 },
    })

    const result = computeAdaptedBreakpoints(stats)
    const originalRevenue = CAPABILITY_BREAKPOINTS.revenue as unknown as Array<[number, number]>

    for (const [i, [origInput]] of originalRevenue.entries()) {
      const adaptedInput = result.capability.revenue[i][0]
      if (origInput === 0) {
        expect(adaptedInput).toBe(0)
      } else {
        const expected = Math.round(origInput * 1.3 * 100) / 100
        expect(adaptedInput).toBe(expected)
      }
    }
  })

  it('never shifts input below original value (floor enforcement)', () => {
    // Even with weird stats, adapted inputs >= originals
    const stats = makePopStats({
      reliability: { p50: 30 },
      viability: { p50: 30 },
      capability: { p50: 30 },
    })

    const result = computeAdaptedBreakpoints(stats)
    const origNonce = RELIABILITY_BREAKPOINTS.nonce as unknown as Array<[number, number]>

    for (let i = 0; i < origNonce.length; i++) {
      expect(result.reliability.nonce[i][0]).toBeGreaterThanOrEqual(origNonce[i][0])
    }
  })

  it('preserves output points exactly (y-axis never changes)', () => {
    const stats = makePopStats({
      reliability: { p50: 55 },
      viability: { p50: 55 },
      capability: { p50: 55 },
    })

    const result = computeAdaptedBreakpoints(stats)

    // Check all dimension breakpoints preserve y-values
    const origTxCount = RELIABILITY_BREAKPOINTS.txCount as unknown as Array<[number, number]>
    for (let i = 0; i < origTxCount.length; i++) {
      expect(result.reliability.txCount[i][1]).toBe(origTxCount[i][1])
    }

    const origWalletAge = VIABILITY_BREAKPOINTS.walletAge as unknown as Array<[number, number]>
    for (let i = 0; i < origWalletAge.length; i++) {
      expect(result.viability.walletAge[i][1]).toBe(origWalletAge[i][1])
    }

    const origLongevity = CAPABILITY_BREAKPOINTS.longevity as unknown as Array<[number, number]>
    for (let i = 0; i < origLongevity.length; i++) {
      expect(result.capability.longevity[i][1]).toBe(origLongevity[i][1])
    }
  })

  it('adapts each dimension independently based on its own maturity', () => {
    const stats = makePopStats({
      reliability: { p50: 25 }, // factor = 0 (no shift)
      viability: { p50: 65 }, // factor = 1.0 (max shift)
      capability: { p50: 45 }, // factor = 0.5 (mid shift)
    })

    const result = computeAdaptedBreakpoints(stats)

    // Reliability: no shift (factor=0)
    const origTx = RELIABILITY_BREAKPOINTS.txCount as unknown as Array<[number, number]>
    for (let i = 0; i < origTx.length; i++) {
      expect(result.reliability.txCount[i][0]).toBe(origTx[i][0])
    }

    // Viability: max shift (factor=1.0) — walletAge input × 1.3
    const origWA = VIABILITY_BREAKPOINTS.walletAge as unknown as Array<[number, number]>
    for (const [i, [origInput]] of origWA.entries()) {
      if (origInput > 0) {
        expect(result.viability.walletAge[i][0]).toBe(Math.round(origInput * 1.3 * 100) / 100)
      }
    }

    // Capability: mid shift (factor=0.5) — revenue input × 1.15
    const origRev = CAPABILITY_BREAKPOINTS.revenue as unknown as Array<[number, number]>
    for (const [i, [origInput]] of origRev.entries()) {
      if (origInput > 0) {
        expect(result.capability.revenue[i][0]).toBe(Math.round(origInput * 1.15 * 100) / 100)
      }
    }
  })

  it('maintains monotonicity of adapted breakpoints', () => {
    const stats = makePopStats({
      reliability: { p50: 60 },
      viability: { p50: 60 },
      capability: { p50: 60 },
    })

    const result = computeAdaptedBreakpoints(stats)

    // Check that inputs remain in ascending order
    for (let i = 1; i < result.reliability.txCount.length; i++) {
      expect(result.reliability.txCount[i][0]).toBeGreaterThanOrEqual(result.reliability.txCount[i - 1][0])
    }
    for (let i = 1; i < result.capability.counterparties.length; i++) {
      expect(result.capability.counterparties[i][0]).toBeGreaterThanOrEqual(result.capability.counterparties[i - 1][0])
    }
  })
})
