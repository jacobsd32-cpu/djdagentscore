import { db, getRevenueByHour, getRevenueSummary, getTopPayers } from '../db.js'
import { generateCalibrationReport } from '../scoring/calibrationReport.js'
import { MODEL_VERSION } from '../scoring/responseBuilders.js'

const RESETTABLE_TABLES = [
  'query_log',
  'scores',
  'score_history',
  'score_decay',
  'economy_metrics',
  'intent_signals',
  'score_outcomes',
  'agent_registrations',
  'calibration_reports',
  'rate_limits',
  'api_keys',
  'subscriptions',
  'certifications',
  'reputation_publications',
  'webhook_deliveries',
  'webhooks',
  'fraud_reports',
  'fraud_patterns',
] as const

const PRESERVED_TABLES = [
  'raw_transactions',
  'wallet_index',
  'usdc_transfers',
  'wallet_snapshots',
  'wallet_metrics',
  'wallet_transfer_stats',
  'relationship_graph',
  'indexer_state',
] as const

function parseJsonField(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeCalibrationReport(report: Record<string, unknown>) {
  return {
    ...report,
    avg_score_by_outcome: parseJsonField(report.avg_score_by_outcome),
    tier_accuracy: parseJsonField(report.tier_accuracy),
    recommendations: parseJsonField(report.recommendations),
  }
}

function clampInteger(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(rawValue ?? String(fallback), 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

export function getAdminCalibrationReportView(): Record<string, unknown> {
  const latest = db.prepare('SELECT * FROM calibration_reports ORDER BY id DESC LIMIT 1').get() as
    | Record<string, unknown>
    | undefined

  if (latest) {
    return normalizeCalibrationReport(latest)
  }

  return generateAdminCalibrationReportView()
}

export function generateAdminCalibrationReportView(): Record<string, unknown> {
  const report = generateCalibrationReport(db, MODEL_VERSION) as unknown as Record<string, unknown>
  return normalizeCalibrationReport(report)
}

export function flushAdminScoreCacheView(): {
  message: string
  flushed: number
  modelVersion: string
} {
  const result = db.prepare(`UPDATE scores SET expires_at = datetime('now', '-1 hour')`).run()
  return {
    message: `Flushed ${result.changes} cached scores — next query will re-score under model ${MODEL_VERSION}`,
    flushed: result.changes,
    modelVersion: MODEL_VERSION,
  }
}

export function resetAdminTestDataView(): {
  message: string
  cleared: Record<string, number>
  preserved: string[]
} {
  const cleared: Record<string, number> = {}

  const resetAll = db.transaction(() => {
    for (const table of RESETTABLE_TABLES) {
      const result = db.prepare(`DELETE FROM ${table}`).run()
      cleared[table] = result.changes
    }
  })

  resetAll()

  return {
    message: 'Test data cleared. Blockchain-indexed data preserved.',
    cleared,
    preserved: [...PRESERVED_TABLES],
  }
}

export function getAdminRevenueSummaryView(rawDays: string | undefined) {
  const days = clampInteger(rawDays, 30, 1, 365)
  const summary = getRevenueSummary(days)
  return { days, ...summary }
}

export function getAdminTopPayersView(rawLimit: string | undefined) {
  const limit = clampInteger(rawLimit, 20, 1, 100)
  const payers = getTopPayers(limit)
  return { payers, count: payers.length }
}

export function getAdminRealtimeRevenueView() {
  const hours = getRevenueByHour()
  return { hours, count: hours.length }
}
