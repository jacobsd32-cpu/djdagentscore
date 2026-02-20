/**
 * Confidence Interval Calculator
 *
 * Produces a 0.0–1.0 confidence value based on five data availability signals.
 * Higher confidence means the score is backed by more data and is more meaningful.
 */

export interface ConfidenceInputs {
  txCount: number
  walletAgeDays: number
  uniquePartners: number
  ratingCount: number
  priorQueryCount: number
}

/**
 * Score each signal on a 0.0–1.0 scale, then weight and sum.
 *
 * Signal weights:
 *   txCount (25%): 0 tx=0.0, 5=0.3, 20=0.6, 100+=1.0  (log scale)
 *   walletAge (25%): <1d=0.0, 7d=0.4, 30d=0.7, 90+d=1.0
 *   partners (20%): 0=0.0, 3=0.3, 10=0.6, 30+=1.0
 *   ratings (15%): none=0.0, 1-5=0.5, 10+=1.0
 *   priorQueries (15%): never=0.0, 1-5=0.5, 10+=1.0
 */
export function calcConfidence(inputs: ConfidenceInputs): number {
  const { txCount, walletAgeDays, uniquePartners, ratingCount, priorQueryCount } = inputs

  // ── txCount signal (log scale) ─────────────────────────────────────────────
  let txSignal: number
  if (txCount === 0) {
    txSignal = 0.0
  } else if (txCount < 5) {
    txSignal = 0.1 + (txCount / 5) * 0.2
  } else if (txCount < 20) {
    txSignal = 0.3 + ((txCount - 5) / 15) * 0.3
  } else if (txCount < 100) {
    txSignal = 0.6 + ((txCount - 20) / 80) * 0.4
  } else {
    txSignal = 1.0
  }

  // ── walletAge signal ───────────────────────────────────────────────────────
  let ageSignal: number
  if (walletAgeDays < 1) {
    ageSignal = 0.0
  } else if (walletAgeDays < 7) {
    ageSignal = (walletAgeDays / 7) * 0.4
  } else if (walletAgeDays < 30) {
    ageSignal = 0.4 + ((walletAgeDays - 7) / 23) * 0.3
  } else if (walletAgeDays < 90) {
    ageSignal = 0.7 + ((walletAgeDays - 30) / 60) * 0.3
  } else {
    ageSignal = 1.0
  }

  // ── uniquePartners signal ──────────────────────────────────────────────────
  let partnerSignal: number
  if (uniquePartners === 0) {
    partnerSignal = 0.0
  } else if (uniquePartners < 3) {
    partnerSignal = (uniquePartners / 3) * 0.3
  } else if (uniquePartners < 10) {
    partnerSignal = 0.3 + ((uniquePartners - 3) / 7) * 0.3
  } else if (uniquePartners < 30) {
    partnerSignal = 0.6 + ((uniquePartners - 10) / 20) * 0.4
  } else {
    partnerSignal = 1.0
  }

  // ── ratingCount signal ─────────────────────────────────────────────────────
  let ratingSignal: number
  if (ratingCount === 0) {
    ratingSignal = 0.0
  } else if (ratingCount < 10) {
    ratingSignal = 0.5
  } else {
    ratingSignal = 1.0
  }

  // ── priorQueryCount signal ─────────────────────────────────────────────────
  let querySignal: number
  if (priorQueryCount === 0) {
    querySignal = 0.0
  } else if (priorQueryCount < 10) {
    querySignal = 0.5
  } else {
    querySignal = 1.0
  }

  const confidence =
    txSignal * 0.25 +
    ageSignal * 0.25 +
    partnerSignal * 0.20 +
    ratingSignal * 0.15 +
    querySignal * 0.15

  // Clamp and round to 2 decimal places
  return Math.round(Math.min(1.0, Math.max(0.0, confidence)) * 100) / 100
}
