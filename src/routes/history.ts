/**
 * Historical Score API
 * GET /v1/score/history?wallet=0x...&limit=50&after=2024-01-01&before=2025-01-01
 *
 * Returns paginated score history with trend analysis.
 * Protected by x402 ($0.15 USDC) or API key auth.
 */
import { Hono } from 'hono'
import { db } from '../db.js'
import { errorResponse } from '../errors.js'
import { computeTrajectory } from '../scoring/trajectory.js'
import { normalizeWallet } from '../utils/walletUtils.js'

const history = new Hono()

interface ScoreHistoryRow {
  id: number
  wallet: string
  score: number
  calculated_at: string
  confidence: number
  model_version: string
}

history.get('/', (c) => {
  const wallet = normalizeWallet(c.req.query('wallet'))
  if (!wallet) {
    return c.json(errorResponse('invalid_wallet', 'Valid Ethereum wallet address required'), 400)
  }

  const parsedLimit = Number.parseInt(c.req.query('limit') ?? '50', 10)
  const limitParam = Math.min(Math.max(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 1), 100)
  const after = c.req.query('after') // ISO date string
  const before = c.req.query('before') // ISO date string

  // Validate date params if provided
  if (after && Number.isNaN(Date.parse(after))) {
    return c.json(errorResponse('invalid_date_range', 'Invalid "after" date format. Use ISO 8601 (YYYY-MM-DD)'), 400)
  }
  if (before && Number.isNaN(Date.parse(before))) {
    return c.json(errorResponse('invalid_date_range', 'Invalid "before" date format. Use ISO 8601 (YYYY-MM-DD)'), 400)
  }

  // Build dynamic query
  let sql = 'SELECT * FROM score_history WHERE wallet = ?'
  const args: (string | number)[] = [wallet]

  if (after) {
    sql += ' AND calculated_at >= ?'
    args.push(after)
  }
  if (before) {
    sql += ' AND calculated_at <= ?'
    args.push(before)
  }

  sql += ' ORDER BY calculated_at DESC LIMIT ?'
  args.push(limitParam)

  const rows = db.prepare(sql).all(...args) as ScoreHistoryRow[]

  if (rows.length === 0) {
    return c.json(errorResponse('history_not_found', 'No score history found for this wallet'), 404)
  }

  // Get total count for the wallet
  let countSql = 'SELECT COUNT(*) as count FROM score_history WHERE wallet = ?'
  const countArgs: (string | number)[] = [wallet]
  if (after) {
    countSql += ' AND calculated_at >= ?'
    countArgs.push(after)
  }
  if (before) {
    countSql += ' AND calculated_at <= ?'
    countArgs.push(before)
  }
  const totalCount = (db.prepare(countSql).get(...countArgs) as { count: number })?.count ?? 0

  // v2.5: Use computeTrajectory for richer analysis (backward-compat trend fields preserved)
  const trajectory = computeTrajectory({
    scores: rows.map((r) => ({ score: r.score, calculatedAt: r.calculated_at })),
  })

  // Backward-compatible trend object (old 3-state direction + basic stats)
  let trend: { direction: string; change_pct: number; avg_score: number; min_score: number; max_score: number } | null =
    null
  if (rows.length >= 2) {
    const scores = rows.map((r) => r.score)
    const latest = scores[0]!
    const earliest = scores[scores.length - 1]!
    const change = latest - earliest
    const changePct = earliest !== 0 ? (change / earliest) * 100 : 0
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    // Preserve original 3-state logic: ±5 score threshold (not velocity-based)
    const dir3 = Math.abs(change) <= 5 ? 'stable' : change > 0 ? 'improving' : 'declining'
    trend = {
      direction: dir3,
      change_pct: Math.round(changePct * 10) / 10,
      avg_score: Math.round(avg * 10) / 10,
      min_score: Math.min(...scores),
      max_score: Math.max(...scores),
    }
  }

  return c.json({
    wallet,
    history: rows.map((r) => ({
      score: r.score,
      confidence: r.confidence,
      model_version: r.model_version,
      calculated_at: r.calculated_at,
    })),
    count: totalCount,
    returned: rows.length,
    period: {
      from: after ?? (rows.length > 0 ? rows[rows.length - 1]!.calculated_at : null),
      to: before ?? (rows.length > 0 ? rows[0]!.calculated_at : null),
    },
    ...(trend ? { trend } : {}),
    // v2.5: Rich trajectory analysis
    trajectory: {
      velocity: trajectory.velocity,
      momentum: trajectory.momentum,
      direction: trajectory.direction,
      volatility: trajectory.volatility,
      modifier: trajectory.modifier,
      dataPoints: trajectory.dataPoints,
      spanDays: trajectory.spanDays,
    },
  })
})

export default history
