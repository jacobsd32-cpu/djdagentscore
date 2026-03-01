/**
 * Data Pruner — automatic cleanup of unbounded tables
 *
 * Prevents disk exhaustion by deleting old rows from tables that grow
 * continuously (usdc_transfers, query_log, webhook_deliveries).
 *
 * Pre-aggregated tables (wallet_transfer_stats, economy_metrics) are NOT
 * touched — they hold the derived data that scoring actually uses.
 *
 * Runs once per day as part of the daily aggregator cycle.
 * Deletes in batches with event-loop yields to avoid blocking HTTP serving.
 *
 * Disk reclaim:
 *   If auto_vacuum=INCREMENTAL, runs incremental_vacuum to shrink the file.
 *   If auto_vacuum=NONE (default on existing DBs), freed pages stay on
 *   SQLite's free-list and are reused by future inserts — the file doesn't
 *   shrink but doesn't grow either, which prevents disk exhaustion.
 */
import type { Database } from 'better-sqlite3'
import { DATA_PRUNING_CONFIG } from '../config/constants.js'
import { autoVacuumMode } from '../db/connection.js'
import { log } from '../logger.js'

const {
  USDC_TRANSFERS_RETENTION_DAYS,
  QUERY_LOG_RETENTION_DAYS,
  WEBHOOK_DELIVERIES_RETENTION_DAYS,
  DELETE_BATCH_SIZE,
  DELETE_YIELD_MS,
} = DATA_PRUNING_CONFIG

interface PruneResult {
  table: string
  rowsDeleted: number
  durationMs: number
}

/**
 * Delete rows older than `days` from a table, in batches.
 * Uses a timestamp column for the cutoff comparison.
 */
async function pruneTable(db: Database, table: string, timestampColumn: string, days: number): Promise<PruneResult> {
  const start = Date.now()
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  let totalDeleted = 0

  // Delete in batches to keep write-lock duration short.
  // Each batch is its own transaction (~10K rows → ~20ms on SSD).
  const deleteStmt = db.prepare(
    `DELETE FROM ${table} WHERE rowid IN (
      SELECT rowid FROM ${table} WHERE ${timestampColumn} < ? LIMIT ?
    )`,
  )

  while (true) {
    const result = deleteStmt.run(cutoff, DELETE_BATCH_SIZE)
    totalDeleted += result.changes
    if (result.changes < DELETE_BATCH_SIZE) break
    // Yield to event loop between batches
    await new Promise((r) => setTimeout(r, DELETE_YIELD_MS))
  }

  return {
    table,
    rowsDeleted: totalDeleted,
    durationMs: Date.now() - start,
  }
}

/**
 * Run all pruning tasks and reclaim disk space.
 * Safe to call from a setInterval — guards against concurrent runs externally.
 */
export async function runDataPruner(db: Database): Promise<void> {
  log.info('pruner', 'Starting data pruning...')
  const overallStart = Date.now()
  const results: PruneResult[] = []

  try {
    // ── 1. usdc_transfers (the big one — millions of rows) ──────────────
    results.push(await pruneTable(db, 'usdc_transfers', 'timestamp', USDC_TRANSFERS_RETENTION_DAYS))

    // ── 2. query_log ────────────────────────────────────────────────────
    results.push(await pruneTable(db, 'query_log', 'timestamp', QUERY_LOG_RETENTION_DAYS))

    // ── 3. webhook_deliveries ───────────────────────────────────────────
    results.push(await pruneTable(db, 'webhook_deliveries', 'created_at', WEBHOOK_DELIVERIES_RETENTION_DAYS))

    // ── 4. Reclaim freed pages ──────────────────────────────────────────
    const freePages = (db.pragma('freelist_count') as { freelist_count: number }[])[0]?.freelist_count ?? 0
    if (freePages > 0) {
      if (autoVacuumMode === 'incremental') {
        // incremental_vacuum returns freed pages to the OS without rewriting
        // the entire DB file (unlike full VACUUM which doubles disk usage).
        db.pragma('incremental_vacuum')
        log.info('pruner', `Reclaimed ${freePages} free pages via incremental_vacuum`)
      } else {
        // auto_vacuum=NONE — freed pages stay on the free-list for reuse.
        // The DB file won't shrink, but it won't grow either. This is safe.
        // A one-time VACUUM can be run manually when disk has enough headroom.
        log.info(
          'pruner',
          `${freePages} free pages available for reuse (auto_vacuum=${autoVacuumMode}, file won't shrink until VACUUM)`,
        )
      }
    }

    // Log summary
    const totalDeleted = results.reduce((sum, r) => sum + r.rowsDeleted, 0)
    const totalMs = Date.now() - overallStart

    if (totalDeleted > 0) {
      for (const r of results) {
        if (r.rowsDeleted > 0) {
          log.info('pruner', `${r.table}: deleted ${r.rowsDeleted} rows (${r.durationMs}ms)`)
        }
      }
      log.info('pruner', `Pruning complete: ${totalDeleted} total rows deleted in ${totalMs}ms`)
    } else {
      log.info('pruner', 'No rows to prune')
    }
  } catch (err) {
    log.error('pruner', 'Pruning error', err)
  }
}
