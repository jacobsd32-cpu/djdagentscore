/**
 * Recommendation Engine Tests
 *
 * determineRecommendation() is a pure function with strict priority ordering.
 * We test each branch and confirm priority correctly resolves ambiguous inputs.
 */
import { describe, it, expect } from 'vitest'
import { determineRecommendation } from '../src/scoring/recommendation.js'

describe('determineRecommendation', () => {
  // ── Priority 1: flagged_for_review ──────────────────────────────────────
  it('returns flagged_for_review when sybilFlag is true', () => {
    expect(
      determineRecommendation({ score: 90, confidence: 1.0, sybilFlag: true, gamingDetected: false }),
    ).toBe('flagged_for_review')
  })

  it('returns flagged_for_review when gamingDetected is true', () => {
    expect(
      determineRecommendation({ score: 90, confidence: 1.0, sybilFlag: false, gamingDetected: true }),
    ).toBe('flagged_for_review')
  })

  it('returns flagged_for_review even with high score + confidence when flags present', () => {
    // Both flags active — highest priority still wins
    expect(
      determineRecommendation({ score: 95, confidence: 0.99, sybilFlag: true, gamingDetected: true }),
    ).toBe('flagged_for_review')
  })

  // ── Priority 2: insufficient_history ────────────────────────────────────
  it('returns insufficient_history when confidence < 0.3', () => {
    expect(
      determineRecommendation({ score: 80, confidence: 0.2, sybilFlag: false, gamingDetected: false }),
    ).toBe('insufficient_history')
  })

  it('returns insufficient_history for low confidence even with zero score', () => {
    expect(
      determineRecommendation({ score: 0, confidence: 0.1, sybilFlag: false, gamingDetected: false }),
    ).toBe('insufficient_history')
  })

  // ── Priority 3: high_risk ──────────────────────────────────────────────
  it('returns high_risk when score < 25 and confidence >= 0.5', () => {
    expect(
      determineRecommendation({ score: 20, confidence: 0.6, sybilFlag: false, gamingDetected: false }),
    ).toBe('high_risk')
  })

  it('returns high_risk at score boundary (24)', () => {
    expect(
      determineRecommendation({ score: 24, confidence: 0.5, sybilFlag: false, gamingDetected: false }),
    ).toBe('high_risk')
  })

  // ── Priority 4: proceed ────────────────────────────────────────────────
  it('returns proceed when score >= 50 and confidence >= 0.5', () => {
    expect(
      determineRecommendation({ score: 50, confidence: 0.5, sybilFlag: false, gamingDetected: false }),
    ).toBe('proceed')
  })

  it('returns proceed for excellent wallet', () => {
    expect(
      determineRecommendation({ score: 95, confidence: 0.95, sybilFlag: false, gamingDetected: false }),
    ).toBe('proceed')
  })

  // ── Priority 5: proceed_with_caution (fallback) ────────────────────────
  it('returns proceed_with_caution for mid-range score with sufficient confidence', () => {
    // score=35 (not <25 for high_risk, not >=50 for proceed), confidence=0.6
    expect(
      determineRecommendation({ score: 35, confidence: 0.6, sybilFlag: false, gamingDetected: false }),
    ).toBe('proceed_with_caution')
  })

  it('returns proceed_with_caution at the 25-49 boundary', () => {
    expect(
      determineRecommendation({ score: 25, confidence: 0.5, sybilFlag: false, gamingDetected: false }),
    ).toBe('proceed_with_caution')
  })

  it('returns proceed_with_caution for decent score but borderline confidence', () => {
    // score=49 (just under proceed), confidence=0.4 (>0.3 so not insufficient_history)
    expect(
      determineRecommendation({ score: 49, confidence: 0.4, sybilFlag: false, gamingDetected: false }),
    ).toBe('proceed_with_caution')
  })

  // ── Edge: confidence exactly at boundaries ─────────────────────────────
  it('handles confidence exactly at 0.3 (NOT insufficient_history)', () => {
    // confidence=0.3 → NOT < 0.3, so falls through
    expect(
      determineRecommendation({ score: 60, confidence: 0.3, sybilFlag: false, gamingDetected: false }),
    ).toBe('proceed_with_caution') // confidence < 0.5 so not "proceed"
  })

  it('handles confidence exactly at 0.5 with high score', () => {
    expect(
      determineRecommendation({ score: 50, confidence: 0.5, sybilFlag: false, gamingDetected: false }),
    ).toBe('proceed')
  })

  // ── Priority ordering matters ──────────────────────────────────────────
  it('sybil flag overrides insufficient_history', () => {
    // Both conditions true: sybil AND low confidence
    expect(
      determineRecommendation({ score: 20, confidence: 0.1, sybilFlag: true, gamingDetected: false }),
    ).toBe('flagged_for_review') // Priority 1 beats Priority 2
  })

  it('insufficient_history overrides high_risk', () => {
    // score < 25 (high_risk condition) BUT confidence < 0.3 (insufficient_history)
    expect(
      determineRecommendation({ score: 10, confidence: 0.2, sybilFlag: false, gamingDetected: false }),
    ).toBe('insufficient_history') // Priority 2 beats Priority 3
  })
})
