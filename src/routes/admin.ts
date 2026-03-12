import { Hono } from 'hono'
import { adminAuth } from '../middleware/adminAuth.js'
import {
  flushAdminScoreCacheView,
  generateAdminCalibrationReportView,
  getAdminCalibrationReportView,
  getAdminRealtimeRevenueView,
  getAdminRevenueSummaryView,
  getAdminTopPayersView,
  resetAdminTestDataView,
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

export default admin
