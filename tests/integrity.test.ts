import { describe, expect, it } from 'vitest'

// computeIntegrityMultiplier is a pure function — no mocks needed!
import { computeIntegrityMultiplier, GAMING_FACTORS, SYBIL_FACTORS } from '../src/scoring/integrity.js'

describe('computeIntegrityMultiplier', () => {
  it('returns 1.0 with no indicators', () => {
    const result = computeIntegrityMultiplier([], [], 0)
    expect(result).toBe(1.0)
  })

  it('applies sybil factors', () => {
    const result = computeIntegrityMultiplier(['coordinated_creation'], [], 0)
    expect(result).toBeCloseTo(0.65)
  })

  it('applies gaming factors', () => {
    const result = computeIntegrityMultiplier([], ['balance_window_dressing'], 0)
    expect(result).toBeCloseTo(0.85)
  })

  it('multiplies multiple factors together', () => {
    const result = computeIntegrityMultiplier(['coordinated_creation', 'single_source_funding'], ['burst_and_stop'], 0)
    // 0.65 * 0.75 * 0.80 = 0.39
    expect(result).toBeCloseTo(0.39, 1)
  })

  it('applies fraud report dampening', () => {
    const result = computeIntegrityMultiplier([], [], 3)
    // pow(0.90, 3) = 0.729
    expect(result).toBeCloseTo(0.729)
  })

  it('floors at 0.10', () => {
    const result = computeIntegrityMultiplier(
      ['self_funding_loop', 'coordinated_creation', 'zero_organic_activity'],
      ['nonce_inflation', 'artificial_partner_diversity', 'wash_trading'],
      5,
    )
    expect(result).toBeGreaterThanOrEqual(0.1)
  })
})

describe('factor lookup tables', () => {
  it('SYBIL_FACTORS does not contain wash_trading (only gaming.ts emits it)', () => {
    expect(SYBIL_FACTORS).not.toHaveProperty('wash_trading')
  })

  it('GAMING_FACTORS contains wash_trading', () => {
    expect(GAMING_FACTORS).toHaveProperty('wash_trading')
    expect(GAMING_FACTORS.wash_trading).toBe(0.5)
  })

  it('unknown indicators use default fallback', () => {
    // Unknown sybil → 0.80, unknown gaming → 0.85
    const result = computeIntegrityMultiplier(['unknown_sybil'], ['unknown_gaming'], 0)
    expect(result).toBeCloseTo(0.8 * 0.85) // 0.68
  })
})
