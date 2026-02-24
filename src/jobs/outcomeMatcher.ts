/**
 * Outcome Matcher — runs every 6 hours
 *
 * For paid score lookups in the last 30 days, checks whether a transaction
 * or fraud report followed. Populates score_outcomes with labeled outcome data
 * for model validation.
 */
import type { Database as DatabaseType } from 'better-sqlite3'
import { log } from '../logger.js'
import { MODEL_VERSION } from '../scoring/responseBuilders.js'
import { jobStats } from './jobStats.js'

interface UnmatchedLookup {
  id: number
  requester_wallet: string | null
  target_wallet: string | null
  timestamp: string
  target_score: number | null
  target_tier: string | null
}

interface TxSumRow {
  count: number
  total: number
  first_ts: string
}

interface FraudRow {
  created_at: string
}

export async function runOutcomeMatcher(db: DatabaseType): Promise<void> {
  log.info('outcome', 'Starting outcome matcher...')

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // All paid lookups in the last 30 days without a score_outcomes row
    const unmatched = db
      .prepare<[string], UnmatchedLookup>(
        `SELECT ql.id, ql.requester_wallet, ql.target_wallet, ql.timestamp,
                ql.target_score, ql.target_tier
         FROM query_log ql
         LEFT JOIN score_outcomes so ON ql.id = so.query_id
         WHERE ql.is_free_tier = 0
           AND ql.target_wallet IS NOT NULL
           AND ql.timestamp >= ?
           AND so.id IS NULL`,
      )
      .all(thirtyDaysAgo)

    let processed = 0
    let successful = 0
    let frauds = 0
    let noActivity = 0

    for (let i = 0; i < unmatched.length; i++) {
      const lookup = unmatched[i]
      // Yield event loop every 25 iterations so health checks can be served
      if (i > 0 && i % 25 === 0) {
        await new Promise((r) => setTimeout(r, 10))
      }
      if (!lookup.target_wallet) continue

      const queryTs = lookup.timestamp
      const queryDate = new Date(queryTs)
      const isExpired = queryDate < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      // ── Check for transactions between requester and target ───────────────
      const txRow = lookup.requester_wallet
        ? db
            .prepare<[string, string, string, string, string], TxSumRow>(
              `SELECT COUNT(*) as count,
                      COALESCE(SUM(amount_usdc), 0) as total,
                      MIN(timestamp) as first_ts
               FROM raw_transactions
               WHERE ((from_wallet = ? AND to_wallet = ?) OR (from_wallet = ? AND to_wallet = ?))
                 AND timestamp > ?`,
            )
            .get(lookup.requester_wallet, lookup.target_wallet, lookup.target_wallet, lookup.requester_wallet, queryTs)
        : null

      // ── Check for fraud reports against target ────────────────────────────
      const fraudRow = db
        .prepare<[string, string], FraudRow>(
          `SELECT created_at FROM fraud_reports
           WHERE target_wallet = ? AND created_at > ?
           ORDER BY created_at ASC LIMIT 1`,
        )
        .get(lookup.target_wallet, queryTs)

      let outcomeType: string | null = null
      let outcomeAt: string | null = null
      let outcomeValue: number | null = null

      if (fraudRow) {
        // Fraud report overrides transaction (worse outcome wins)
        outcomeType = 'fraud_report'
        outcomeAt = fraudRow.created_at
        outcomeValue = null
        frauds++
      } else if (txRow && txRow.count > 0) {
        outcomeType = txRow.count === 1 ? 'successful_tx' : 'multiple_successful_tx'
        outcomeAt = txRow.first_ts
        outcomeValue = txRow.total
        successful++
      } else if (isExpired) {
        outcomeType = 'no_activity'
        outcomeAt = new Date().toISOString()
        outcomeValue = null
        noActivity++
      } else {
        // Still within observation window — skip
        continue
      }

      const daysToOutcome = outcomeAt
        ? Math.round((new Date(outcomeAt).getTime() - queryDate.getTime()) / (1000 * 60 * 60 * 24))
        : null

      db.prepare(
        `INSERT INTO score_outcomes
           (query_id, target_wallet, requester_wallet,
            score_at_query, tier_at_query, confidence_at_query, model_version,
            outcome_type, outcome_at, days_to_outcome, outcome_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        lookup.id,
        lookup.target_wallet,
        lookup.requester_wallet ?? null,
        lookup.target_score ?? null,
        lookup.target_tier ?? null,
        null, // confidence_at_query not stored in query_log
        MODEL_VERSION,
        outcomeType,
        outcomeAt,
        daysToOutcome,
        outcomeValue,
      )

      processed++
    }

    jobStats.outcomeMatcher.lastRun = new Date().toISOString()
    jobStats.outcomeMatcher.outcomesRecorded = processed
    log.info(
      'outcome',
      `Processed ${processed} queries: ${successful} successful, ${frauds} fraud, ${noActivity} no_activity`,
    )
  } catch (err) {
    log.error('outcome', 'Outcome matcher error', err)
  }
}
