/**
 * Detection Adjustment Tests
 *
 * Verifies that applyDetectionAdjustments() correctly applies sybil caps
 * and gaming penalties to raw dimension scores. Pure function — no DB needed.
 */
import { describe, expect, it } from 'vitest'
import { applyDetectionAdjustments, type RawDimensionScores } from '../src/scoring/caps.js'
import type { GamingResult } from '../src/scoring/gaming.js'
import type { SybilResult } from '../src/scoring/sybil.js'

const baseRaw: RawDimensionScores = {
  reliability: 80,
  viability: 70,
  identity: 60,
  capability: 50,
  behavior: 40,
}

const cleanSybil: SybilResult = { sybilFlag: false, indicators: [], caps: {} }
const cleanGaming: GamingResult = {
  gamingDetected: false,
  indicators: [],
  penalties: { composite: 0, reliability: 0, viability: 0 },
  overrides: { useAvgBalance: false },
}

describe('applyDetectionAdjustments', () => {
  it('returns raw scores unchanged when no detections', () => {
    const result = applyDetectionAdjustments(baseRaw, cleanSybil, cleanGaming)
    expect(result).toEqual(baseRaw)
  })

  it('applies sybil reliability cap', () => {
    const sybil: SybilResult = { ...cleanSybil, sybilFlag: true, caps: { reliability: 40 } }
    const result = applyDetectionAdjustments(baseRaw, sybil, cleanGaming)
    expect(result.reliability).toBe(40) // capped from 80 to 40
    expect(result.viability).toBe(70)   // unchanged
    expect(result.identity).toBe(60)    // unchanged
  })

  it('applies sybil identity cap', () => {
    const sybil: SybilResult = { ...cleanSybil, sybilFlag: true, caps: { identity: 50 } }
    const result = applyDetectionAdjustments(baseRaw, sybil, cleanGaming)
    expect(result.identity).toBe(50)     // capped from 60 to 50
    expect(result.reliability).toBe(80)  // unchanged
  })

  it('applies both sybil caps simultaneously', () => {
    const sybil: SybilResult = { ...cleanSybil, sybilFlag: true, caps: { reliability: 30, identity: 40 } }
    const result = applyDetectionAdjustments(baseRaw, sybil, cleanGaming)
    expect(result.reliability).toBe(30)
    expect(result.identity).toBe(40)
  })

  it('sybil cap is a no-op when score is already below cap', () => {
    const sybil: SybilResult = { ...cleanSybil, sybilFlag: true, caps: { reliability: 90 } }
    const result = applyDetectionAdjustments(baseRaw, sybil, cleanGaming)
    expect(result.reliability).toBe(80) // already below 90 cap
  })

  it('applies gaming reliability penalty', () => {
    const gaming: GamingResult = { ...cleanGaming, penalties: { composite: 0, reliability: 15, viability: 0 } }
    const result = applyDetectionAdjustments(baseRaw, cleanSybil, gaming)
    expect(result.reliability).toBe(65) // 80 - 15
    expect(result.viability).toBe(70)   // unchanged
  })

  it('applies gaming viability penalty', () => {
    const gaming: GamingResult = { ...cleanGaming, penalties: { composite: 0, reliability: 0, viability: 10 } }
    const result = applyDetectionAdjustments(baseRaw, cleanSybil, gaming)
    expect(result.viability).toBe(60) // 70 - 10
    expect(result.reliability).toBe(80)
  })

  it('floors penalties at 0', () => {
    const gaming: GamingResult = { ...cleanGaming, penalties: { composite: 0, reliability: 100, viability: 100 } }
    const result = applyDetectionAdjustments(baseRaw, cleanSybil, gaming)
    expect(result.reliability).toBe(0)
    expect(result.viability).toBe(0)
  })

  it('applies caps before penalties (cap then subtract)', () => {
    // Cap reliability to 40, then subtract 15 → 25
    const sybil: SybilResult = { ...cleanSybil, sybilFlag: true, caps: { reliability: 40 } }
    const gaming: GamingResult = { ...cleanGaming, penalties: { composite: 0, reliability: 15, viability: 0 } }
    const result = applyDetectionAdjustments(baseRaw, sybil, gaming)
    expect(result.reliability).toBe(25) // min(80, 40) = 40, then 40 - 15 = 25
  })

  it('does not mutate the input object', () => {
    const raw = { ...baseRaw }
    const gaming: GamingResult = { ...cleanGaming, penalties: { composite: 0, reliability: 20, viability: 10 } }
    applyDetectionAdjustments(raw, cleanSybil, gaming)
    expect(raw.reliability).toBe(80)
    expect(raw.viability).toBe(70)
  })

  it('leaves capability and behavior untouched', () => {
    const sybil: SybilResult = { ...cleanSybil, sybilFlag: true, caps: { reliability: 10, identity: 10 } }
    const gaming: GamingResult = { ...cleanGaming, penalties: { composite: 5, reliability: 50, viability: 50 } }
    const result = applyDetectionAdjustments(baseRaw, sybil, gaming)
    expect(result.capability).toBe(50) // always untouched
    expect(result.behavior).toBe(40)   // always untouched
  })
})
