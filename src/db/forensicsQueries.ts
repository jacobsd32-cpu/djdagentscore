import type { DisputeResolution, DisputeStatus, FraudDisputeRow, FraudReportRow, ScoreHistoryRow } from '../types.js'
import { db } from './connection.js'
import { scoreToTier } from './reputationQueries.js'

const stmtGetHistory = db.prepare<[string], ScoreHistoryRow>(`
  SELECT * FROM score_history WHERE wallet = ? ORDER BY calculated_at DESC LIMIT 10
`)

const stmtInsertReport = db.prepare(`
  INSERT INTO fraud_reports (id, target_wallet, reporter_wallet, reason, details, created_at, penalty_applied)
  VALUES (@id, @target_wallet, @reporter_wallet, @reason, @details, @created_at, @penalty_applied)
`)

const stmtCountReports = db.prepare<[string], { count: number }>(`
  SELECT COUNT(*) as count
  FROM fraud_reports
  WHERE target_wallet = ? AND invalidated_at IS NULL
`)

const stmtListReportsByTarget = db.prepare<[string], { reason: string; created_at: string }>(`
  SELECT reason, created_at
  FROM fraud_reports
  WHERE target_wallet = ? AND invalidated_at IS NULL
  ORDER BY created_at DESC
`)

const stmtCountReporterReportsForTarget = db.prepare<[string, string], { count: number }>(`
  SELECT COUNT(*) as count
  FROM fraud_reports
  WHERE reporter_wallet = ? AND target_wallet = ? AND invalidated_at IS NULL
`)

const stmtCountDistinctReportersByTarget = db.prepare<[string], { count: number }>(`
  SELECT COUNT(DISTINCT reporter_wallet) as count
  FROM fraud_reports
  WHERE target_wallet = ? AND invalidated_at IS NULL
`)

const stmtSumPenaltyByTarget = db.prepare<[string], { total: number }>(`
  SELECT COALESCE(SUM(penalty_applied), 0) as total
  FROM fraud_reports
  WHERE target_wallet = ? AND invalidated_at IS NULL
`)

const stmtFraudReasonBreakdownByTarget = db.prepare<[string], { reason: string; count: number }>(`
  SELECT reason, COUNT(*) as count
  FROM fraud_reports
  WHERE target_wallet = ? AND invalidated_at IS NULL
  GROUP BY reason
  ORDER BY count DESC, reason ASC
`)

const stmtGetScoreForPenalty = db.prepare<[string], { composite_score: number }>(`
  SELECT composite_score FROM scores WHERE wallet = ?
`)

const stmtApplyPenalty = db.prepare(`
  UPDATE scores
  SET composite_score = MAX(0, composite_score - ?),
      tier = ?,
      calculated_at = datetime('now')
  WHERE wallet = ?
`)

const stmtRestorePenalty = db.prepare(`
  UPDATE scores
  SET composite_score = MIN(100, composite_score + ?),
      tier = ?,
      calculated_at = datetime('now')
  WHERE wallet = ?
`)

const stmtGetFraudReportById = db.prepare<[string], FraudReportRow>(`
  SELECT * FROM fraud_reports WHERE id = ? LIMIT 1
`)

const stmtInsertFraudDispute = db.prepare(`
  INSERT INTO fraud_disputes (
    id,
    report_id,
    target_wallet,
    disputing_wallet,
    reason,
    details,
    status,
    resolution,
    resolution_notes,
    created_at,
    resolved_at,
    resolved_by
  ) VALUES (
    @id,
    @report_id,
    @target_wallet,
    @disputing_wallet,
    @reason,
    @details,
    'open',
    NULL,
    NULL,
    @created_at,
    NULL,
    NULL
  )
`)

const stmtGetFraudDisputeByReportId = db.prepare<[string], FraudDisputeRow>(`
  SELECT * FROM fraud_disputes WHERE report_id = ? LIMIT 1
`)

const stmtGetFraudDisputeById = db.prepare<[string], FraudDisputeRow>(`
  SELECT * FROM fraud_disputes WHERE id = ? LIMIT 1
`)

const stmtMarkReportDisputed = db.prepare(`
  UPDATE fraud_reports SET disputed = 1 WHERE id = ?
`)

const stmtMarkReportDisputeResolved = db.prepare(`
  UPDATE fraud_reports SET dispute_resolved = 1 WHERE id = ?
`)

const stmtInvalidateReport = db.prepare(`
  UPDATE fraud_reports SET invalidated_at = ? WHERE id = ? AND invalidated_at IS NULL
`)

const stmtResolveFraudDispute = db.prepare(`
  UPDATE fraud_disputes
  SET status = 'resolved',
      resolution = ?,
      resolution_notes = ?,
      resolved_at = ?,
      resolved_by = ?
  WHERE id = ?
`)

export interface FraudReasonCountRow {
  reason: string
  count: number
}

export interface FraudPatternRow {
  pattern_name: string
  occurrences: number
  risk_weight: number
  first_detected: string | null
  last_detected: string | null
}

export interface ForensicsWatchlistRow {
  wallet: string
  current_score: number | null
  current_tier: string | null
  report_count: number
  unique_reporters: number
  total_penalty_applied: number
  most_recent_report_at: string
}

export interface ForensicsFeedRow {
  report_id: string
  wallet: string
  reason: string
  details: string
  created_at: string
  penalty_applied: number
  current_score: number | null
  current_tier: string | null
  report_count: number
  unique_reporters: number
  total_penalty_applied: number
}

export interface FraudDisputeAdminRow {
  dispute_id: string
  report_id: string
  target_wallet: string
  disputing_wallet: string
  dispute_reason: string
  dispute_details: string
  dispute_status: DisputeStatus
  dispute_resolution: DisputeResolution | null
  dispute_created_at: string
  dispute_resolved_at: string | null
  resolution_notes: string | null
  resolved_by: string | null
  report_reason: string
  report_details: string
  report_created_at: string
  reporter_wallet: string
  penalty_applied: number
  report_invalidated_at: string | null
}

function buildFraudConditions(
  alias: string,
  options: {
    after?: string
    before?: string
    reason?: string
  },
): { clause: string; args: string[] } {
  const clauses = [`${alias}.invalidated_at IS NULL`]
  const args: string[] = []

  if (options.after) {
    clauses.push(`${alias}.created_at >= ?`)
    args.push(options.after)
  }
  if (options.before) {
    clauses.push(`${alias}.created_at <= ?`)
    args.push(options.before)
  }
  if (options.reason) {
    clauses.push(`${alias}.reason = ?`)
    args.push(options.reason)
  }

  return { clause: clauses.join(' AND '), args }
}

function restoreReportPenalty(wallet: string, penalty: number): number {
  const row = stmtGetScoreForPenalty.get(wallet)
  if (!row) return 0

  const newScore = Math.min(100, row.composite_score + penalty)
  const newTier = scoreToTier(newScore)
  stmtRestorePenalty.run(penalty, newTier, wallet)
  return penalty
}

const createFraudDisputeTx = db.transaction(
  (dispute: {
    id: string
    report_id: string
    target_wallet: string
    disputing_wallet: string
    reason: string
    details: string
    created_at: string
  }) => {
    stmtInsertFraudDispute.run(dispute)
    stmtMarkReportDisputed.run(dispute.report_id)
  },
)

const resolveFraudDisputeTx = db.transaction(
  (params: {
    disputeId: string
    reportId: string
    targetWallet: string
    resolution: DisputeResolution
    resolutionNotes: string | null
    resolvedBy: string
    resolvedAt: string
    penaltyApplied: number
  }) => {
    stmtResolveFraudDispute.run(
      params.resolution,
      params.resolutionNotes,
      params.resolvedAt,
      params.resolvedBy,
      params.disputeId,
    )
    stmtMarkReportDisputeResolved.run(params.reportId)

    if (params.resolution === 'upheld') {
      stmtInvalidateReport.run(params.resolvedAt, params.reportId)
      return {
        penaltyRestored: restoreReportPenalty(params.targetWallet, params.penaltyApplied),
        reportInvalidated: true,
      }
    }

    return {
      penaltyRestored: 0,
      reportInvalidated: false,
    }
  },
)

export function insertReport(report: {
  id: string
  target_wallet: string
  reporter_wallet: string
  reason: string
  details: string
  penalty_applied: number
}): void {
  stmtInsertReport.run({
    ...report,
    created_at: new Date().toISOString(),
  })
}

export function getScoreHistory(wallet: string): ScoreHistoryRow[] {
  return stmtGetHistory.all(wallet)
}

export function listScoreHistory(
  wallet: string,
  options: {
    after?: string
    before?: string
    limit: number
  },
): ScoreHistoryRow[] {
  let sql = 'SELECT * FROM score_history WHERE wallet = ?'
  const args: Array<string | number> = [wallet]

  if (options.after) {
    sql += ' AND calculated_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND calculated_at <= ?'
    args.push(options.before)
  }

  sql += ' ORDER BY calculated_at DESC LIMIT ?'
  args.push(options.limit)

  return db.prepare(sql).all(...args) as ScoreHistoryRow[]
}

export function countScoreHistory(
  wallet: string,
  options: {
    after?: string
    before?: string
  } = {},
): number {
  let sql = 'SELECT COUNT(*) as count FROM score_history WHERE wallet = ?'
  const args: string[] = [wallet]

  if (options.after) {
    sql += ' AND calculated_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND calculated_at <= ?'
    args.push(options.before)
  }

  return (db.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
}

export function countReportsByTarget(wallet: string): number {
  return stmtCountReports.get(wallet)?.count ?? 0
}

export function listReportsByTarget(wallet: string): Array<{ reason: string; created_at: string }> {
  return stmtListReportsByTarget.all(wallet)
}

export function getFraudReportById(reportId: string): FraudReportRow | undefined {
  return stmtGetFraudReportById.get(reportId)
}

export function listFraudReportsByTarget(
  wallet: string,
  options: {
    after?: string
    before?: string
    limit: number
  },
): FraudReportRow[] {
  let sql = 'SELECT * FROM fraud_reports WHERE target_wallet = ? AND invalidated_at IS NULL'
  const args: Array<string | number> = [wallet]

  if (options.after) {
    sql += ' AND created_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND created_at <= ?'
    args.push(options.before)
  }

  sql += ' ORDER BY created_at DESC LIMIT ?'
  args.push(options.limit)

  return db.prepare(sql).all(...args) as FraudReportRow[]
}

export function countFraudReportsByTarget(
  wallet: string,
  options: {
    after?: string
    before?: string
  } = {},
): number {
  let sql = 'SELECT COUNT(*) as count FROM fraud_reports WHERE target_wallet = ? AND invalidated_at IS NULL'
  const args: string[] = [wallet]

  if (options.after) {
    sql += ' AND created_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND created_at <= ?'
    args.push(options.before)
  }

  return (db.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
}

export function sumFraudPenaltyByTarget(
  wallet: string,
  options: {
    after?: string
    before?: string
  } = {},
): number {
  if (!options.after && !options.before) {
    return stmtSumPenaltyByTarget.get(wallet)?.total ?? 0
  }

  let sql =
    'SELECT COALESCE(SUM(penalty_applied), 0) as total FROM fraud_reports WHERE target_wallet = ? AND invalidated_at IS NULL'
  const args: string[] = [wallet]

  if (options.after) {
    sql += ' AND created_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND created_at <= ?'
    args.push(options.before)
  }

  return (db.prepare(sql).get(...args) as { total: number } | undefined)?.total ?? 0
}

export function countDistinctReportersByTarget(
  wallet: string,
  options: {
    after?: string
    before?: string
  } = {},
): number {
  if (!options.after && !options.before) {
    return stmtCountDistinctReportersByTarget.get(wallet)?.count ?? 0
  }

  let sql =
    'SELECT COUNT(DISTINCT reporter_wallet) as count FROM fraud_reports WHERE target_wallet = ? AND invalidated_at IS NULL'
  const args: string[] = [wallet]

  if (options.after) {
    sql += ' AND created_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND created_at <= ?'
    args.push(options.before)
  }

  return (db.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
}

export function getFraudReasonBreakdown(wallet: string): FraudReasonCountRow[] {
  return stmtFraudReasonBreakdownByTarget.all(wallet)
}

export function listFraudPatternsByNames(names: string[]): FraudPatternRow[] {
  if (names.length === 0) return []

  const normalizedNames = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))]
  if (normalizedNames.length === 0) return []

  const placeholders = normalizedNames.map(() => '?').join(', ')
  return db
    .prepare<string[], FraudPatternRow>(
      `
        SELECT pattern_name, occurrences, risk_weight, first_detected, last_detected
        FROM fraud_patterns
        WHERE LOWER(pattern_name) IN (${placeholders})
        ORDER BY risk_weight DESC, occurrences DESC, pattern_name ASC
      `,
    )
    .all(...normalizedNames)
}

export function getFraudDisputeByReportId(reportId: string): FraudDisputeRow | undefined {
  return stmtGetFraudDisputeByReportId.get(reportId)
}

export function getFraudDisputeById(disputeId: string): FraudDisputeRow | undefined {
  return stmtGetFraudDisputeById.get(disputeId)
}

export function createFraudDispute(dispute: {
  id: string
  report_id: string
  target_wallet: string
  disputing_wallet: string
  reason: string
  details: string
}): void {
  createFraudDisputeTx({
    ...dispute,
    created_at: new Date().toISOString(),
  })
}

export function countFraudDisputesByTarget(
  wallet: string,
  options: {
    status?: DisputeStatus
  } = {},
): number {
  let sql = 'SELECT COUNT(*) as count FROM fraud_disputes WHERE target_wallet = ?'
  const args: string[] = [wallet]

  if (options.status) {
    sql += ' AND status = ?'
    args.push(options.status)
  }

  return (db.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
}

export function listFraudDisputes(options: {
  status?: DisputeStatus
  wallet?: string
  limit: number
}): FraudDisputeAdminRow[] {
  let sql = `
    SELECT
      fd.id as dispute_id,
      fd.report_id,
      fd.target_wallet,
      fd.disputing_wallet,
      fd.reason as dispute_reason,
      fd.details as dispute_details,
      fd.status as dispute_status,
      fd.resolution as dispute_resolution,
      fd.created_at as dispute_created_at,
      fd.resolved_at as dispute_resolved_at,
      fd.resolution_notes,
      fd.resolved_by,
      fr.reason as report_reason,
      fr.details as report_details,
      fr.created_at as report_created_at,
      fr.reporter_wallet,
      fr.penalty_applied,
      fr.invalidated_at as report_invalidated_at
    FROM fraud_disputes fd
    JOIN fraud_reports fr ON fr.id = fd.report_id
    WHERE 1 = 1
  `
  const args: Array<string | number> = []

  if (options.status) {
    sql += ' AND fd.status = ?'
    args.push(options.status)
  }
  if (options.wallet) {
    sql += ' AND fd.target_wallet = ?'
    args.push(options.wallet)
  }

  sql += `
    ORDER BY
      CASE WHEN fd.status = 'open' THEN 0 ELSE 1 END,
      fd.created_at DESC,
      fd.id ASC
    LIMIT ?
  `
  args.push(options.limit)

  return db.prepare(sql).all(...args) as FraudDisputeAdminRow[]
}

export function countFraudDisputes(options: { status?: DisputeStatus; wallet?: string } = {}): number {
  let sql = 'SELECT COUNT(*) as count FROM fraud_disputes WHERE 1 = 1'
  const args: string[] = []

  if (options.status) {
    sql += ' AND status = ?'
    args.push(options.status)
  }
  if (options.wallet) {
    sql += ' AND target_wallet = ?'
    args.push(options.wallet)
  }

  return (db.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
}

export function resolveFraudDispute(params: {
  disputeId: string
  reportId: string
  targetWallet: string
  resolution: DisputeResolution
  resolutionNotes?: string | null
  resolvedBy: string
  penaltyApplied: number
}): {
  resolvedAt: string
  penaltyRestored: number
  reportInvalidated: boolean
} {
  const resolvedAt = new Date().toISOString()
  const result = resolveFraudDisputeTx({
    disputeId: params.disputeId,
    reportId: params.reportId,
    targetWallet: params.targetWallet,
    resolution: params.resolution,
    resolutionNotes: params.resolutionNotes ?? null,
    resolvedBy: params.resolvedBy,
    resolvedAt,
    penaltyApplied: params.penaltyApplied,
  })

  return {
    resolvedAt,
    ...result,
  }
}

export function listForensicsWatchlist(options: {
  after?: string
  before?: string
  limit: number
}): ForensicsWatchlistRow[] {
  let sql = `
    SELECT
      fr.target_wallet as wallet,
      s.composite_score as current_score,
      s.tier as current_tier,
      COUNT(*) as report_count,
      COUNT(DISTINCT fr.reporter_wallet) as unique_reporters,
      COALESCE(SUM(fr.penalty_applied), 0) as total_penalty_applied,
      MAX(fr.created_at) as most_recent_report_at
    FROM fraud_reports fr
    LEFT JOIN scores s ON s.wallet = fr.target_wallet
    WHERE fr.invalidated_at IS NULL
  `
  const args: Array<string | number> = []

  if (options.after) {
    sql += ' AND fr.created_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND fr.created_at <= ?'
    args.push(options.before)
  }

  sql += `
    GROUP BY fr.target_wallet, s.composite_score, s.tier
    ORDER BY report_count DESC, unique_reporters DESC, total_penalty_applied DESC, most_recent_report_at DESC, wallet ASC
    LIMIT ?
  `
  args.push(options.limit)

  return db.prepare(sql).all(...args) as ForensicsWatchlistRow[]
}

export function countForensicsWatchlistTargets(options: { after?: string; before?: string } = {}): number {
  let sql = `
    SELECT COUNT(*) as count
    FROM (
      SELECT fr.target_wallet
      FROM fraud_reports fr
      WHERE fr.invalidated_at IS NULL
  `
  const args: string[] = []

  if (options.after) {
    sql += ' AND fr.created_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND fr.created_at <= ?'
    args.push(options.before)
  }

  sql += ' GROUP BY fr.target_wallet ) watchlist'

  return (db.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
}

export function listForensicsFeed(options: {
  after?: string
  before?: string
  reason?: string
  limit: number
}): ForensicsFeedRow[] {
  const aggregateFilter = buildFraudConditions('agg_src', options)
  const rowFilter = buildFraudConditions('fr', options)

  const sql = `
    SELECT
      fr.id as report_id,
      fr.target_wallet as wallet,
      fr.reason,
      fr.details,
      fr.created_at,
      fr.penalty_applied,
      s.composite_score as current_score,
      s.tier as current_tier,
      agg.report_count,
      agg.unique_reporters,
      agg.total_penalty_applied
    FROM fraud_reports fr
    JOIN (
      SELECT
        agg_src.target_wallet,
        COUNT(*) as report_count,
        COUNT(DISTINCT agg_src.reporter_wallet) as unique_reporters,
        COALESCE(SUM(agg_src.penalty_applied), 0) as total_penalty_applied
      FROM fraud_reports agg_src
      WHERE ${aggregateFilter.clause}
      GROUP BY agg_src.target_wallet
    ) agg ON agg.target_wallet = fr.target_wallet
    LEFT JOIN scores s ON s.wallet = fr.target_wallet
    WHERE ${rowFilter.clause}
    ORDER BY fr.created_at DESC, fr.target_wallet ASC, fr.id ASC
    LIMIT ?
  `

  return db.prepare(sql).all(...aggregateFilter.args, ...rowFilter.args, options.limit) as ForensicsFeedRow[]
}

export function countForensicsFeed(options: { after?: string; before?: string; reason?: string } = {}): number {
  const filter = buildFraudConditions('fr', options)
  const sql = `SELECT COUNT(*) as count FROM fraud_reports fr WHERE ${filter.clause}`
  return (db.prepare(sql).get(...filter.args) as { count: number } | undefined)?.count ?? 0
}

export function countReporterReportsForTarget(reporter: string, target: string): number {
  return stmtCountReporterReportsForTarget.get(reporter, target)?.count ?? 0
}

export function applyReportPenalty(wallet: string, penalty: number): void {
  const row = stmtGetScoreForPenalty.get(wallet)
  if (!row) return
  const newScore = Math.max(0, row.composite_score - penalty)
  const newTier = scoreToTier(newScore)
  stmtApplyPenalty.run(penalty, newTier, wallet)
}
