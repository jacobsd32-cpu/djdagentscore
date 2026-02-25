import type { BehaviorClassification, BehaviorData } from '../types.js'

export interface BehaviorResult {
  score: number
  data: BehaviorData
  signals: Record<string, number>
}

/**
 * Calculates the Behavior dimension score from transaction timestamps.
 * Three signals (100 points max):
 *   - Inter-arrival CV (35 pts): coefficient of variation of time gaps
 *   - Hourly entropy (35 pts): Shannon entropy of hour-of-day distribution
 *   - Max gap hours (30 pts): longest gap between consecutive transactions
 *
 * v2.1: lowered minimum from 10 to 5 timestamps. Most early-stage wallets
 * have 5-15 transactions; the old threshold left 15% of the composite score
 * stuck at a neutral 50 for the majority of scored wallets.
 * 5 timestamps still produce meaningful CV and entropy signals.
 */
export function calcBehavior(timestamps: string[]): BehaviorResult {
  if (timestamps.length < 5) {
    return {
      score: 50,
      data: {
        interArrivalCV: 0,
        hourlyEntropy: 0,
        maxGapHours: 0,
        classification: 'insufficient_data',
        txCount: timestamps.length,
      },
      signals: { interArrivalCV: 0, hourlyEntropy: 0, maxGapHours: 0 },
    }
  }

  const sorted = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b)

  // ── Signal 1: Inter-arrival CV (35 pts) ─────────────────────────
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i] - sorted[i - 1])
  }
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const stdGap = Math.sqrt(gaps.reduce((a, g) => a + (g - meanGap) ** 2, 0) / gaps.length)
  const cv = meanGap > 0 ? stdGap / meanGap : 0

  // CV < 0.1 = perfectly regular (bot-like) → 0 pts
  // CV > 1.5 = highly variable (organic) → 35 pts
  const cvScore = Math.round(Math.min(35, Math.max(0, ((cv - 0.1) / 1.4) * 35)))

  // ── Signal 2: Hourly entropy (35 pts) ────────────────────────────
  const hourBuckets = new Array(24).fill(0)
  for (const ms of sorted) {
    hourBuckets[new Date(ms).getUTCHours()]++
  }
  const total = sorted.length
  let entropy = 0
  for (const count of hourBuckets) {
    if (count > 0) {
      const p = count / total
      entropy -= p * Math.log2(p)
    }
  }
  // Max entropy for 24 bins = log2(24) ≈ 4.585
  // Low entropy (< 1.0) = concentrated in few hours → 0 pts
  // High entropy (> 3.5) = well-spread → 35 pts
  const entropyScore = Math.round(Math.min(35, Math.max(0, ((entropy - 1.0) / 2.5) * 35)))

  // ── Signal 3: Max gap hours (30 pts) ──────────────────────────────
  const maxGapMs = Math.max(...gaps)
  const maxGapHours = maxGapMs / (1000 * 60 * 60)
  // No gap (< 1 hour) = suspicious constant activity → 0 pts
  // Multi-day gaps (> 48 hours) = organic downtime → 30 pts
  const gapScore = Math.round(Math.min(30, Math.max(0, ((maxGapHours - 1) / 47) * 30)))

  const score = cvScore + entropyScore + gapScore

  // ── Classification ────────────────────────────────────────────────
  let classification: BehaviorClassification
  if (score >= 70) classification = 'organic'
  else if (score >= 45) classification = 'mixed'
  else if (score >= 25) classification = 'automated'
  else classification = 'suspicious'

  return {
    score,
    data: {
      interArrivalCV: Math.round(cv * 100) / 100,
      hourlyEntropy: Math.round(entropy * 100) / 100,
      maxGapHours: Math.round(maxGapHours * 10) / 10,
      classification,
      txCount: timestamps.length,
    },
    signals: {
      interArrivalCV: cvScore,
      hourlyEntropy: entropyScore,
      maxGapHours: gapScore,
    },
  }
}
