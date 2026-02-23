import { describe, it, expect } from 'vitest'
import { computeIntegrityMultiplier } from '../src/scoring/engine.js'

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
    const result = computeIntegrityMultiplier(
      ['coordinated_creation', 'single_source_funding'],
      ['burst_and_stop'],
      0,
    )
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
      ['wash_trading', 'self_funding_loop', 'coordinated_creation', 'zero_organic_activity'],
      ['nonce_inflation', 'artificial_partner_diversity'],
      5,
    )
    expect(result).toBeGreaterThanOrEqual(0.10)
  })
})
