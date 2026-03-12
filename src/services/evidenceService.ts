import { v4 as uuidv4 } from 'uuid'
import { REPORT_CONFIG } from '../config/constants.js'
import {
  applyReportPenalty,
  countReporterReportsForTarget,
  countScoreHistory,
  getScore,
  insertReport,
  listScoreHistory,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import { queueWebhookEvent } from '../jobs/webhookDelivery.js'
import { computeTrajectory } from '../scoring/trajectory.js'
import { REPORT_REASONS, type Address, type ReportBody, type ReportReason, type ScoreHistoryRow } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'

const { PENALTY_PER_REPORT, MAX_REPORTS_PER_PAIR, MAX_DETAILS_LENGTH } = REPORT_CONFIG

interface EvidenceServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 404 | 429
  details?: Record<string, unknown>
}

interface EvidenceServiceSuccess<T> {
  ok: true
  data: T
  status?: 201
}

type EvidenceServiceResult<T> = EvidenceServiceError | EvidenceServiceSuccess<T>

interface ScoreHistoryParams {
  rawWallet: string | undefined
  limit: string | undefined
  after: string | undefined
  before: string | undefined
}

interface TrendSummary {
  direction: string
  change_pct: number
  avg_score: number
  min_score: number
  max_score: number
}

function invalidWalletError(message: string): EvidenceServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_WALLET,
    message,
    status: 400,
  }
}

function invalidDateRangeError(field: 'after' | 'before'): EvidenceServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_DATE_RANGE,
    message: `Invalid "${field}" date format. Use ISO 8601 (YYYY-MM-DD)`,
    status: 400,
  }
}

function parseLimit(rawLimit: string | undefined): number {
  const parsedLimit = Number.parseInt(rawLimit ?? '50', 10)
  return Math.min(Math.max(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 1), 100)
}

function buildTrend(rows: ScoreHistoryRow[]): TrendSummary | null {
  if (rows.length < 2) return null

  const scores = rows.map((row) => row.score)
  const latest = scores[0]!
  const earliest = scores[scores.length - 1]!
  const change = latest - earliest
  const changePct = earliest !== 0 ? (change / earliest) * 100 : 0
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length
  const direction = Math.abs(change) <= 5 ? 'stable' : change > 0 ? 'improving' : 'declining'

  return {
    direction,
    change_pct: Math.round(changePct * 10) / 10,
    avg_score: Math.round(avg * 10) / 10,
    min_score: Math.min(...scores),
    max_score: Math.max(...scores),
  }
}

export async function submitFraudReport(
  body: ReportBody,
  reporterWallet: string | null | undefined,
): Promise<
  EvidenceServiceResult<{
    reportId: string
    status: 'accepted'
    targetCurrentScore: number
    penaltyApplied: number
  }>
> {
  const target = normalizeWallet(body.target)
  if (!target) {
    return invalidWalletError('Invalid or missing target address')
  }

  if (!body.reason || !(REPORT_REASONS as readonly string[]).includes(body.reason)) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_REPORT,
      message: `Invalid reason. Must be one of: ${REPORT_REASONS.join(', ')}`,
      status: 400,
      details: { validReasons: [...REPORT_REASONS] },
    }
  }

  if (typeof body.details !== 'string' || body.details.trim().length === 0) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_REPORT,
      message: 'details is required',
      status: 400,
    }
  }

  const actualReporter = normalizeWallet(reporterWallet)
  if (!actualReporter) {
    return invalidWalletError('Could not determine reporter identity from payment')
  }

  if (target === actualReporter) {
    return {
      ok: false,
      code: ErrorCodes.SELF_REPORT,
      message: 'target and reporter must be different addresses',
      status: 400,
    }
  }

  const existingReports = countReporterReportsForTarget(actualReporter, target)
  if (existingReports >= MAX_REPORTS_PER_PAIR) {
    return {
      ok: false,
      code: ErrorCodes.REPORT_LIMIT_EXCEEDED,
      message: `Report limit reached for this reporter/target pair (max ${MAX_REPORTS_PER_PAIR})`,
      status: 429,
    }
  }

  const reportId = uuidv4()
  insertReport({
    id: reportId,
    target_wallet: target,
    reporter_wallet: actualReporter,
    reason: body.reason as ReportReason,
    details: body.details.trim().slice(0, MAX_DETAILS_LENGTH),
    penalty_applied: PENALTY_PER_REPORT,
  })

  applyReportPenalty(target, PENALTY_PER_REPORT)

  const updatedRow = getScore(target)
  const targetCurrentScore = updatedRow?.composite_score ?? 0

  queueWebhookEvent('fraud.reported', {
    reportId,
    target,
    reporter: actualReporter,
    reason: body.reason,
    penaltyApplied: PENALTY_PER_REPORT,
    targetCurrentScore,
  })

  return {
    ok: true,
    status: 201,
    data: {
      reportId,
      status: 'accepted',
      targetCurrentScore,
      penaltyApplied: PENALTY_PER_REPORT,
    },
  }
}

export function getScoreHistoryTimeline(
  params: ScoreHistoryParams,
): EvidenceServiceResult<{
  wallet: Address
  history: Array<{
    score: number
    confidence: number
    model_version: string
    calculated_at: string
  }>
  count: number
  returned: number
  period: {
    from: string | null
    to: string | null
  }
  trend?: TrendSummary
  trajectory: {
    velocity: number | null
    momentum: number | null
    direction: 'improving' | 'declining' | 'stable' | 'volatile' | 'new'
    volatility: number
    modifier: number
    dataPoints: number
    spanDays: number
  }
}> {
  const wallet = normalizeWallet(params.rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  if (params.after && Number.isNaN(Date.parse(params.after))) {
    return invalidDateRangeError('after')
  }
  if (params.before && Number.isNaN(Date.parse(params.before))) {
    return invalidDateRangeError('before')
  }

  const limit = parseLimit(params.limit)
  const rows = listScoreHistory(wallet, {
    after: params.after,
    before: params.before,
    limit,
  })

  if (rows.length === 0) {
    return {
      ok: false,
      code: ErrorCodes.HISTORY_NOT_FOUND,
      message: 'No score history found for this wallet',
      status: 404,
    }
  }

  const totalCount = countScoreHistory(wallet, {
    after: params.after,
    before: params.before,
  })

  const trajectory = computeTrajectory({
    scores: rows.map((row) => ({ score: row.score, calculatedAt: row.calculated_at })),
  })

  const trend = buildTrend(rows)

  return {
    ok: true,
    data: {
      wallet,
      history: rows.map((row) => ({
        score: row.score,
        confidence: row.confidence,
        model_version: row.model_version,
        calculated_at: row.calculated_at,
      })),
      count: totalCount,
      returned: rows.length,
      period: {
        from: params.after ?? rows[rows.length - 1]!.calculated_at,
        to: params.before ?? rows[0]!.calculated_at,
      },
      ...(trend ? { trend } : {}),
      trajectory: {
        velocity: trajectory.velocity,
        momentum: trajectory.momentum,
        direction: trajectory.direction,
        volatility: trajectory.volatility,
        modifier: trajectory.modifier,
        dataPoints: trajectory.dataPoints,
        spanDays: trajectory.spanDays,
      },
    },
  }
}
