import { Hono } from 'hono'
import {
  getExplorerActivityFeed,
  getExplorerCertifiedDirectory,
  getExplorerDashboardPage,
  getExplorerStatsSnapshot,
} from '../services/analyticsService.js'

const explorer = new Hono()

explorer.get('/', (c) => {
  return c.html(getExplorerDashboardPage().html)
})

explorer.get('/api/stats', (c) => {
  return c.json(getExplorerStatsSnapshot())
})

explorer.get('/api/activity', (c) => {
  return c.json(getExplorerActivityFeed(c.req.query('limit')))
})

explorer.get('/api/certified', async (c) => {
  return c.json(await getExplorerCertifiedDirectory(c.req.query('limit'), c.req.query('tier')))
})

export default explorer
