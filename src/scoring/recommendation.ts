/**
 * Recommendation Engine
 *
 * Returns a single actionable recommendation based on score, confidence,
 * and integrity flags. Checks are evaluated in strict priority order.
 */

export type Recommendation =
  | 'proceed'
  | 'proceed_with_caution'
  | 'insufficient_history'
  | 'high_risk'
  | 'flagged_for_review'

export interface RecommendationInputs {
  score: number
  confidence: number
  sybilFlag: boolean
  gamingDetected: boolean
}

/**
 * Priority order:
 *   1. flagged_for_review  — any Sybil or gaming flag (integrity concerns)
 *   2. insufficient_history — confidence < 0.3 (not enough data to evaluate)
 *   3. high_risk           — score < 25 AND confidence >= 0.5 (enough data, bad score)
 *   4. proceed             — score >= 50 AND confidence >= 0.5 (good data, good score)
 *   5. proceed_with_caution — everything else
 */
export function determineRecommendation(inputs: RecommendationInputs): Recommendation {
  const { score, confidence, sybilFlag, gamingDetected } = inputs

  if (sybilFlag || gamingDetected) {
    return 'flagged_for_review'
  }

  if (confidence < 0.3) {
    return 'insufficient_history'
  }

  if (score < 25) {
    return 'high_risk'
  }

  if (score >= 50 && confidence >= 0.5) {
    return 'proceed'
  }

  return 'proceed_with_caution'
}
