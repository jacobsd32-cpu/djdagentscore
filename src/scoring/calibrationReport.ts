import type { Database } from 'better-sqlite3'

export interface CalibrationReport {
  generated_at: string
  period_start: string
  period_end: string
  total_scored: number
  avg_score_by_outcome: string  // JSON
  tier_accuracy: string         // JSON
  recommendations: string       // JSON string[]
  model_version: string
}

interface OutcomeRow {
  outcome_label: string
  avg_score: number
  count: number
}

interface TierRow {
  tier: string
  outcome_label: string
  count: number
}

export function generateCalibrationReport(db: Database, modelVersion: string): CalibrationReport {
  const now = new Date()
  const periodEnd = now.toISOString()
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Average score by outcome label
  const outcomeRows = db.prepare(`
    SELECT so.outcome_label, ROUND(AVG(s.composite_score)) as avg_score, COUNT(*) as count
    FROM score_outcomes so
    JOIN scores s ON so.wallet = s.wallet
    WHERE so.labeled_at >= ?
    GROUP BY so.outcome_label
  `).all(periodStart) as OutcomeRow[]

  const avgScoreByOutcome: Record<string, number> = {}
  let totalScored = 0
  for (const row of outcomeRows) {
    avgScoreByOutcome[row.outcome_label] = row.avg_score
    totalScored += row.count
  }

  // Tier accuracy: for each tier, what % of wallets have positive outcomes
  const tierRows = db.prepare(`
    SELECT s.tier, so.outcome_label, COUNT(*) as count
    FROM scores s
    JOIN score_outcomes so ON s.wallet = so.wallet
    WHERE so.labeled_at >= ?
    GROUP BY s.tier, so.outcome_label
  `).all(periodStart) as TierRow[]

  const tierTotals: Record<string, number> = {}
  const tierPositive: Record<string, number> = {}
  const positiveOutcomes = new Set(['reliable_transactor', 'growing'])

  for (const row of tierRows) {
    tierTotals[row.tier] = (tierTotals[row.tier] || 0) + row.count
    if (positiveOutcomes.has(row.outcome_label)) {
      tierPositive[row.tier] = (tierPositive[row.tier] || 0) + row.count
    }
  }

  const tierAccuracy: Record<string, number> = {}
  for (const tier of Object.keys(tierTotals)) {
    tierAccuracy[tier] = Math.round(((tierPositive[tier] || 0) / tierTotals[tier]) * 100) / 100
  }

  // Generate recommendations
  const recommendations: string[] = []
  if (avgScoreByOutcome.dormant && avgScoreByOutcome.dormant > 50) {
    recommendations.push('High-scoring wallets going dormant — consider recency weighting')
  }
  if (avgScoreByOutcome.reported && avgScoreByOutcome.reported > 40) {
    recommendations.push('Reported wallets have moderate scores — integrity modifiers may need tuning')
  }

  const report: CalibrationReport = {
    generated_at: now.toISOString(),
    period_start: periodStart,
    period_end: periodEnd,
    total_scored: totalScored,
    avg_score_by_outcome: JSON.stringify(avgScoreByOutcome),
    tier_accuracy: JSON.stringify(tierAccuracy),
    recommendations: JSON.stringify(recommendations),
    model_version: modelVersion,
  }

  // Persist report
  db.prepare(`
    INSERT INTO calibration_reports (generated_at, period_start, period_end, total_scored, avg_score_by_outcome, tier_accuracy, recommendations, model_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    report.generated_at, report.period_start, report.period_end,
    report.total_scored, report.avg_score_by_outcome, report.tier_accuracy,
    report.recommendations, report.model_version,
  )

  return report
}
