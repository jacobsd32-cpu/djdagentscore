/**
 * Anomaly Detector — runs every 15 minutes
 *
 * Checks for:
 *   1. Score changes > 10 points (score_decay entries in last 15 min)
 *   2. New fraud reports
 *   3. Balance freefall (wallet_snapshots)
 *   4. Newly Sybil-flagged wallets
 *
 * TODO: Add webhook notification when monitoring_subscriptions is implemented.
 */
import type { Database as DatabaseType } from 'better-sqlite3'
import { ANOMALY_DETECTOR_CONFIG } from '../config/constants.js'
import { log } from '../logger.js'
import { jobStats } from './jobStats.js'

const {
  SCORE_CHANGE_THRESHOLD,
  HIGH_SEVERITY_THRESHOLD,
  BALANCE_FREEFALL_RATIO,
  LOOKBACK_MINUTES,
  SYBIL_CHECK_MINUTES,
  SYBIL_WALLET_LIMIT,
} = ANOMALY_DETECTOR_CONFIG

interface Anomaly {
  wallet: string
  type: 'score_drop' | 'score_spike' | 'fraud_report' | 'balance_freefall' | 'sybil_flagged'
  details: string
  severity: 'low' | 'medium' | 'high'
  detected_at: string
}

interface ScoreDecayRow {
  wallet: string
  composite_score: number
  recorded_at: string
}

interface FraudReportRow {
  target_wallet: string
  reporter_wallet: string
  reason: string
  created_at: string
}

interface SnapshotRow {
  wallet: string
  usdc_balance: number
  snapshot_at: string
}

export async function runAnomalyDetector(db: DatabaseType): Promise<void> {
  log.info('anomaly', 'Starting anomaly detector...')

  try {
    const fifteenMinAgo = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString()
    const detectedAt = new Date().toISOString()
    const anomalies: Anomaly[] = []

    // ── CHECK 1: Score changes > 10 points ─────────────────────────────────
    // Wallets with a new score_decay entry in the last 15 min
    const recentlyScored = db
      .prepare<[string], { wallet: string }>(`SELECT DISTINCT wallet FROM score_decay WHERE recorded_at > ?`)
      .all(fifteenMinAgo)
      .map((r) => r.wallet)

    for (const wallet of recentlyScored) {
      const rows = db
        .prepare<[string], ScoreDecayRow>(
          `SELECT wallet, composite_score, recorded_at
           FROM score_decay WHERE wallet = ?
           ORDER BY recorded_at DESC LIMIT 2`,
        )
        .all(wallet)

      if (rows.length === 2) {
        const diff = rows[0].composite_score - rows[1].composite_score
        const absDiff = Math.abs(diff)

        if (absDiff > SCORE_CHANGE_THRESHOLD) {
          anomalies.push({
            wallet,
            type: diff < 0 ? 'score_drop' : 'score_spike',
            details: `Score changed ${diff > 0 ? '+' : ''}${diff} points (${rows[1].composite_score} → ${rows[0].composite_score})`,
            severity: absDiff > HIGH_SEVERITY_THRESHOLD ? 'high' : 'medium',
            detected_at: detectedAt,
          })
        }
      }
    }

    // ── CHECK 2: New fraud reports ──────────────────────────────────────────
    const newFraudReports = db
      .prepare<[string], FraudReportRow>(
        `SELECT target_wallet, reporter_wallet, reason, created_at
         FROM fraud_reports WHERE created_at > ?`,
      )
      .all(fifteenMinAgo)

    for (const report of newFraudReports) {
      anomalies.push({
        wallet: report.target_wallet,
        type: 'fraud_report',
        details: `Fraud report filed: ${report.reason} by ${report.reporter_wallet}`,
        severity: 'high',
        detected_at: detectedAt,
      })
    }

    // ── CHECK 3: Balance freefall ───────────────────────────────────────────
    // Wallets with a new snapshot in last 15 min — compare to previous snapshot
    const recentSnaps = db
      .prepare<[string], { wallet: string }>(`SELECT DISTINCT wallet FROM wallet_snapshots WHERE snapshot_at > ?`)
      .all(fifteenMinAgo)
      .map((r) => r.wallet)

    for (const wallet of recentSnaps) {
      const snaps = db
        .prepare<[string], SnapshotRow>(
          `SELECT wallet, usdc_balance, snapshot_at
           FROM wallet_snapshots WHERE wallet = ?
           ORDER BY snapshot_at DESC LIMIT 2`,
        )
        .all(wallet)

      if (snaps.length === 2 && snaps[1].usdc_balance > 0) {
        const ratio = snaps[0].usdc_balance / snaps[1].usdc_balance
        if (ratio < BALANCE_FREEFALL_RATIO) {
          anomalies.push({
            wallet,
            type: 'balance_freefall',
            details: `Balance dropped from ${snaps[1].usdc_balance.toFixed(2)} to ${snaps[0].usdc_balance.toFixed(2)} USDC`,
            severity: 'high',
            detected_at: detectedAt,
          })
        }
      }
    }

    // ── CHECK 4: Newly Sybil-flagged wallets ───────────────────────────────
    const newSybil = db
      .prepare<[string], { wallet: string }>(`SELECT wallet FROM scores WHERE sybil_flag = 1 AND calculated_at > ?`)
      .all(fifteenMinAgo)

    for (const row of newSybil) {
      anomalies.push({
        wallet: row.wallet,
        type: 'sybil_flagged',
        details: 'Wallet flagged as Sybil in most recent score calculation',
        severity: 'medium',
        detected_at: detectedAt,
      })
    }

    // ── Log anomalies ─────────────────────────────────────────────────────
    for (const anomaly of anomalies) {
      log.info('anomaly', `[${anomaly.severity}] ${anomaly.type} on ${anomaly.wallet}: ${anomaly.details}`)
    }

    jobStats.anomalyDetector.lastRun = detectedAt
    jobStats.anomalyDetector.anomaliesFound = anomalies.length
    log.info('anomaly', `Found ${anomalies.length} anomaly(ies)`)
  } catch (err) {
    log.error('anomaly', 'Anomaly detector error', err)
  }
}

/**
 * Enhanced monitoring for Sybil-flagged wallets.
 * Runs every 5 minutes — lighter weight than the full anomaly check.
 */
export async function runSybilMonitor(db: DatabaseType): Promise<void> {
  try {
    const fiveMinAgo = new Date(Date.now() - SYBIL_CHECK_MINUTES * 60 * 1000).toISOString()

    // Re-check sybil-flagged wallets for new transactions since last check
    const flaggedWallets = db
      .prepare<[], { wallet: string }>(`SELECT wallet FROM scores WHERE sybil_flag = 1 LIMIT ${SYBIL_WALLET_LIMIT}`)
      .all()
      .map((r) => r.wallet)

    for (const wallet of flaggedWallets) {
      const newTx = db
        .prepare<[string, string, string], { count: number }>(
          `SELECT COUNT(*) as count FROM raw_transactions
           WHERE (from_wallet = ? OR to_wallet = ?) AND timestamp > ?`,
        )
        .get(wallet, wallet, fiveMinAgo)

      if (newTx && newTx.count > 0) {
        log.info('sybil', `Flagged wallet ${wallet} has ${newTx.count} new tx(s) — queued for rescore`)
        // The scoring engine will re-evaluate sybil on next refresh
      }
    }
  } catch (err) {
    log.error('sybil', 'Monitor error', err)
  }
}
