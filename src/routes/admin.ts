import { Hono } from 'hono'
import { db } from '../db.js'
import { generateCalibrationReport } from '../scoring/calibrationReport.js'
import { MODEL_VERSION } from '../scoring/responseBuilders.js'

const admin = new Hono()

admin.use('*', async (c, next) => {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) {
    return c.json({ error: 'Admin key not configured' }, 503)
  }
  const key = c.req.header('x-admin-key')
  if (!key || key !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

admin.get('/calibration', (c) => {
  // Return latest report or generate a new one
  const latest = db.prepare(
    'SELECT * FROM calibration_reports ORDER BY id DESC LIMIT 1',
  ).get() as Record<string, unknown> | undefined

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

export default admin
