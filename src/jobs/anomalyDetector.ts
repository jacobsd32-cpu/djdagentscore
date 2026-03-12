/**
 * Anomaly Detector - runs every 15 minutes.
 *
 * Checks for:
 *   1. Score changes > 10 points (score_decay entries in last 15 min)
 *   2. New fraud reports
 *   3. Balance freefall (wallet_snapshots)
 *   4. Newly Sybil-flagged wallets
 */
import type { Database as DatabaseType } from 'better-sqlite3'
import { ANOMALY_DETECTOR_CONFIG } from '../config/constants.js'
import { log } from '../logger.js'
import { queueWebhookEvent } from './webhookDelivery.js'
import { jobStats } from './jobStats.js'

const {
  SCORE_CHANGE_THRESHOLD,
  HIGH_SEVERITY_THRESHOLD,
  BALANCE_FREEFALL_RATIO,
  LOOKBACK_MINUTES,
  SYBIL_CHECK_MINUTES,
  SYBIL_WALLET_LIMIT,
} = ANOMALY_DETECTOR_CONFIG
const ANOMALY_SCAN_STATE_KEY = 'anomaly_detector_last_scan_at'

type AnomalyType = 'score_drop' | 'score_spike' | 'fraud_report' | 'balance_freefall' | 'sybil_flagged'
type AnomalySeverity = 'low' | 'medium' | 'high'

interface Anomaly {
  wallet: string
  type: AnomalyType
  details: string
  severity: AnomalySeverity
  detected_at: string
  payload?: Record<string, unknown>
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

interface ScoreContextRow {
  composite_score: number
  tier: string
  confidence: number | null
}

interface IndexerStateRow {
  value: string
}

function getScanWindowStart(db: DatabaseType, fallback: string): string {
  const row = db.prepare<[string], IndexerStateRow>('SELECT value FROM indexer_state WHERE key = ?').get(ANOMALY_SCAN_STATE_KEY)
  return typeof row?.value === 'string' && row.value.trim().length > 0 ? row.value : fallback
}

function setScanWindowEnd(db: DatabaseType, value: string): void {
  db.prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)').run(ANOMALY_SCAN_STATE_KEY, value)
}

function getScoreContext(
  db: DatabaseType,
  wallet: string,
): {
  score: number | null
  tier: string | null
  confidence: number | null
} {
  const row = db
    .prepare<[string], ScoreContextRow>(
      `SELECT composite_score, tier, confidence
       FROM scores
       WHERE wallet = ?
       LIMIT 1`,
    )
    .get(wallet)

  return {
    score: row?.composite_score ?? null,
    tier: row?.tier ?? null,
    confidence: row?.confidence ?? null,
  }
}

function toWebhookEventType(type: AnomalyType): string | null {
  switch (type) {
    case 'score_drop':
      return 'anomaly.score_drop'
    case 'score_spike':
      return 'anomaly.score_spike'
    case 'balance_freefall':
      return 'anomaly.balance_freefall'
    case 'sybil_flagged':
      return 'anomaly.sybil_flagged'
    case 'fraud_report':
      return null
    default:
      return null
  }
}

function emitAnomalyWebhook(anomaly: Anomaly): void {
  const eventType = toWebhookEventType(anomaly.type)
  if (!eventType) return

  queueWebhookEvent(eventType, {
    wallet: anomaly.wallet,
    anomalyType: anomaly.type,
    severity: anomaly.severity,
    details: anomaly.details,
    detectedAt: anomaly.detected_at,
    ...(anomaly.payload ?? {}),
  })
}

export async function runAnomalyDetector(db: DatabaseType): Promise<void> {
  log.info('anomaly', 'Starting anomaly detector...')

  try {
    const scanStartedAt = new Date().toISOString()
    const fallbackWindowStart = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString()
    const scanWindowStart = getScanWindowStart(db, fallbackWindowStart)
    const detectedAt = scanStartedAt
    const anomalies: Anomaly[] = []

    // CHECK 1: Score changes > 10 points
    // Wallets with a new score_decay entry in the last 15 min
    const recentlyScored = db
      .prepare<[string], { wallet: string }>(`SELECT DISTINCT wallet FROM score_decay WHERE recorded_at > ?`)
      .all(scanWindowStart)
      .map((r) => r.wallet)

    for (const wallet of recentlyScored) {
      const scoreContext = getScoreContext(db, wallet)
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
            details: `Score changed ${diff > 0 ? '+' : ''}${diff} points (${rows[1].composite_score} -> ${rows[0].composite_score})`,
            severity: absDiff > HIGH_SEVERITY_THRESHOLD ? 'high' : 'medium',
            detected_at: detectedAt,
            payload: {
              score: rows[0].composite_score,
              previousScore: rows[1].composite_score,
              currentScore: rows[0].composite_score,
              scoreDelta: diff,
              tier: scoreContext.tier,
              confidence: scoreContext.confidence,
              latestRecordedAt: rows[0].recorded_at,
            },
          })
        }
      }
    }

    // CHECK 2: New fraud reports
    const newFraudReports = db
      .prepare<[string], FraudReportRow>(
        `SELECT target_wallet, reporter_wallet, reason, created_at
         FROM fraud_reports WHERE created_at > ?`,
      )
      .all(scanWindowStart)

    for (const report of newFraudReports) {
      anomalies.push({
        wallet: report.target_wallet,
        type: 'fraud_report',
        details: `Fraud report filed: ${report.reason} by ${report.reporter_wallet}`,
        severity: 'high',
        detected_at: detectedAt,
      })
    }

    // CHECK 3: Balance freefall
    // Wallets with a new snapshot in last 15 min - compare to previous snapshot
    const recentSnaps = db
      .prepare<[string], { wallet: string }>(`SELECT DISTINCT wallet FROM wallet_snapshots WHERE snapshot_at > ?`)
      .all(scanWindowStart)
      .map((r) => r.wallet)

    for (const wallet of recentSnaps) {
      const scoreContext = getScoreContext(db, wallet)
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
            payload: {
              score: scoreContext.score,
              tier: scoreContext.tier,
              confidence: scoreContext.confidence,
              previousBalance: snaps[1].usdc_balance,
              currentBalance: snaps[0].usdc_balance,
              balanceRatio: ratio,
              latestSnapshotAt: snaps[0].snapshot_at,
            },
          })
        }
      }
    }

    // CHECK 4: Newly Sybil-flagged wallets
    const newSybil = db
      .prepare<[string], { wallet: string }>(`SELECT wallet FROM scores WHERE sybil_flag = 1 AND calculated_at > ?`)
      .all(scanWindowStart)

    for (const row of newSybil) {
      const scoreContext = getScoreContext(db, row.wallet)
      anomalies.push({
        wallet: row.wallet,
        type: 'sybil_flagged',
        details: 'Wallet flagged as Sybil in most recent score calculation',
        severity: 'medium',
        detected_at: detectedAt,
        payload: {
          score: scoreContext.score,
          tier: scoreContext.tier,
          confidence: scoreContext.confidence,
        },
      })
    }

    // Log anomalies
    for (const anomaly of anomalies) {
      log.info('anomaly', `[${anomaly.severity}] ${anomaly.type} on ${anomaly.wallet}: ${anomaly.details}`)
      emitAnomalyWebhook(anomaly)
    }

    setScanWindowEnd(db, scanStartedAt)
    jobStats.anomalyDetector.lastRun = detectedAt
    jobStats.anomalyDetector.anomaliesFound = anomalies.length
    log.info('anomaly', `Found ${anomalies.length} anomaly(ies)`)
  } catch (err) {
    log.error('anomaly', 'Anomaly detector error', err)
  }
}

/**
 * Enhanced monitoring for Sybil-flagged wallets.
 * Runs every 5 minutes - lighter weight than the full anomaly check.
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
        log.info('sybil', `Flagged wallet ${wallet} has ${newTx.count} new tx(s) - has new activity - will be rescored on next hourly refresh`)
        // The scoring engine will re-evaluate sybil on next refresh
      }
    }
  } catch (err) {
    log.error('sybil', 'Monitor error', err)
  }
}
