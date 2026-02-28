/**
 * Confidence Score Tests
 *
 * calcConfidence() is a pure function — no DB, no RPC, no side effects.
 * We can test exhaustively across boundary conditions.
 *
 * v2.5: ratingCount is deprecated (always 0). The 15% weight it held is now
 * allocated to trajectoryStability — derived from score history volatility.
 *
 * Formula: txSignal×0.25 + ageSignal×0.25 + partnerSignal×0.20 + stabilitySignal×0.15 + querySignal×0.15
 */
import { describe, expect, it } from 'vitest'
import { calcConfidence } from '../src/scoring/confidence.js'

// Helper: default inputs with all zeros (stability defaults to 0.5 when no volatility)
function conf(overrides: Partial<Parameters<typeof calcConfidence>[0]> = {}) {
  return calcConfidence({
    txCount: 0,
    walletAgeDays: 0,
    uniquePartners: 0,
    ratingCount: 0,
    priorQueryCount: 0,
    ...overrides,
  })
}

describe('calcConfidence', () => {
  // ── Zero inputs ─────────────────────────────────────────────────────────
  it('returns stability baseline for a brand-new wallet with no data', () => {
    // All signals zero EXCEPT stability defaults to 0.5 (volatility null → 10 → 0.5)
    // 0 + 0 + 0 + 0.5*0.15 + 0 = 0.075 → rounds to 0.08
    const result = conf()
    expect(result).toBe(0.08)
  })

  it('returns 0.0 when all signals truly zero (volatility = 20)', () => {
    // volatility=20 → stabilitySignal = 1.0 - 20/20 = 0.0
    const result = conf({ trajectoryVolatility: 20 })
    expect(result).toBe(0.0)
  })

  // ── Maximum inputs ────────────────────────────────────────────────────
  it('returns 1.0 for a mature wallet with full data and stable trajectory', () => {
    const result = conf({
      txCount: 200,
      walletAgeDays: 120,
      uniquePartners: 50,
      priorQueryCount: 20,
      trajectoryVolatility: 0, // perfectly stable → 1.0 signal
    })
    expect(result).toBe(1.0)
  })

  // ── Individual signal boundaries ──────────────────────────────────────
  it('scales txCount signal correctly at key thresholds', () => {
    // Isolate txCount: set volatility=20 to zero out stability signal
    const base = {
      walletAgeDays: 0,
      uniquePartners: 0,
      priorQueryCount: 0,
      trajectoryVolatility: 20,
    }

    // txCount = 0 → 0.0 × 0.25 = 0.0
    expect(conf({ ...base, txCount: 0 })).toBe(0.0)

    // txCount = 5 → ~0.317 × 0.25 ≈ 0.08
    expect(conf({ ...base, txCount: 5 })).toBeCloseTo(0.08, 1)

    // txCount = 20 → 0.625 × 0.25 = 0.15625 → rounds to 0.16
    expect(conf({ ...base, txCount: 20 })).toBe(0.16)

    // txCount = 100 → 1.0 × 0.25 = 0.25
    expect(conf({ ...base, txCount: 100 })).toBe(0.25)
  })

  it('scales walletAge signal correctly at key thresholds', () => {
    const base = {
      txCount: 0,
      uniquePartners: 0,
      priorQueryCount: 0,
      trajectoryVolatility: 20,
    }

    // < 1 day → 0.0
    expect(conf({ ...base, walletAgeDays: 0.5 })).toBe(0.0)

    // 7 days → 0.4 × 0.25 = 0.10
    expect(conf({ ...base, walletAgeDays: 7 })).toBe(0.1)

    // 30 days → 0.7 × 0.25 = 0.175 → rounds to 0.18
    expect(conf({ ...base, walletAgeDays: 30 })).toBeCloseTo(0.18, 1)

    // 90+ days → 1.0 × 0.25 = 0.25
    expect(conf({ ...base, walletAgeDays: 90 })).toBe(0.25)
  })

  it('scales uniquePartners signal correctly', () => {
    const base = {
      txCount: 0,
      walletAgeDays: 0,
      priorQueryCount: 0,
      trajectoryVolatility: 20,
    }

    // 0 partners → 0.0
    expect(conf({ ...base, uniquePartners: 0 })).toBe(0.0)

    // 10 partners → 0.6 × 0.20 = 0.12
    expect(conf({ ...base, uniquePartners: 10 })).toBe(0.12)

    // 30+ partners → 1.0 × 0.20 = 0.20
    expect(conf({ ...base, uniquePartners: 30 })).toBe(0.2)
  })

  it('handles query count step function', () => {
    const base = {
      txCount: 0,
      walletAgeDays: 0,
      uniquePartners: 0,
      trajectoryVolatility: 20,
    }

    // queryCount=0 → 0.0
    expect(conf({ ...base, priorQueryCount: 0 })).toBe(0.0)

    // queryCount=5 → 0.5 × 0.15 = 0.075 → rounds to 0.08
    expect(conf({ ...base, priorQueryCount: 5 })).toBe(0.08)

    // queryCount=10+ → 1.0 × 0.15 = 0.15
    expect(conf({ ...base, priorQueryCount: 10 })).toBe(0.15)
  })

  // ── Stability signal (v2.5) ───────────────────────────────────────────
  describe('stability signal (trajectoryVolatility)', () => {
    const base = {
      txCount: 0,
      walletAgeDays: 0,
      uniquePartners: 0,
      priorQueryCount: 0,
    }

    it('null volatility defaults to neutral 0.5 signal', () => {
      // null → default vol=10, signal = 1.0 - 10/20 = 0.5
      // 0.5 × 0.15 = 0.075 → 0.08
      expect(conf({ ...base, trajectoryVolatility: null })).toBe(0.08)
    })

    it('undefined volatility defaults to neutral 0.5 signal', () => {
      // undefined → same as null
      expect(conf({ ...base })).toBe(0.08)
    })

    it('zero volatility (perfectly stable) yields 1.0 signal', () => {
      // signal = 1.0 - 0/20 = 1.0 → 1.0 × 0.15 = 0.15
      expect(conf({ ...base, trajectoryVolatility: 0 })).toBe(0.15)
    })

    it('volatility=20 yields 0.0 signal', () => {
      // signal = 1.0 - 20/20 = 0.0 → 0.0 × 0.15 = 0.0
      expect(conf({ ...base, trajectoryVolatility: 20 })).toBe(0.0)
    })

    it('volatility=10 yields 0.5 signal (same as null default)', () => {
      // signal = 1.0 - 10/20 = 0.5 → 0.5 × 0.15 = 0.075 → 0.08
      expect(conf({ ...base, trajectoryVolatility: 10 })).toBe(0.08)
    })

    it('volatility=5 (low) yields 0.75 signal', () => {
      // signal = 1.0 - 5/20 = 0.75 → 0.75 × 0.15 = 0.1125 → 0.11
      expect(conf({ ...base, trajectoryVolatility: 5 })).toBe(0.11)
    })

    it('volatility > 20 is clamped (signal never goes negative)', () => {
      // signal = 1.0 - min(1.0, 50/20) = 1.0 - 1.0 = 0.0
      expect(conf({ ...base, trajectoryVolatility: 50 })).toBe(0.0)
    })

    it('negative volatility is treated as 0 (max stability)', () => {
      // vol = max(0, -5) = 0, signal = 1.0
      expect(conf({ ...base, trajectoryVolatility: -5 })).toBe(0.15)
    })
  })

  // ── ratingCount is ignored ────────────────────────────────────────────
  it('ignores ratingCount (deprecated)', () => {
    const a = conf({ ratingCount: 0 })
    const b = conf({ ratingCount: 100 })
    expect(a).toBe(b) // same result regardless of ratingCount
  })

  // ── Realistic mid-range wallet ────────────────────────────────────────
  it('produces a reasonable mid-range confidence for a typical wallet', () => {
    const result = conf({
      txCount: 25, // ~0.625
      walletAgeDays: 45, // ~0.775
      uniquePartners: 8, // ~0.514
      priorQueryCount: 3, // 0.5
      trajectoryVolatility: 8, // signal = 0.6
    })
    // Should be moderate-to-high confidence, roughly 0.4-0.7 range
    // (stability signal with vol=8 contributes ~0.09, more than old ratingCount=0)
    expect(result).toBeGreaterThan(0.4)
    expect(result).toBeLessThan(0.7)
  })

  // ── Output bounds ─────────────────────────────────────────────────────
  it('always returns a value between 0.0 and 1.0', () => {
    // Even with extreme inputs, output is clamped
    const low = conf({
      txCount: -10,
      walletAgeDays: -5,
      uniquePartners: -1,
      priorQueryCount: -1,
      trajectoryVolatility: 100,
    })
    expect(low).toBeGreaterThanOrEqual(0.0)
    expect(low).toBeLessThanOrEqual(1.0)

    const high = conf({
      txCount: 999999,
      walletAgeDays: 999999,
      uniquePartners: 999999,
      priorQueryCount: 999999,
      trajectoryVolatility: 0,
    })
    expect(high).toBe(1.0)
  })
})
