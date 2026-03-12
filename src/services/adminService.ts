import {
  countFraudDisputes,
  countFraudReportsByTarget,
  db,
  getFraudDisputeById,
  getFraudReportById,
  getRevenueByHour,
  getRevenueSummary,
  getTopPayers,
  listFraudDisputes,
  resolveFraudDispute,
  sumFraudPenaltyByTarget,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import { queueWebhookEvent } from '../jobs/webhookDelivery.js'
import { generateCalibrationReport } from '../scoring/calibrationReport.js'
import { MODEL_VERSION } from '../scoring/responseBuilders.js'
import type { DisputeResolution, FraudDisputeResolutionBody } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'
import { getAdminGrowthFunnelView } from './growthService.js'

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
  'monitoring_subscriptions',
  'certifications',
  'reputation_publications',
  'webhook_deliveries',
  'webhooks',
  'fraud_disputes',
  'fraud_reports',
  'fraud_patterns',
  'growth_events',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

type AdminServiceError = {
  ok: false
  code: string
  message: string
  status: 400 | 404 | 409
  details?: Record<string, unknown>
}

type AdminServiceSuccess<T> = {
  ok: true
  data: T
}

type AdminServiceResult<T> = AdminServiceError | AdminServiceSuccess<T>

type ForensicsRiskLevel = 'clear' | 'watch' | 'elevated' | 'critical'

function invalidAdminDisputeError(message: string, details?: Record<string, unknown>): AdminServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_DISPUTE,
    message,
    status: 400,
    ...(details ? { details } : {}),
  }
}

function parseDisputeStatusFilter(rawStatus: string | undefined): 'open' | 'resolved' | undefined {
  if (!rawStatus || rawStatus === 'all') return undefined
  if (rawStatus === 'open' || rawStatus === 'resolved') return rawStatus
  return undefined
}

function parseDisputeResolution(body: unknown): AdminServiceResult<{
  resolution: DisputeResolution
  notes: string | null
}> {
  if (!isRecord(body)) {
    return invalidAdminDisputeError('resolution is required')
  }

  const resolution = body.resolution
  if (resolution !== 'upheld' && resolution !== 'rejected') {
    return invalidAdminDisputeError('resolution must be one of: upheld, rejected')
  }

  const notes = typeof body.notes === 'string' && body.notes.trim().length > 0 ? body.notes.trim() : null

  return {
    ok: true,
    data: {
      resolution,
      notes,
    },
  }
}

function classifyForensicsRiskLevel(reportCount: number, totalPenaltyApplied: number): ForensicsRiskLevel {
  if (reportCount === 0) return 'clear'
  if (reportCount >= 4 || totalPenaltyApplied >= 20) return 'critical'
  if (reportCount >= 2 || totalPenaltyApplied >= 10) return 'elevated'
  return 'watch'
}

function getForensicsSignalSnapshot(wallet: string): {
  reportCount: number
  totalPenaltyApplied: number
  riskLevel: ForensicsRiskLevel
} {
  const reportCount = countFraudReportsByTarget(wallet)
  const totalPenaltyApplied = sumFraudPenaltyByTarget(wallet)

  return {
    reportCount,
    totalPenaltyApplied,
    riskLevel: classifyForensicsRiskLevel(reportCount, totalPenaltyApplied),
  }
}

function emitForensicsLifecycleEvents(params: {
  wallet: string
  previous: {
    reportCount: number
    totalPenaltyApplied: number
    riskLevel: ForensicsRiskLevel
  }
  current: {
    reportCount: number
    totalPenaltyApplied: number
    riskLevel: ForensicsRiskLevel
  }
  reportId: string
  reportReason: string
  disputeId: string
  resolution: DisputeResolution
}) {
  if (params.previous.reportCount > 0 && params.current.reportCount === 0) {
    queueWebhookEvent('forensics.watchlist.cleared', {
      wallet: params.wallet,
      reportId: params.reportId,
      reportReason: params.reportReason,
      disputeId: params.disputeId,
      resolution: params.resolution,
      previousReportCount: params.previous.reportCount,
      previousRiskLevel: params.previous.riskLevel,
      currentRiskLevel: params.current.riskLevel,
    })
  }

  if (params.previous.riskLevel !== params.current.riskLevel) {
    queueWebhookEvent('forensics.risk.changed', {
      wallet: params.wallet,
      reportId: params.reportId,
      reportReason: params.reportReason,
      disputeId: params.disputeId,
      resolution: params.resolution,
      previousRiskLevel: params.previous.riskLevel,
      currentRiskLevel: params.current.riskLevel,
      previousReportCount: params.previous.reportCount,
      currentReportCount: params.current.reportCount,
      previousTotalPenaltyApplied: params.previous.totalPenaltyApplied,
      currentTotalPenaltyApplied: params.current.totalPenaltyApplied,
    })
  }
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

export function getAdminGrowthFunnelSummaryView(rawDays: string | undefined): Record<string, unknown> {
  return getAdminGrowthFunnelView(rawDays)
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

export function getAdminForensicsDisputesView(
  rawStatus: string | undefined,
  rawWallet: string | undefined,
  rawLimit: string | undefined,
) {
  const status = parseDisputeStatusFilter(rawStatus)
  const wallet = rawWallet ? (normalizeWallet(rawWallet) ?? undefined) : undefined
  const limit = clampInteger(rawLimit, 25, 1, 100)

  if (rawWallet && !wallet) {
    return {
      disputes: [],
      count: 0,
      returned: 0,
      status_filter: status ?? 'all',
      wallet_filter: rawWallet,
    }
  }

  const disputes = listFraudDisputes({
    status,
    wallet,
    limit,
  })
  const count = countFraudDisputes({
    status,
    wallet,
  })

  return {
    disputes: disputes.map((dispute) => ({
      dispute_id: dispute.dispute_id,
      report_id: dispute.report_id,
      target_wallet: dispute.target_wallet,
      disputing_wallet: dispute.disputing_wallet,
      dispute_reason: dispute.dispute_reason,
      dispute_details: dispute.dispute_details,
      dispute_status: dispute.dispute_status,
      dispute_resolution: dispute.dispute_resolution,
      dispute_created_at: dispute.dispute_created_at,
      dispute_resolved_at: dispute.dispute_resolved_at,
      resolution_notes: dispute.resolution_notes,
      resolved_by: dispute.resolved_by,
      report: {
        reason: dispute.report_reason,
        details: dispute.report_details,
        created_at: dispute.report_created_at,
        reporter_wallet: dispute.reporter_wallet,
        penalty_applied: dispute.penalty_applied,
        invalidated_at: dispute.report_invalidated_at,
      },
    })),
    count,
    returned: disputes.length,
    status_filter: status ?? 'all',
    wallet_filter: wallet ?? null,
  }
}

export function resolveAdminForensicsDisputeView(
  disputeId: string | undefined,
  body: FraudDisputeResolutionBody | unknown,
  resolvedBy: string,
): AdminServiceResult<{
  disputeId: string
  reportId: string
  targetWallet: string
  status: 'resolved'
  resolution: DisputeResolution
  reportInvalidated: boolean
  penaltyRestored: number
  resolvedAt: string
}> {
  if (!disputeId) {
    return invalidAdminDisputeError('dispute id is required')
  }

  const parsedResolution = parseDisputeResolution(body)
  if (!parsedResolution.ok) {
    return parsedResolution
  }

  const dispute = getFraudDisputeById(disputeId)
  if (!dispute) {
    return {
      ok: false,
      code: ErrorCodes.DISPUTE_NOT_FOUND,
      message: 'Dispute not found',
      status: 404,
    }
  }

  if (dispute.status === 'resolved') {
    return {
      ok: false,
      code: ErrorCodes.DISPUTE_ALREADY_RESOLVED,
      message: 'Dispute has already been resolved',
      status: 409,
    }
  }

  const report = getFraudReportById(dispute.report_id)
  if (!report) {
    return {
      ok: false,
      code: ErrorCodes.DISPUTE_NOT_FOUND,
      message: 'Underlying fraud report not found',
      status: 404,
    }
  }

  const previousState = getForensicsSignalSnapshot(dispute.target_wallet)
  const resolution = resolveFraudDispute({
    disputeId: dispute.id,
    reportId: dispute.report_id,
    targetWallet: dispute.target_wallet,
    resolution: parsedResolution.data.resolution,
    resolutionNotes: parsedResolution.data.notes,
    resolvedBy,
    penaltyApplied: report.penalty_applied,
  })
  const currentState = getForensicsSignalSnapshot(dispute.target_wallet)

  queueWebhookEvent('fraud.dispute.resolved', {
    disputeId: dispute.id,
    reportId: dispute.report_id,
    target: dispute.target_wallet,
    reportReason: report.reason,
    resolution: parsedResolution.data.resolution,
    reportInvalidated: resolution.reportInvalidated,
    penaltyRestored: resolution.penaltyRestored,
    resolvedBy,
    currentRiskLevel: currentState.riskLevel,
  })
  emitForensicsLifecycleEvents({
    wallet: dispute.target_wallet,
    previous: previousState,
    current: currentState,
    reportId: dispute.report_id,
    reportReason: report.reason,
    disputeId: dispute.id,
    resolution: parsedResolution.data.resolution,
  })

  return {
    ok: true,
    data: {
      disputeId: dispute.id,
      reportId: dispute.report_id,
      targetWallet: dispute.target_wallet,
      status: 'resolved',
      resolution: parsedResolution.data.resolution,
      reportInvalidated: resolution.reportInvalidated,
      penaltyRestored: resolution.penaltyRestored,
      resolvedAt: resolution.resolvedAt,
    },
  }
}
