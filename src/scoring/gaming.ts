/**
 * Anti-Gaming Velocity Checks
 *
 * Runs AFTER blockchain data is fetched (needs current balance).
 * Queries wallet_metrics, wallet_snapshots, raw_transactions, and query_log
 * from the local DB. Safe to call when tables are empty (returns a clean result).
 */
import type { Database } from 'better-sqlite3'

export interface GamingResult {
  gamingDetected: boolean
  indicators: string[]
  penalties: {
    composite: number
    reliability: number
    viability: number
  }
  overrides: {
    useAvgBalance: boolean
  }
}

interface MetricsRow {
  tx_count_24h: number
  tx_count_7d: number
}

/**
 * Returns the 24-hour average USDC balance (as a float) from wallet_snapshots,
 * or null if no snapshot data exists for the window.
 */
export function getAvgBalance24h(wallet: string, db: Database): number | null {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const row = db
    .prepare<[string, string], { avg_balance: number | null }>(
      `SELECT AVG(usdc_balance) as avg_balance
       FROM wallet_snapshots
       WHERE wallet = ? AND snapshot_at >= ?`,
    )
    .get(wallet.toLowerCase(), since)
  const val = row?.avg_balance
  return val != null && val > 0 ? val : null
}

export function detectGaming(wallet: string, currentBalanceUsdc: number, db: Database): GamingResult {
  const w = wallet.toLowerCase()
  const indicators: string[] = []
  const penalties = { composite: 0, reliability: 0, viability: 0 }
  const overrides = { useAvgBalance: false }

  // ── CHECK 1: Transaction velocity spike ───────────────────────────────────
  // >10x increase in tx count vs 7-day average within 24hrs → -10 composite.
  const metricsRow = db
    .prepare<[string], MetricsRow>(`SELECT tx_count_24h, tx_count_7d FROM wallet_metrics WHERE wallet = ?`)
    .get(w)

  if (metricsRow && metricsRow.tx_count_7d > 0) {
    const dailyAvg7d = metricsRow.tx_count_7d / 7
    if (dailyAvg7d > 0 && metricsRow.tx_count_24h > dailyAvg7d * 10) {
      indicators.push('velocity_spike')
      penalties.composite += 10
    }
  }

  // ── CHECK 2: Deposit-and-score pattern ────────────────────────────────────
  // Current balance >5x 24hr avg AND score was queried within last 1hr → -5 viability.
  const avgBalance = getAvgBalance24h(w, db)
  const balanceWindowDressing = avgBalance !== null && avgBalance > 0 && currentBalanceUsdc > avgBalance * 5

  if (balanceWindowDressing) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentQuery = db
      .prepare<[string, string], { count: number }>(
        `SELECT COUNT(*) as count FROM query_log
         WHERE target_wallet = ?
           AND timestamp >= ?
           AND endpoint IN ('/v1/score/basic', '/v1/score/full', '/v1/score/refresh')`,
      )
      .get(w, oneHourAgo)

    if (recentQuery && recentQuery.count > 0) {
      indicators.push('deposit_and_score')
      penalties.viability += 5
    }
  }

  // ── CHECK 3: Burst-and-stop ────────────────────────────────────────────────
  // 0 tx in last 1hr AND >20 tx in the preceding 24hr window → -8 reliability.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const recentRow = db
    .prepare<[string, string, string], { count: number }>(
      `SELECT COUNT(*) as count FROM raw_transactions
       WHERE (from_wallet = ? OR to_wallet = ?) AND timestamp >= ?`,
    )
    .get(w, w, oneHourAgo)

  if (recentRow && recentRow.count === 0) {
    const priorBurstRow = db
      .prepare<[string, string, string, string], { count: number }>(
        `SELECT COUNT(*) as count FROM raw_transactions
         WHERE (from_wallet = ? OR to_wallet = ?)
           AND timestamp >= ? AND timestamp < ?`,
      )
      .get(w, w, oneDayAgo, oneHourAgo)

    if (priorBurstRow && priorBurstRow.count > 20) {
      indicators.push('burst_and_stop')
      penalties.reliability += 8
    }
  }

  // ── CHECK 4: Balance window-dressing ──────────────────────────────────────
  // Current balance 5x higher than 24hr avg → -10 viability, use avg balance instead.
  // Only flag separately if not already flagged as deposit_and_score.
  if (balanceWindowDressing) {
    overrides.useAvgBalance = true
    if (!indicators.includes('deposit_and_score')) {
      indicators.push('balance_window_dressing')
      penalties.viability += 10
    }
  }

  // ── CHECK 5: Wash trading (self-transfer loops) ─────────────────────────
  // Detects funds sent A→B then B→A within 24 hours (round-trip).
  // A high ratio of round-trip volume to total volume indicates wash trading
  // used to inflate transaction counts without real economic activity.
  // Threshold: >40% of 7-day volume is round-trip → flag as wash trading.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const washRow = db
    .prepare<unknown[], { wash_volume: number; total_volume: number }>(`
      WITH outgoing AS (
        SELECT to_wallet AS partner, SUM(amount) AS out_vol
        FROM raw_transactions
        WHERE from_wallet = ? AND timestamp >= ?
        GROUP BY to_wallet
      ),
      incoming AS (
        SELECT from_wallet AS partner, SUM(amount) AS in_vol
        FROM raw_transactions
        WHERE to_wallet = ? AND timestamp >= ?
        GROUP BY from_wallet
      )
      SELECT
        COALESCE(SUM(MIN(o.out_vol, i.in_vol)), 0) AS wash_volume,
        COALESCE((SELECT SUM(amount) FROM raw_transactions
                  WHERE (from_wallet = ? OR to_wallet = ?) AND timestamp >= ?), 0) AS total_volume
      FROM outgoing o
      INNER JOIN incoming i ON o.partner = i.partner
    `)
    .get(w, sevenDaysAgo, w, sevenDaysAgo, w, w, sevenDaysAgo)

  if (washRow && washRow.total_volume > 0) {
    const washRatio = washRow.wash_volume / washRow.total_volume
    // >40% round-trip volume = wash trading; scale penalty by severity
    if (washRatio > 0.4) {
      indicators.push('wash_trading')
      // Heavier penalty for higher wash ratios: 8 pts at 40%, up to 15 at 80%+
      const scaledPenalty = Math.min(15, Math.round(8 + (washRatio - 0.4) * 17.5))
      penalties.reliability += scaledPenalty
      penalties.composite += 5
    }
  }

  return {
    gamingDetected: indicators.length > 0,
    indicators,
    penalties,
    overrides,
  }
}
