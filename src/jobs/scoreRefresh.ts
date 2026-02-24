/**
 * Hourly Score Refresh Job
 *
 * For each expired wallet (and certified wallets every 15 min):
 *   1. Fetch current USDC balance and snapshot it
 *   2. Recompute wallet_metrics (tx counts, volumes, trend)
 *   3. Run full scoring engine (sybil + gaming + confidence)
 *
 * After all wallets, aggregates an hourly economy_metrics row.
 */
import { parseAbi } from 'viem'
import { getPublicClient, USDC_ADDRESS } from '../blockchain.js'
import { db, getExpiredWallets } from '../db.js'
import { log } from '../logger.js'
import { getOrCalculateScore } from '../scoring/engine.js'
import type { Address } from '../types.js'
import { jobStats } from './jobStats.js'

const REFRESH_BATCH_SIZE = 50
const INTER_WALLET_DELAY_MS = 200

const BALANCE_OF_ABI = parseAbi(['function balanceOf(address) returns (uint256)'])

// ---------- Helpers ----------

interface PeriodMetrics {
  tx_count: number
  volume_in: number
  volume_out: number
}

function getPeriodMetrics(wallet: string, since: string): PeriodMetrics {
  const row = db
    .prepare<[string, string, string, string, string], PeriodMetrics>(
      `SELECT
         COUNT(*) as tx_count,
         COALESCE(SUM(CASE WHEN to_wallet = ? THEN amount_usdc ELSE 0 END), 0) as volume_in,
         COALESCE(SUM(CASE WHEN from_wallet = ? THEN amount_usdc ELSE 0 END), 0) as volume_out
       FROM raw_transactions
       WHERE (from_wallet = ? OR to_wallet = ?) AND timestamp >= ?`,
    )
    .get(wallet, wallet, wallet, wallet, since)
  return row ?? { tx_count: 0, volume_in: 0, volume_out: 0 }
}

async function snapshotAndUpdateMetrics(wallet: string): Promise<void> {
  const now = new Date()
  const nowStr = now.toISOString()
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const d7ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const d30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // ── Fetch and snapshot current USDC balance ──────────────────────────────
  let currentBalance = 0
  try {
    const raw = await getPublicClient().readContract({
      address: USDC_ADDRESS,
      abi: BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [wallet as `0x${string}`],
    })
    currentBalance = Number(raw as bigint) / 1_000_000
    db.prepare('INSERT INTO wallet_snapshots (wallet, usdc_balance, snapshot_at) VALUES (?, ?, ?)').run(
      wallet,
      currentBalance,
      nowStr,
    )
  } catch (err) {
    log.warn('refresh', `Balance fetch failed for ${wallet}`, err)
  }

  // ── Compute per-period metrics ────────────────────────────────────────────
  const m24 = getPeriodMetrics(wallet, h24ago)
  const m7 = getPeriodMetrics(wallet, d7ago)
  const m30 = getPeriodMetrics(wallet, d30ago)

  const income_burn_ratio = m30.volume_in / Math.max(m30.volume_out, 0.01)

  // ── Balance trend (compare current to snapshot 7 days ago) ───────────────
  let balance_trend_7d = 'stable'
  const oldSnap = db
    .prepare<[string, string], { usdc_balance: number }>(
      'SELECT usdc_balance FROM wallet_snapshots WHERE wallet = ? AND snapshot_at <= ? ORDER BY snapshot_at DESC LIMIT 1',
    )
    .get(wallet, d7ago)

  if (oldSnap && oldSnap.usdc_balance > 0 && currentBalance >= 0) {
    const ratio = currentBalance / oldSnap.usdc_balance
    if (ratio < 0.5) balance_trend_7d = 'freefall'
    else if (ratio < 0.9) balance_trend_7d = 'declining'
    else if (ratio > 1.1) balance_trend_7d = 'rising'
  }

  // ── Unique partners in last 30d ───────────────────────────────────────────
  const partnersRow = db
    .prepare<[string, string, string, string], { count: number }>(
      `SELECT COUNT(DISTINCT CASE WHEN from_wallet = ? THEN to_wallet ELSE from_wallet END) as count
       FROM raw_transactions
       WHERE (from_wallet = ? OR to_wallet = ?) AND timestamp >= ?`,
    )
    .get(wallet, wallet, wallet, d30ago)
  const unique_partners_30d = partnersRow?.count ?? 0

  // ── Upsert wallet_metrics ─────────────────────────────────────────────────
  db.prepare(
    `INSERT INTO wallet_metrics
       (wallet, tx_count_24h, tx_count_7d, tx_count_30d,
        volume_in_24h, volume_in_7d, volume_in_30d,
        volume_out_24h, volume_out_7d, volume_out_30d,
        income_burn_ratio, balance_trend_7d, unique_partners_30d, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(wallet) DO UPDATE SET
       tx_count_24h        = excluded.tx_count_24h,
       tx_count_7d         = excluded.tx_count_7d,
       tx_count_30d        = excluded.tx_count_30d,
       volume_in_24h       = excluded.volume_in_24h,
       volume_in_7d        = excluded.volume_in_7d,
       volume_in_30d       = excluded.volume_in_30d,
       volume_out_24h      = excluded.volume_out_24h,
       volume_out_7d       = excluded.volume_out_7d,
       volume_out_30d      = excluded.volume_out_30d,
       income_burn_ratio   = excluded.income_burn_ratio,
       balance_trend_7d    = excluded.balance_trend_7d,
       unique_partners_30d = excluded.unique_partners_30d,
       last_updated        = excluded.last_updated`,
  ).run(
    wallet,
    m24.tx_count,
    m7.tx_count,
    m30.tx_count,
    m24.volume_in,
    m7.volume_in,
    m30.volume_in,
    m24.volume_out,
    m7.volume_out,
    m30.volume_out,
    income_burn_ratio,
    balance_trend_7d,
    unique_partners_30d,
    nowStr,
  )
}

function insertHourlyEconomyMetrics(hourStart: Date): void {
  const now = new Date()
  const hourStartStr = hourStart.toISOString()
  const nowStr = now.toISOString()

  const totalWallets = db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM wallet_index').get()?.count ?? 0
  const newWallets =
    db
      .prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM wallet_index WHERE first_seen >= ?')
      .get(hourStartStr)?.count ?? 0
  const activeWallets =
    db
      .prepare<[string, string], { count: number }>(
        'SELECT COUNT(DISTINCT from_wallet) as count FROM raw_transactions WHERE timestamp >= ? AND timestamp < ?',
      )
      .get(hourStartStr, nowStr)?.count ?? 0

  interface TxAgg {
    count: number
    volume: number
    avg_size: number
  }
  const txAgg = db
    .prepare<[string, string], TxAgg>(
      `SELECT COUNT(*) as count,
              COALESCE(SUM(amount_usdc), 0) as volume,
              COALESCE(AVG(amount_usdc), 0) as avg_size
       FROM raw_transactions WHERE timestamp >= ? AND timestamp < ?`,
    )
    .get(hourStartStr, nowStr)

  const deadWallets =
    db
      .prepare<[string], { count: number }>(
        'SELECT COUNT(DISTINCT wallet) as count FROM wallet_snapshots WHERE snapshot_at >= ? AND usdc_balance = 0',
      )
      .get(hourStartStr)?.count ?? 0

  const fraudThisHour =
    db
      .prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM fraud_reports WHERE created_at >= ?')
      .get(hourStartStr)?.count ?? 0

  const queriesThisHour =
    db
      .prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM query_log WHERE timestamp >= ?')
      .get(hourStartStr)?.count ?? 0

  // Score tier distribution
  interface TierRow {
    tier: string
    count: number
  }
  const tiers = db.prepare<[], TierRow>('SELECT tier, COUNT(*) as count FROM scores GROUP BY tier').all()
  const tierMap: Record<string, number> = {}
  for (const t of tiers) tierMap[t.tier] = t.count

  const avgScore = db.prepare<[], { avg: number }>('SELECT AVG(composite_score) as avg FROM scores').get()?.avg ?? 0

  const medianRow = db
    .prepare<[], { median: number }>(
      `SELECT composite_score as median FROM scores
       ORDER BY composite_score
       LIMIT 1 OFFSET (SELECT COUNT(*) / 2 FROM scores)`,
    )
    .get()

  db.prepare(
    `INSERT INTO economy_metrics (
       period_start, period_end, period_type,
       total_wallets, new_wallets, dead_wallets, active_wallets,
       total_tx_count, total_volume, avg_tx_size, median_score, avg_score,
       elite_count, trusted_count, established_count, emerging_count, unverified_count,
       total_fraud_reports, total_queries
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    hourStartStr,
    nowStr,
    'hourly',
    totalWallets,
    newWallets,
    deadWallets,
    activeWallets,
    txAgg?.count ?? 0,
    txAgg?.volume ?? 0,
    txAgg?.avg_size ?? 0,
    medianRow?.median ?? 0,
    Math.round(avgScore * 10) / 10,
    tierMap.Elite ?? 0,
    tierMap.Trusted ?? 0,
    tierMap.Established ?? 0,
    tierMap.Emerging ?? 0,
    tierMap.Unverified ?? 0,
    fraudThisHour,
    queriesThisHour,
  )
}

// ---------- Public API ----------

export async function runHourlyRefresh(): Promise<void> {
  log.info('refresh', 'Starting hourly refresh...')
  const hourStart = new Date()
  hourStart.setMinutes(0, 0, 0)

  try {
    // Expired wallets due for refresh
    const expired = getExpiredWallets()
    const toRefresh = expired.slice(0, REFRESH_BATCH_SIZE)

    if (toRefresh.length === 0) {
      log.info('refresh', 'No wallets to refresh')
    } else {
      log.info('refresh', `Refreshing ${toRefresh.length} wallet(s)`)
      let refreshed = 0

      for (const wallet of toRefresh) {
        try {
          await snapshotAndUpdateMetrics(wallet)
          await getOrCalculateScore(wallet as Address, true, 0) // no timeout for background
          refreshed++
          log.info('refresh', `Refreshed ${wallet}`)
        } catch (err) {
          log.error('refresh', `Failed for ${wallet}`, err)
        }
        await new Promise((res) => setTimeout(res, INTER_WALLET_DELAY_MS))
      }

      jobStats.hourlyRefresh.walletsRefreshed = refreshed
    }

    // Aggregate hourly economy metrics
    try {
      insertHourlyEconomyMetrics(hourStart)
      log.info('refresh', 'Hourly economy metrics aggregated')
    } catch (err) {
      log.error('refresh', 'Economy metrics aggregation failed', err)
    }

    jobStats.hourlyRefresh.lastRun = new Date().toISOString()
    log.info('refresh', 'Hourly refresh complete')
  } catch (err) {
    log.error('refresh', 'Hourly refresh error', err)
  }
}
