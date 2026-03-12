import type { ScoreHistoryRow } from '../types.js'
import { scoreToTier } from './reputationQueries.js'
import { db } from './connection.js'

const stmtGetHistory = db.prepare<[string], ScoreHistoryRow>(`
  SELECT * FROM score_history WHERE wallet = ? ORDER BY calculated_at DESC LIMIT 10
`)

const stmtInsertReport = db.prepare(`
  INSERT INTO fraud_reports (id, target_wallet, reporter_wallet, reason, details, created_at, penalty_applied)
  VALUES (@id, @target_wallet, @reporter_wallet, @reason, @details, @created_at, @penalty_applied)
`)

const stmtCountReports = db.prepare<[string], { count: number }>(`
  SELECT COUNT(*) as count FROM fraud_reports WHERE target_wallet = ?
`)

const stmtListReportsByTarget = db.prepare<[string], { reason: string; created_at: string }>(`
  SELECT reason, created_at
  FROM fraud_reports
  WHERE target_wallet = ?
  ORDER BY created_at DESC
`)

const stmtCountReporterReportsForTarget = db.prepare<[string, string], { count: number }>(`
  SELECT COUNT(*) as count FROM fraud_reports
  WHERE reporter_wallet = ? AND target_wallet = ?
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
  const args: (string | number)[] = [wallet]

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
  return stmtCountReports.get(wallet)!.count
}

export function listReportsByTarget(wallet: string): Array<{ reason: string; created_at: string }> {
  return stmtListReportsByTarget.all(wallet)
}

export function countReporterReportsForTarget(reporter: string, target: string): number {
  return stmtCountReporterReportsForTarget.get(reporter, target)!.count
}

export function applyReportPenalty(wallet: string, penalty: number): void {
  const row = stmtGetScoreForPenalty.get(wallet)
  if (!row) return
  const newScore = Math.max(0, row.composite_score - penalty)
  const newTier = scoreToTier(newScore)
  stmtApplyPenalty.run(penalty, newTier, wallet)
}
