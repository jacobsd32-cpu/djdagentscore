/**
 * Daily Economy Metrics Aggregator
 *
 * Rolls up hourly economy_metrics rows into daily, weekly, and monthly summaries.
 * Runs once per day (checked hourly). Also creates weekly rollups on Monday
 * and monthly rollups on the 1st of each month.
 */
import type { Database as DatabaseType } from 'better-sqlite3'
import { jobStats } from './jobStats.js'
import { log } from '../logger.js'

interface HourlyAgg {
  sum_new_wallets: number
  sum_dead_wallets: number
  sum_tx_count: number
  sum_volume: number
  sum_fraud_reports: number
  sum_queries: number
  max_total_wallets: number
  max_active_wallets: number
  avg_avg_score: number
  avg_avg_tx_size: number
}

interface TierCounts {
  elite_count: number
  trusted_count: number
  established_count: number
  emerging_count: number
  unverified_count: number
  median_score: number
}

function rollupPeriod(
  db: DatabaseType,
  periodStart: string,
  periodEnd: string,
  periodType: 'daily' | 'weekly' | 'monthly',
  sourceType: 'hourly' | 'daily',
): void {
  const agg = db
    .prepare<[string, string, string], HourlyAgg>(
      `SELECT
         SUM(new_wallets)        as sum_new_wallets,
         SUM(dead_wallets)       as sum_dead_wallets,
         SUM(total_tx_count)     as sum_tx_count,
         SUM(total_volume)       as sum_volume,
         SUM(total_fraud_reports) as sum_fraud_reports,
         SUM(total_queries)      as sum_queries,
         MAX(total_wallets)      as max_total_wallets,
         MAX(active_wallets)     as max_active_wallets,
         AVG(avg_score)          as avg_avg_score,
         AVG(avg_tx_size)        as avg_avg_tx_size
       FROM economy_metrics
       WHERE period_type = ?
         AND period_start >= ?
         AND period_start < ?`,
    )
    .get(sourceType, periodStart, periodEnd)

  if (!agg || agg.max_total_wallets == null) return

  // Use the most recent row in the window for tier distribution and median
  const lastRow = db
    .prepare<[string, string, string], TierCounts>(
      `SELECT elite_count, trusted_count, established_count,
              emerging_count, unverified_count, median_score
       FROM economy_metrics
       WHERE period_type = ? AND period_start >= ? AND period_start < ?
       ORDER BY period_start DESC LIMIT 1`,
    )
    .get(sourceType, periodStart, periodEnd)

  db.prepare(
    `INSERT INTO economy_metrics (
       period_start, period_end, period_type,
       total_wallets, new_wallets, dead_wallets, active_wallets,
       total_tx_count, total_volume, avg_tx_size, median_score, avg_score,
       elite_count, trusted_count, established_count, emerging_count, unverified_count,
       total_fraud_reports, total_queries
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    periodStart, periodEnd, periodType,
    agg.max_total_wallets ?? 0,
    agg.sum_new_wallets ?? 0,
    agg.sum_dead_wallets ?? 0,
    agg.max_active_wallets ?? 0,
    agg.sum_tx_count ?? 0,
    agg.sum_volume ?? 0,
    Math.round((agg.avg_avg_tx_size ?? 0) * 100) / 100,
    lastRow?.median_score ?? 0,
    Math.round((agg.avg_avg_score ?? 0) * 10) / 10,
    lastRow?.elite_count ?? 0,
    lastRow?.trusted_count ?? 0,
    lastRow?.established_count ?? 0,
    lastRow?.emerging_count ?? 0,
    lastRow?.unverified_count ?? 0,
    agg.sum_fraud_reports ?? 0,
    agg.sum_queries ?? 0,
  )
}

export async function runDailyAggregator(db: DatabaseType): Promise<void> {
  log.info('daily', 'Starting daily aggregator...')

  try {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)

    const yesterdayStart = new Date(
      Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate()),
    ).toISOString()
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString()

    // ── 1. Create daily row from yesterday's hourly rows ──────────────────────
    rollupPeriod(db, yesterdayStart, todayStart, 'daily', 'hourly')
    log.info('daily', `Created daily summary for ${yesterdayStart.split('T')[0]}`)

    // ── 2. Weekly rollup (only on Monday) ─────────────────────────────────────
    if (now.getUTCDay() === 1) {
      const weekStart = new Date(now)
      weekStart.setUTCDate(weekStart.getUTCDate() - 7)
      const weekStartStr = new Date(
        Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate()),
      ).toISOString()

      rollupPeriod(db, weekStartStr, todayStart, 'weekly', 'daily')
      log.info('daily', 'Created weekly summary')
    }

    // ── 3. Monthly rollup (only on 1st of month) ──────────────────────────────
    if (now.getUTCDate() === 1) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString()
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

      rollupPeriod(db, monthStart, monthEnd, 'monthly', 'daily')
      log.info('daily', 'Created monthly summary')
    }

    jobStats.dailyAggregator.lastRun = new Date().toISOString()
    log.info('daily', 'Daily aggregator complete')
  } catch (err) {
    log.error('daily', 'Daily aggregator error', err)
  }
}
