import crypto from 'node:crypto'
import { Hono } from 'hono'
import { db, getRevenueByHour, getRevenueSummary, getTopPayers } from '../db.js'
import { generateCalibrationReport } from '../scoring/calibrationReport.js'
import { MODEL_VERSION } from '../scoring/responseBuilders.js'

const admin = new Hono()

admin.use('*', async (c, next) => {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) {
    return c.json({ error: 'Admin key not configured' }, 503)
  }
  const key = c.req.header('x-admin-key')
  if (!key || key.length !== adminKey.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(adminKey))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

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
  const result = db
    .prepare(`UPDATE scores SET expires_at = datetime('now', '-1 hour')`)
    .run()
  return c.json({
    message: `Flushed ${result.changes} cached scores — next query will re-score under model ${MODEL_VERSION}`,
    flushed: result.changes,
    modelVersion: MODEL_VERSION,
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
