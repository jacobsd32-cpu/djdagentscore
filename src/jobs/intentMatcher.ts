/**
 * Intent Signal Matcher — runs every 6 hours
 *
 * Cross-references paid score lookups in query_log with raw_transactions
 * to determine whether a query was followed by an actual transaction.
 * Populates intent_signals with conversion data.
 */
import type { Database as DatabaseType } from 'better-sqlite3'
import { log } from '../logger.js'
import { jobStats } from './jobStats.js'

interface UnmatchedQuery {
  id: number
  requester_wallet: string
  target_wallet: string
  timestamp: string
}

interface TxRow {
  tx_hash: string
  timestamp: string
}

export async function runIntentMatcher(db: DatabaseType): Promise<void> {
  log.info('intent', 'Starting intent matcher...')

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Paid lookups in last 24h that have no matching intent_signals row
    const unmatched = db
      .prepare<[string], UnmatchedQuery>(
        `SELECT ql.id, ql.requester_wallet, ql.target_wallet, ql.timestamp
         FROM query_log ql
         WHERE ql.is_free_tier = 0
           AND ql.requester_wallet IS NOT NULL
           AND ql.target_wallet IS NOT NULL
           AND ql.timestamp >= ?
           AND NOT EXISTS (
             SELECT 1 FROM intent_signals is2
             WHERE is2.requester_wallet = ql.requester_wallet
               AND is2.target_wallet    = ql.target_wallet
               AND is2.query_timestamp  = ql.timestamp
           )`,
      )
      .all(oneDayAgo)

    let processed = 0
    let conversions = 0

    for (let i = 0; i < unmatched.length; i++) {
      const query = unmatched[i]
      // Yield event loop every 25 iterations so health checks can be served
      if (i > 0 && i % 25 === 0) {
        await new Promise((r) => setTimeout(r, 10))
      }
      const queryTs = query.timestamp
      const windowEnd = new Date(new Date(queryTs).getTime() + 24 * 60 * 60 * 1000).toISOString()
      const isOldEnough = new Date(queryTs) < new Date(Date.now() - 24 * 60 * 60 * 1000)

      // Look for a transaction between requester and target after the query
      const tx = db
        .prepare<[string, string, string, string, string, string], TxRow>(
          `SELECT tx_hash, timestamp
           FROM raw_transactions
           WHERE ((from_wallet = ? AND to_wallet = ?) OR (from_wallet = ? AND to_wallet = ?))
             AND timestamp > ?
             AND timestamp < ?
           ORDER BY timestamp ASC
           LIMIT 1`,
        )
        .get(
          query.requester_wallet,
          query.target_wallet,
          query.target_wallet,
          query.requester_wallet,
          queryTs,
          windowEnd,
        )

      if (tx) {
        const queryTime = new Date(queryTs).getTime()
        const txTime = new Date(tx.timestamp).getTime()
        db.prepare(
          `INSERT INTO intent_signals
             (requester_wallet, target_wallet, query_timestamp,
              followed_by_tx, tx_hash, tx_timestamp, time_to_tx_ms)
           VALUES (?, ?, ?, 1, ?, ?, ?)`,
        ).run(query.requester_wallet, query.target_wallet, queryTs, tx.tx_hash, tx.timestamp, txTime - queryTime)
        conversions++
      } else if (isOldEnough) {
        // Observation window closed with no transaction
        db.prepare(
          `INSERT INTO intent_signals
             (requester_wallet, target_wallet, query_timestamp,
              followed_by_tx, tx_hash, tx_timestamp, time_to_tx_ms)
           VALUES (?, ?, ?, 0, NULL, NULL, NULL)`,
        ).run(query.requester_wallet, query.target_wallet, queryTs)
      }

      processed++
    }

    jobStats.intentMatcher.lastRun = new Date().toISOString()
    jobStats.intentMatcher.queriesProcessed = processed
    log.info('intent', `Processed ${processed} queries, ${conversions} had follow-up transactions`)
  } catch (err) {
    log.error('intent', 'Intent matcher error', err)
  }
}
