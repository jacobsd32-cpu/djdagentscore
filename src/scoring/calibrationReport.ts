/**
 * Calibration Report — measures whether the scoring model is predictive.
 *
 * The key question: do wallets with higher scores at query time actually produce
 * better real-world outcomes?  We answer this with three analyses:
 *
 * 1. **Score-Outcome Separation** — avg score of positive-outcome wallets vs
 *    negative-outcome wallets. A healthy model shows a large gap.
 *
 * 2. **Tier Accuracy** — for each tier, what % of wallets have positive outcomes?
 *    Elite should be >> Emerging. If not, the model isn't discriminating.
 *
 * 3. **Monotonicity Check** — do tiers with higher scores consistently produce
 *    better outcome rates? Violations indicate broken thresholds.
 *
 * Outcome types (from outcomeMatcher.ts):
 *   positive: 'successful_tx', 'multiple_successful_tx'
 *   negative: 'fraud_report'
 *   neutral:  'no_activity'
 */

import type { Database } from 'better-sqlite3'

// ── Outcome classification ──────────────────────────────────────────────────

/** Outcomes that indicate the score was predictive (wallet is trustworthy). */
export const POSITIVE_OUTCOMES = new Set(['successful_tx', 'multiple_successful_tx'])

/** Outcomes that indicate the score overestimated trust. */
export const NEGATIVE_OUTCOMES = new Set(['fraud_report'])

// 'no_activity' is neutral — doesn't indicate model success or failure.

// ── Report type ─────────────────────────────────────────────────────────────

export interface CalibrationReport {
  generated_at: string
  period_start: string
  period_end: string
  total_scored: number
  avg_score_by_outcome: string  // JSON: Record<outcome_type, { avgScore, count }>
  tier_accuracy: string         // JSON: Record<tier, { total, positive, negative, positiveRate }>
  recommendations: string       // JSON: string[]
  model_version: string
}

// ── Row types for SQLite queries ────────────────────────────────────────────

interface OutcomeRow {
  outcome_type: string
  avg_score: number
  count: number
}

interface TierRow {
  tier: string
  outcome_type: string
  count: number
}

/** Tier ordering for monotonicity check (highest to lowest). */
const TIER_ORDER = ['Elite', 'Trusted', 'Established', 'Emerging', 'Unverified'] as const

// ── Main generator ──────────────────────────────────────────────────────────

export function generateCalibrationReport(db: Database, modelVersion: string): CalibrationReport {
  const now = new Date()
  const periodEnd = now.toISOString()
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // ── 1. Average score by outcome type ────────────────────────────────────
  // Uses score_at_query (the score at the time the lookup was made) so we
  // evaluate the model's prediction, not the current (possibly updated) score.
  const outcomeRows = db.prepare(`
    SELECT outcome_type,
           ROUND(AVG(score_at_query)) as avg_score,
           COUNT(*) as count
    FROM score_outcomes
    WHERE outcome_at >= ?
      AND score_at_query IS NOT NULL
    GROUP BY outcome_type
  `).all(periodStart) as OutcomeRow[]

  const avgScoreByOutcome: Record<string, { avgScore: number; count: number }> = {}
  let totalScored = 0
  for (const row of outcomeRows) {
    avgScoreByOutcome[row.outcome_type] = {
      avgScore: row.avg_score,
      count: row.count,
    }
    totalScored += row.count
  }

  // ── 2. Tier accuracy ────────────────────────────────────────────────────
  // For each tier, count positive/negative/total outcomes.
  // Uses tier_at_query so we evaluate the tier assigned at prediction time.
  const tierRows = db.prepare(`
    SELECT tier_at_query as tier, outcome_type, COUNT(*) as count
    FROM score_outcomes
    WHERE outcome_at >= ?
      AND tier_at_query IS NOT NULL
    GROUP BY tier_at_query, outcome_type
  `).all(periodStart) as TierRow[]

  const tierStats: Record<string, { total: number; positive: number; negative: number; positiveRate: number }> = {}

  for (const row of tierRows) {
    if (!tierStats[row.tier]) {
      tierStats[row.tier] = { total: 0, positive: 0, negative: 0, positiveRate: 0 }
    }
    tierStats[row.tier].total += row.count
    if (POSITIVE_OUTCOMES.has(row.outcome_type)) {
      tierStats[row.tier].positive += row.count
    }
    if (NEGATIVE_OUTCOMES.has(row.outcome_type)) {
      tierStats[row.tier].negative += row.count
    }
  }

  // Calculate positive rates
  for (const tier of Object.keys(tierStats)) {
    const s = tierStats[tier]
    s.positiveRate = s.total > 0 ? Math.round((s.positive / s.total) * 100) / 100 : 0
  }

  // ── 3. Recommendations ──────────────────────────────────────────────────
  const recommendations: string[] = []

  // 3a. Score-outcome separation: positive outcomes should have higher avg scores
  const positiveScores = outcomeRows.filter(r => POSITIVE_OUTCOMES.has(r.outcome_type))
  const negativeScores = outcomeRows.filter(r => NEGATIVE_OUTCOMES.has(r.outcome_type))
  const avgPositive = weightedAvg(positiveScores)
  const avgNegative = weightedAvg(negativeScores)

  if (avgPositive !== null && avgNegative !== null) {
    const separation = avgPositive - avgNegative
    if (separation < 10) {
      recommendations.push(
        `Weak score-outcome separation (${separation.toFixed(0)} points). ` +
        `Positive outcomes avg ${avgPositive.toFixed(0)}, negative avg ${avgNegative.toFixed(0)}. ` +
        `Consider reweighting dimensions.`,
      )
    } else {
      recommendations.push(
        `Score-outcome separation is healthy (${separation.toFixed(0)} points). ` +
        `Positive avg ${avgPositive.toFixed(0)}, negative avg ${avgNegative.toFixed(0)}.`,
      )
    }
  }

  // 3b. Monotonicity: higher tiers should have better positive rates
  const orderedTiers = TIER_ORDER.filter(t => tierStats[t])
  let lastRate = Infinity
  for (const tier of orderedTiers) {
    const rate = tierStats[tier].positiveRate
    if (rate > lastRate) {
      recommendations.push(
        `Monotonicity violation: ${tier} (${(rate * 100).toFixed(0)}% positive) ` +
        `outperforms the tier above it (${(lastRate * 100).toFixed(0)}% positive). ` +
        `Tier thresholds may need adjustment.`,
      )
    }
    lastRate = rate
  }

  // 3c. Fraud wallets with high scores indicate weak integrity checks
  if (avgScoreByOutcome.fraud_report && avgScoreByOutcome.fraud_report.avgScore > 50) {
    recommendations.push(
      `Fraudulent wallets have moderate avg score (${avgScoreByOutcome.fraud_report.avgScore}). ` +
      `Integrity multiplier or sybil detection may need tuning.`,
    )
  }

  // 3d. No-activity wallets with high scores suggest over-scoring inactive wallets
  if (avgScoreByOutcome.no_activity && avgScoreByOutcome.no_activity.avgScore > 60) {
    recommendations.push(
      `Inactive wallets have high avg score (${avgScoreByOutcome.no_activity.avgScore}). ` +
      `Consider adding recency decay.`,
    )
  }

  // ── Build and persist report ────────────────────────────────────────────
  const report: CalibrationReport = {
    generated_at: now.toISOString(),
    period_start: periodStart,
    period_end: periodEnd,
    total_scored: totalScored,
    avg_score_by_outcome: JSON.stringify(avgScoreByOutcome),
    tier_accuracy: JSON.stringify(tierStats),
    recommendations: JSON.stringify(recommendations),
    model_version: modelVersion,
  }

  db.prepare(`
    INSERT INTO calibration_reports
      (generated_at, period_start, period_end, total_scored,
       avg_score_by_outcome, tier_accuracy, recommendations, model_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    report.generated_at, report.period_start, report.period_end,
    report.total_scored, report.avg_score_by_outcome, report.tier_accuracy,
    report.recommendations, report.model_version,
  )

  return report
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Weighted average score across outcome rows (weighted by row count). */
function weightedAvg(rows: OutcomeRow[]): number | null {
  if (rows.length === 0) return null
  let totalScore = 0
  let totalCount = 0
  for (const r of rows) {
    totalScore += r.avg_score * r.count
    totalCount += r.count
  }
  return totalCount > 0 ? totalScore / totalCount : null
}
