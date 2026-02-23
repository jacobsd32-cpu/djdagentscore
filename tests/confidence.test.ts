/**
 * Confidence Score Tests
 *
 * calcConfidence() is a pure function — no DB, no RPC, no side effects.
 * We can test exhaustively across boundary conditions.
 *
 * Formula: txSignal×0.25 + ageSignal×0.25 + partnerSignal×0.20 + ratingSignal×0.15 + querySignal×0.15
 */
import { describe, it, expect } from 'vitest'
import { calcConfidence } from '../src/scoring/confidence.js'

describe('calcConfidence', () => {
  // ── Zero inputs ─────────────────────────────────────────────────────────
  it('returns 0.0 for a brand-new wallet with no data', () => {
    const result = calcConfidence({
      txCount: 0,
      walletAgeDays: 0,
      uniquePartners: 0,
      ratingCount: 0,
      priorQueryCount: 0,
    })
    expect(result).toBe(0.0)
  })

  // ── Maximum inputs ──────────────────────────────────────────────────────
  it('returns 1.0 for a mature wallet with full data', () => {
    const result = calcConfidence({
      txCount: 200,
      walletAgeDays: 120,
      uniquePartners: 50,
      ratingCount: 20,
      priorQueryCount: 20,
    })
    expect(result).toBe(1.0)
  })

  // ── Individual signal boundaries ────────────────────────────────────────
  it('scales txCount signal correctly at key thresholds', () => {
    const base = { walletAgeDays: 0, uniquePartners: 0, ratingCount: 0, priorQueryCount: 0 }

    // txCount = 0 → 0.0 × 0.25 = 0.0
    expect(calcConfidence({ ...base, txCount: 0 })).toBe(0.0)

    // txCount = 5 → 0.3 × 0.25 = 0.075 → rounds to 0.08
    expect(calcConfidence({ ...base, txCount: 5 })).toBeCloseTo(0.08, 1)

    // txCount = 20 → 0.6 × 0.25 = 0.15
    expect(calcConfidence({ ...base, txCount: 20 })).toBe(0.15)

    // txCount = 100 → 1.0 × 0.25 = 0.25
    expect(calcConfidence({ ...base, txCount: 100 })).toBe(0.25)
  })

  it('scales walletAge signal correctly at key thresholds', () => {
    const base = { txCount: 0, uniquePartners: 0, ratingCount: 0, priorQueryCount: 0 }

    // < 1 day → 0.0
    expect(calcConfidence({ ...base, walletAgeDays: 0.5 })).toBe(0.0)

    // 7 days → 0.4 × 0.25 = 0.10
    expect(calcConfidence({ ...base, walletAgeDays: 7 })).toBe(0.1)

    // 30 days → 0.7 × 0.25 = 0.175 → rounds to 0.18
    expect(calcConfidence({ ...base, walletAgeDays: 30 })).toBeCloseTo(0.18, 1)

    // 90+ days → 1.0 × 0.25 = 0.25
    expect(calcConfidence({ ...base, walletAgeDays: 90 })).toBe(0.25)
  })

  it('scales uniquePartners signal correctly', () => {
    const base = { txCount: 0, walletAgeDays: 0, ratingCount: 0, priorQueryCount: 0 }

    // 0 partners → 0.0
    expect(calcConfidence({ ...base, uniquePartners: 0 })).toBe(0.0)

    // 10 partners → 0.6 × 0.20 = 0.12
    expect(calcConfidence({ ...base, uniquePartners: 10 })).toBe(0.12)

    // 30+ partners → 1.0 × 0.20 = 0.20
    expect(calcConfidence({ ...base, uniquePartners: 30 })).toBe(0.2)
  })

  it('handles rating and query count step functions', () => {
    const base = { txCount: 0, walletAgeDays: 0, uniquePartners: 0 }

    // ratingCount=0, queryCount=0 → 0+0 = 0
    expect(calcConfidence({ ...base, ratingCount: 0, priorQueryCount: 0 })).toBe(0.0)

    // ratingCount=5 (→0.5), queryCount=5 (→0.5) → 0.5*0.15 + 0.5*0.15 = 0.15
    expect(calcConfidence({ ...base, ratingCount: 5, priorQueryCount: 5 })).toBe(0.15)

    // ratingCount=10+ (→1.0), queryCount=10+ (→1.0) → 1.0*0.15 + 1.0*0.15 = 0.30
    expect(calcConfidence({ ...base, ratingCount: 10, priorQueryCount: 10 })).toBe(0.3)
  })

  // ── Realistic mid-range wallet ──────────────────────────────────────────
  it('produces a reasonable mid-range confidence for a typical wallet', () => {
    const result = calcConfidence({
      txCount: 25, // ~0.625
      walletAgeDays: 45, // ~0.775
      uniquePartners: 8, // ~0.514
      ratingCount: 0, // 0 (mutual ratings removed)
      priorQueryCount: 3, // 0.5
    })
    // Should be moderate confidence, roughly 0.3-0.5 range
    expect(result).toBeGreaterThan(0.25)
    expect(result).toBeLessThan(0.55)
  })

  // ── Output bounds ───────────────────────────────────────────────────────
  it('always returns a value between 0.0 and 1.0', () => {
    // Even with extreme inputs, output is clamped
    const low = calcConfidence({
      txCount: -10,
      walletAgeDays: -5,
      uniquePartners: -1,
      ratingCount: -1,
      priorQueryCount: -1,
    })
    expect(low).toBeGreaterThanOrEqual(0.0)
    expect(low).toBeLessThanOrEqual(1.0)

    const high = calcConfidence({
      txCount: 999999,
      walletAgeDays: 999999,
      uniquePartners: 999999,
      ratingCount: 999999,
      priorQueryCount: 999999,
    })
    expect(high).toBe(1.0)
  })
})
