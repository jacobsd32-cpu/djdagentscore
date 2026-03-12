import { v4 as uuidv4 } from 'uuid'
import { REPORT_CONFIG } from '../config/constants.js'
import {
  adjustScoreByStakeBoost,
  applyReportPenalty,
  countDistinctReportersByTarget,
  countForensicsFeed,
  countForensicsWatchlistTargets,
  countFraudDisputesByTarget,
  countFraudReportsByTarget,
  countReporterReportsForTarget,
  countScoreHistory,
  createFraudDispute,
  getFraudDisputeByReportId,
  getFraudReasonBreakdown,
  getFraudReportById,
  getScore,
  insertReport,
  listForensicsFeed,
  listForensicsWatchlist,
  listFraudReportsByTarget,
  listScoreHistory,
  slashActiveCreatorStakesForAgent,
  sumFraudPenaltyByTarget,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import { queueWebhookEvent } from '../jobs/webhookDelivery.js'
import { computeTrajectory } from '../scoring/trajectory.js'
import {
  type Address,
  DISPUTE_REASONS,
  type DisputeReason,
  type FraudDisputeBody,
  type FraudReportRow,
  REPORT_REASONS,
  type ReportBody,
  type ReportReason,
  type ScoreHistoryRow,
} from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'

const { PENALTY_PER_REPORT, MAX_REPORTS_PER_PAIR, MAX_DETAILS_LENGTH } = REPORT_CONFIG

interface EvidenceServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 404 | 409 | 429
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

type ForensicsRiskLevel = 'clear' | 'watch' | 'elevated' | 'critical'
type ForensicsDisputeStatus = 'none' | 'open' | 'resolved'

interface ForensicsOverviewView {
  wallet: Address
  risk_level: ForensicsRiskLevel
  current_score: number | null
  current_tier: string | null
  report_count: number
  total_penalty_applied: number
  unique_reporters: number
  most_recent_report_at: string | null
  dispute_status: ForensicsDisputeStatus
  open_disputes: number
  resolved_disputes: number
  score_history_entries: number
  reasons: Array<{
    reason: string
    count: number
  }>
  recent_reports: Array<{
    report_id: string
    reason: string
    created_at: string
    penalty_applied: number
  }>
}

interface ForensicsTimelineParams extends ScoreHistoryParams {}

interface ForensicsReportsView {
  wallet: Address
  risk_level: ForensicsRiskLevel
  reports: Array<{
    report_id: string
    reason: string
    details: string
    created_at: string
    penalty_applied: number
  }>
  count: number
  returned: number
  unique_reporters: number
  total_penalty_applied: number
  period: {
    from: string | null
    to: string | null
  }
}

interface ForensicsWatchlistView {
  wallets: Array<{
    rank: number
    wallet: Address
    risk_level: ForensicsRiskLevel
    current_score: number | null
    current_tier: string | null
    report_count: number
    unique_reporters: number
    total_penalty_applied: number
    most_recent_report_at: string
  }>
  count: number
  returned: number
  period: {
    from: string | null
    to: string | null
  }
}

interface ForensicsFeedParams {
  reason: string | undefined
  limit: string | undefined
  after: string | undefined
  before: string | undefined
}

interface ForensicsFeedView {
  incidents: Array<{
    report_id: string
    wallet: Address
    reason: string
    details: string
    created_at: string
    penalty_applied: number
    current_score: number | null
    current_tier: string | null
    risk_level: ForensicsRiskLevel
    report_count: number
    unique_reporters: number
    total_penalty_applied: number
  }>
  count: number
  returned: number
  reason_filter: string | null
  period: {
    from: string | null
    to: string | null
  }
}

type ForensicsTimelineEvent =
  | {
      type: 'score_snapshot'
      timestamp: string
      score: number
      confidence: number
      model_version: string
    }
  | {
      type: 'fraud_report'
      timestamp: string
      report_id: string
      reason: string
      penalty_applied: number
    }

interface ForensicsTimelineView {
  wallet: Address
  risk_level: ForensicsRiskLevel
  events: ForensicsTimelineEvent[]
  count: number
  returned: number
  breakdown: {
    score_snapshots: number
    fraud_reports: number
  }
  report_summary: {
    report_count: number
    total_penalty_applied: number
  }
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
}

interface FraudDisputeSubmissionView {
  disputeId: string
  status: 'open'
  reportId: string
  targetWallet: Address
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

function classifyForensicsRiskLevel(reportCount: number, totalPenaltyApplied: number): ForensicsRiskLevel {
  if (reportCount === 0) return 'clear'
  if (reportCount >= 4 || totalPenaltyApplied >= 20) return 'critical'
  if (reportCount >= 2 || totalPenaltyApplied >= 10) return 'elevated'
  return 'watch'
}

function classifyForensicsDisputeStatus(openDisputes: number, resolvedDisputes: number): ForensicsDisputeStatus {
  if (openDisputes > 0) return 'open'
  if (resolvedDisputes > 0) return 'resolved'
  return 'none'
}

function buildForensicsReportView(report: FraudReportRow) {
  return {
    report_id: report.id,
    reason: report.reason,
    created_at: report.created_at,
    penalty_applied: report.penalty_applied,
  }
}

function buildForensicsReportDetailView(report: FraudReportRow) {
  return {
    ...buildForensicsReportView(report),
    details: report.details,
  }
}

function parseReasonFilter(rawReason: string | undefined): string | undefined {
  const reason = rawReason?.trim()
  if (!reason) return undefined

  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    throw new Error(`invalid_reason_filter:${reason}`)
  }

  return reason
}

function parseDisputeReason(rawReason: unknown): DisputeReason | null {
  if (typeof rawReason !== 'string') return null
  const reason = rawReason.trim()
  if (!reason) return null
  return (DISPUTE_REASONS as readonly string[]).includes(reason) ? (reason as DisputeReason) : null
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

interface ForensicsSignalSnapshot {
  reportCount: number
  totalPenaltyApplied: number
  riskLevel: ForensicsRiskLevel
}

function getForensicsSignalSnapshot(wallet: string): ForensicsSignalSnapshot {
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
  previous: ForensicsSignalSnapshot
  current: ForensicsSignalSnapshot
  reportId?: string
  reportReason?: ReportReason
  disputeId?: string
  resolution?: 'upheld' | 'rejected'
}) {
  if (params.previous.reportCount === 0 && params.current.reportCount > 0) {
    queueWebhookEvent('forensics.watchlist.entered', {
      wallet: params.wallet,
      reportId: params.reportId ?? null,
      reportReason: params.reportReason ?? null,
      disputeId: params.disputeId ?? null,
      reportCount: params.current.reportCount,
      totalPenaltyApplied: params.current.totalPenaltyApplied,
      riskLevel: params.current.riskLevel,
      currentRiskLevel: params.current.riskLevel,
    })
  }

  if (params.previous.reportCount > 0 && params.current.reportCount === 0) {
    queueWebhookEvent('forensics.watchlist.cleared', {
      wallet: params.wallet,
      reportId: params.reportId ?? null,
      reportReason: params.reportReason ?? null,
      disputeId: params.disputeId ?? null,
      resolution: params.resolution ?? null,
      previousReportCount: params.previous.reportCount,
      previousRiskLevel: params.previous.riskLevel,
      currentRiskLevel: params.current.riskLevel,
    })
  }

  if (params.previous.riskLevel !== params.current.riskLevel) {
    queueWebhookEvent('forensics.risk.changed', {
      wallet: params.wallet,
      reportId: params.reportId ?? null,
      reportReason: params.reportReason ?? null,
      disputeId: params.disputeId ?? null,
      resolution: params.resolution ?? null,
      previousRiskLevel: params.previous.riskLevel,
      currentRiskLevel: params.current.riskLevel,
      previousReportCount: params.previous.reportCount,
      currentReportCount: params.current.reportCount,
      previousTotalPenaltyApplied: params.previous.totalPenaltyApplied,
      currentTotalPenaltyApplied: params.current.totalPenaltyApplied,
    })
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

  const previousState = getForensicsSignalSnapshot(target)
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
  const slashedStakes = slashActiveCreatorStakesForAgent(target, reportId)
  if (slashedStakes.total_score_boost > 0) {
    adjustScoreByStakeBoost(target, -slashedStakes.total_score_boost)
  }
  const currentState = getForensicsSignalSnapshot(target)

  const updatedRow = getScore(target)
  const targetCurrentScore = updatedRow?.composite_score ?? 0

  queueWebhookEvent('fraud.reported', {
    reportId,
    target,
    reporter: actualReporter,
    reason: body.reason,
    reportReason: body.reason,
    penaltyApplied: PENALTY_PER_REPORT,
    creatorStakeCountSlashed: slashedStakes.stake_count,
    creatorStakeAmountSlashed: slashedStakes.total_stake_amount,
    creatorStakeBoostRemoved: slashedStakes.total_score_boost,
    targetCurrentScore,
    riskLevel: currentState.riskLevel,
    currentRiskLevel: currentState.riskLevel,
  })
  emitForensicsLifecycleEvents({
    wallet: target,
    previous: previousState,
    current: currentState,
    reportId,
    reportReason: body.reason as ReportReason,
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

export function submitFraudDispute(
  body: FraudDisputeBody,
  disputingWallet: string | null | undefined,
): EvidenceServiceResult<FraudDisputeSubmissionView> {
  if (!body || typeof body.report_id !== 'string' || body.report_id.trim().length === 0) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_DISPUTE,
      message: 'report_id is required',
      status: 400,
    }
  }

  const reason = parseDisputeReason(body.reason)
  if (!reason) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_DISPUTE,
      message: `Invalid dispute reason. Must be one of: ${DISPUTE_REASONS.join(', ')}`,
      status: 400,
      details: { validReasons: [...DISPUTE_REASONS] },
    }
  }

  if (typeof body.details !== 'string' || body.details.trim().length === 0) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_DISPUTE,
      message: 'details is required',
      status: 400,
    }
  }

  const actualDisputingWallet = normalizeWallet(disputingWallet)
  if (!actualDisputingWallet) {
    return invalidWalletError('Could not determine disputing wallet from payment')
  }

  const report = getFraudReportById(body.report_id.trim())
  if (!report) {
    return {
      ok: false,
      code: ErrorCodes.DISPUTE_NOT_FOUND,
      message: 'Fraud report not found',
      status: 404,
    }
  }

  if (report.invalidated_at) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_DISPUTE,
      message: 'This report has already been invalidated and cannot be disputed again',
      status: 409,
    }
  }

  if (actualDisputingWallet !== report.target_wallet) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_DISPUTE,
      message: 'Only the reported wallet can dispute this report',
      status: 409,
    }
  }

  const existingDispute = getFraudDisputeByReportId(report.id)
  if (existingDispute) {
    return {
      ok: false,
      code: existingDispute.status === 'open' ? ErrorCodes.DISPUTE_ALREADY_OPEN : ErrorCodes.DISPUTE_ALREADY_RESOLVED,
      message:
        existingDispute.status === 'open'
          ? 'A dispute is already open for this report'
          : 'This report dispute has already been resolved',
      status: 409,
    }
  }

  const disputeId = uuidv4()
  createFraudDispute({
    id: disputeId,
    report_id: report.id,
    target_wallet: report.target_wallet,
    disputing_wallet: actualDisputingWallet,
    reason,
    details: body.details.trim().slice(0, MAX_DETAILS_LENGTH),
  })

  const currentState = getForensicsSignalSnapshot(report.target_wallet)

  queueWebhookEvent('fraud.disputed', {
    disputeId,
    reportId: report.id,
    target: report.target_wallet,
    disputingWallet: actualDisputingWallet,
    reason,
    reportReason: report.reason,
    riskLevel: currentState.riskLevel,
    currentRiskLevel: currentState.riskLevel,
  })

  return {
    ok: true,
    status: 201,
    data: {
      disputeId,
      status: 'open',
      reportId: report.id,
      targetWallet: report.target_wallet as Address,
    },
  }
}

export function getForensicsFeed(params: ForensicsFeedParams): EvidenceServiceResult<ForensicsFeedView> {
  if (params.after && Number.isNaN(Date.parse(params.after))) {
    return invalidDateRangeError('after')
  }
  if (params.before && Number.isNaN(Date.parse(params.before))) {
    return invalidDateRangeError('before')
  }

  let reason: string | undefined
  try {
    reason = parseReasonFilter(params.reason)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('invalid_reason_filter:')) {
      return {
        ok: false,
        code: ErrorCodes.INVALID_REPORT,
        message: `Invalid reason filter. Must be one of: ${REPORT_REASONS.join(', ')}`,
        status: 400,
        details: { validReasons: [...REPORT_REASONS] },
      }
    }
    throw err
  }

  const limit = parseLimit(params.limit)
  const rows = listForensicsFeed({
    after: params.after,
    before: params.before,
    reason,
    limit,
  })
  const totalCount = countForensicsFeed({
    after: params.after,
    before: params.before,
    reason,
  })

  return {
    ok: true,
    data: {
      incidents: rows.map((row) => ({
        report_id: row.report_id,
        wallet: row.wallet as Address,
        reason: row.reason,
        details: row.details,
        created_at: row.created_at,
        penalty_applied: row.penalty_applied,
        current_score: row.current_score,
        current_tier: row.current_tier,
        risk_level: classifyForensicsRiskLevel(row.report_count, row.total_penalty_applied),
        report_count: row.report_count,
        unique_reporters: row.unique_reporters,
        total_penalty_applied: row.total_penalty_applied,
      })),
      count: totalCount,
      returned: rows.length,
      reason_filter: reason ?? null,
      period: {
        from: params.after ?? null,
        to: params.before ?? null,
      },
    },
  }
}

export function getForensicsOverview(rawWallet: string | undefined): EvidenceServiceResult<ForensicsOverviewView> {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  const currentScore = getScore(wallet)
  const reportCount = countFraudReportsByTarget(wallet)
  const totalPenaltyApplied = sumFraudPenaltyByTarget(wallet)
  const uniqueReporters = countDistinctReportersByTarget(wallet)
  const recentReports = listFraudReportsByTarget(wallet, { limit: 5 })
  const scoreHistoryEntries = countScoreHistory(wallet)
  const openDisputes = countFraudDisputesByTarget(wallet, { status: 'open' })
  const resolvedDisputes = countFraudDisputesByTarget(wallet, { status: 'resolved' })

  return {
    ok: true,
    data: {
      wallet,
      risk_level: classifyForensicsRiskLevel(reportCount, totalPenaltyApplied),
      current_score: currentScore?.composite_score ?? null,
      current_tier: currentScore?.tier ?? null,
      report_count: reportCount,
      total_penalty_applied: totalPenaltyApplied,
      unique_reporters: uniqueReporters,
      most_recent_report_at: recentReports[0]?.created_at ?? null,
      dispute_status: classifyForensicsDisputeStatus(openDisputes, resolvedDisputes),
      open_disputes: openDisputes,
      resolved_disputes: resolvedDisputes,
      score_history_entries: scoreHistoryEntries,
      reasons: getFraudReasonBreakdown(wallet),
      recent_reports: recentReports.map(buildForensicsReportView),
    },
  }
}

export function getForensicsReports(params: ForensicsTimelineParams): EvidenceServiceResult<ForensicsReportsView> {
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
  const reports = listFraudReportsByTarget(wallet, {
    after: params.after,
    before: params.before,
    limit,
  })
  const reportCount = countFraudReportsByTarget(wallet, {
    after: params.after,
    before: params.before,
  })
  const totalPenaltyApplied = sumFraudPenaltyByTarget(wallet, {
    after: params.after,
    before: params.before,
  })

  return {
    ok: true,
    data: {
      wallet,
      risk_level: classifyForensicsRiskLevel(reportCount, totalPenaltyApplied),
      reports: reports.map(buildForensicsReportDetailView),
      count: reportCount,
      returned: reports.length,
      unique_reporters: countDistinctReportersByTarget(wallet, {
        after: params.after,
        before: params.before,
      }),
      total_penalty_applied: totalPenaltyApplied,
      period: {
        from: params.after ?? reports[reports.length - 1]?.created_at ?? null,
        to: params.before ?? reports[0]?.created_at ?? null,
      },
    },
  }
}

export function getForensicsWatchlist(
  params: Omit<ForensicsTimelineParams, 'rawWallet'>,
): EvidenceServiceResult<ForensicsWatchlistView> {
  if (params.after && Number.isNaN(Date.parse(params.after))) {
    return invalidDateRangeError('after')
  }
  if (params.before && Number.isNaN(Date.parse(params.before))) {
    return invalidDateRangeError('before')
  }

  const limit = parseLimit(params.limit)
  const rows = listForensicsWatchlist({
    after: params.after,
    before: params.before,
    limit,
  })
  const totalCount = countForensicsWatchlistTargets({
    after: params.after,
    before: params.before,
  })

  return {
    ok: true,
    data: {
      wallets: rows.map((row, idx) => ({
        rank: idx + 1,
        wallet: row.wallet as Address,
        risk_level: classifyForensicsRiskLevel(row.report_count, row.total_penalty_applied),
        current_score: row.current_score,
        current_tier: row.current_tier,
        report_count: row.report_count,
        unique_reporters: row.unique_reporters,
        total_penalty_applied: row.total_penalty_applied,
        most_recent_report_at: row.most_recent_report_at,
      })),
      count: totalCount,
      returned: rows.length,
      period: {
        from: params.after ?? null,
        to: params.before ?? null,
      },
    },
  }
}

export function getForensicsTimeline(params: ForensicsTimelineParams): EvidenceServiceResult<ForensicsTimelineView> {
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
  const scoreRows = listScoreHistory(wallet, {
    after: params.after,
    before: params.before,
    limit,
  })
  const reportRows = listFraudReportsByTarget(wallet, {
    after: params.after,
    before: params.before,
    limit,
  })

  if (scoreRows.length === 0 && reportRows.length === 0) {
    return {
      ok: false,
      code: ErrorCodes.FORENSICS_NOT_FOUND,
      message: 'No forensics data found for this wallet',
      status: 404,
    }
  }

  const scoreCount = countScoreHistory(wallet, {
    after: params.after,
    before: params.before,
  })
  const reportCount = countFraudReportsByTarget(wallet, {
    after: params.after,
    before: params.before,
  })
  const totalPenaltyApplied = sumFraudPenaltyByTarget(wallet, {
    after: params.after,
    before: params.before,
  })

  const trajectory = computeTrajectory({
    scores: scoreRows.map((row) => ({ score: row.score, calculatedAt: row.calculated_at })),
  })
  const trend = buildTrend(scoreRows)

  const events = [
    ...scoreRows.map((row) => ({
      type: 'score_snapshot' as const,
      timestamp: row.calculated_at,
      score: row.score,
      confidence: row.confidence,
      model_version: row.model_version,
    })),
    ...reportRows.map((report) => ({
      type: 'fraud_report' as const,
      timestamp: report.created_at,
      report_id: report.id,
      reason: report.reason,
      penalty_applied: report.penalty_applied,
    })),
  ]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit)

  return {
    ok: true,
    data: {
      wallet,
      risk_level: classifyForensicsRiskLevel(reportCount, totalPenaltyApplied),
      events,
      count: scoreCount + reportCount,
      returned: events.length,
      breakdown: {
        score_snapshots: scoreCount,
        fraud_reports: reportCount,
      },
      report_summary: {
        report_count: reportCount,
        total_penalty_applied: totalPenaltyApplied,
      },
      period: {
        from: params.after ?? events[events.length - 1]?.timestamp ?? null,
        to: params.before ?? events[0]?.timestamp ?? null,
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

export function getFraudBlacklistView(rawWallet: string | undefined): EvidenceServiceResult<{
  wallet: Address
  reported: boolean
  reportCount: number
  mostRecentDate: string | null
  reasons: string[]
  disputeStatus: ForensicsDisputeStatus
}> {
  const outcome = getForensicsOverview(rawWallet)
  if (!outcome.ok) {
    return outcome
  }

  return {
    ok: true,
    data: {
      wallet: outcome.data.wallet,
      reported: outcome.data.report_count > 0,
      reportCount: outcome.data.report_count,
      mostRecentDate: outcome.data.most_recent_report_at,
      reasons: outcome.data.reasons.map((entry) => entry.reason),
      disputeStatus: outcome.data.dispute_status,
    },
  }
}

export function getScoreHistoryTimeline(params: ScoreHistoryParams): EvidenceServiceResult<{
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
