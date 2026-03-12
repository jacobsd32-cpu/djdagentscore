import { Hono } from 'hono'
import {
  getExplorerActivityFeed,
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

export default explorer
