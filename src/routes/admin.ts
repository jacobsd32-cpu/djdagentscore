import { Hono } from 'hono'
import { db, getRevenueByHour, getRevenueSummary, getTopPayers } from '../db.js'
import { adminAuth } from '../middleware/adminAuth.js'
import { generateCalibrationReport } from '../scoring/calibrationReport.js'
import { MODEL_VERSION } from '../scoring/responseBuilders.js'

const admin = new Hono()

admin.use('*', adminAuth)

admin.get('/calibration', (c) => {
  // Return latest report or generate a new one
  const latest = db.prepare('SELECT * FROM calibration_reports ORDER BY id DESC LIMIT 1').get() as
    | Record<string, unknown>
    | undefined

  if (latest) {
    return c.json({
      ...latest,
      avg_score_by_outcome: JSON.parse(latest.avg_score_by_outcome as string),
      tier_accuracy: JSON.parse(latest.tier_accuracy as string),
      recommendations: JSON.parse(latest.recommendations as string),
    })
  }

  // No report yet — generate one
  const report = generateCalibrationReport(db, MODEL_VERSION)
  return c.json({
    ...report,
    avg_score_by_outcome: JSON.parse(report.avg_score_by_outcome),
    tier_accuracy: JSON.parse(report.tier_accuracy),
    recommendations: JSON.parse(report.recommendations),
  })
})

admin.post('/calibration/generate', (c) => {
  const report = generateCalibrationReport(db, MODEL_VERSION)
  return c.json({
    ...report,
    avg_score_by_outcome: JSON.parse(report.avg_score_by_outcome),
    tier_accuracy: JSON.parse(report.tier_accuracy),
    recommendations: JSON.parse(report.recommendations),
  })
})

// ---------- Score cache management ----------

admin.post('/flush-scores', (c) => {
  // Expire all cached scores so the next query triggers a fresh computation
  // under the new model version. Doesn't delete history — just sets expires_at
  // to the past so stale-serve logic re-scores.
  const result = db.prepare(`UPDATE scores SET expires_at = datetime('now', '-1 hour')`).run()
  return c.json({
    message: `Flushed ${result.changes} cached scores — next query will re-score under model ${MODEL_VERSION}`,
    flushed: result.changes,
    modelVersion: MODEL_VERSION,
  })
})

// ---------- Reset test data ----------

admin.post('/reset-test-data', (c) => {
  // Clears all test/dev pollution while preserving blockchain-indexed data.
  // KEEPS: raw_transactions, wallet_index, usdc_transfers, wallet_snapshots,
  //        wallet_metrics, wallet_transfer_stats, relationship_graph, indexer_state
  // CLEARS: everything that came from test API queries & manual testing
  const cleared: Record<string, number> = {}

  const tables = [
    'query_log',
    'scores',
    'score_history',
    'score_decay',
    'economy_metrics',
    'intent_signals',
    'score_outcomes',
    'agent_registrations',
    'calibration_reports',
    'rate_limits',
    'api_keys',
    'subscriptions',
    'certifications',
    'reputation_publications',
    'webhook_deliveries',
    'webhooks',
    'fraud_reports',
    'fraud_patterns',
  ]

  const resetAll = db.transaction(() => {
    for (const table of tables) {
      const result = db.prepare(`DELETE FROM ${table}`).run()
      cleared[table] = result.changes
    }
  })

  resetAll()

  return c.json({
    message: 'Test data cleared. Blockchain-indexed data preserved.',
    cleared,
    preserved: [
      'raw_transactions',
      'wallet_index',
      'usdc_transfers',
      'wallet_snapshots',
      'wallet_metrics',
      'wallet_transfer_stats',
      'relationship_graph',
      'indexer_state',
    ],
  })
})

// ---------- Revenue dashboard ----------

admin.get('/revenue', (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days') ?? 30), 1), 365)
  const summary = getRevenueSummary(days)
  return c.json({ days, ...summary })
})

admin.get('/revenue/top-payers', (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20), 1), 100)
  const payers = getTopPayers(limit)
  return c.json({ payers, count: payers.length })
})

admin.get('/revenue/realtime', (c) => {
  const hourly = getRevenueByHour()
  return c.json({ hours: hourly, count: hourly.length })
})

export default admin
