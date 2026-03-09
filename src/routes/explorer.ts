import { Hono } from 'hono'
import { explorerDashboardHtml } from '../templates/explorer.js'
import { getEcosystemStats, getRecentActivity } from '../db.js'

const explorer = new Hono()

explorer.get('/', (c) => {
  const stats = getEcosystemStats()
  return c.html(explorerDashboardHtml(stats))
})

explorer.get('/api/stats', (c) => {
  const stats = getEcosystemStats()
  return c.json(stats)
})

explorer.get('/api/activity', (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 50)
  const activity = getRecentActivity(limit)
  return c.json({ activity })
})

export default explorer
