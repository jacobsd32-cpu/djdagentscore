import { Hono } from 'hono'
import { ErrorCodes, errorResponse } from '../errors.js'
import { adminAuth } from '../middleware/adminAuth.js'
import {
  flushAdminScoreCacheView,
  generateAdminCalibrationReportView,
  getAdminCalibrationReportView,
  getAdminForensicsDisputesView,
  getAdminGrowthFunnelSummaryView,
  getAdminRealtimeRevenueView,
  getAdminRevenueSummaryView,
  getAdminTopPayersView,
  resetAdminTestDataView,
  resolveAdminForensicsDisputeView,
} from '../services/adminService.js'

const admin = new Hono()

admin.use('*', adminAuth)

admin.get('/calibration', (c) => {
  return c.json(getAdminCalibrationReportView())
})

admin.post('/calibration/generate', (c) => {
  return c.json(generateAdminCalibrationReportView())
})

// ---------- Score cache management ----------

admin.post('/flush-scores', (c) => {
  return c.json(flushAdminScoreCacheView())
})

// ---------- Reset test data ----------

admin.post('/reset-test-data', (c) => {
  return c.json(resetAdminTestDataView())
})

// ---------- Revenue dashboard ----------

admin.get('/revenue', (c) => {
  return c.json(getAdminRevenueSummaryView(c.req.query('days')))
})

admin.get('/revenue/top-payers', (c) => {
  return c.json(getAdminTopPayersView(c.req.query('limit')))
})

admin.get('/revenue/realtime', (c) => {
  return c.json(getAdminRealtimeRevenueView())
})

admin.get('/funnel', (c) => {
  return c.json(getAdminGrowthFunnelSummaryView(c.req.query('days')))
})

admin.get('/forensics/disputes', (c) => {
  return c.json(getAdminForensicsDisputesView(c.req.query('status'), c.req.query('wallet'), c.req.query('limit')))
})

admin.post('/forensics/disputes/:id/resolve', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const outcome = resolveAdminForensicsDisputeView(c.req.param('id'), body, 'admin')
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

export default admin
