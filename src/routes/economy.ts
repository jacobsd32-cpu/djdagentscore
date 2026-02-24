import { Hono } from 'hono'
import { getEconomyMetrics } from '../db.js'

const economy = new Hono()

const VALID_PERIODS = ['daily', 'weekly', 'monthly'] as const
const MAX_LIMIT = 90

economy.get('/', (c) => {
  const period = c.req.query('period') ?? 'daily'
  if (!VALID_PERIODS.includes(period as typeof VALID_PERIODS[number])) {
    return c.json({ error: `Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}` }, 400)
  }

  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 30), 1), MAX_LIMIT)
  const metrics = getEconomyMetrics(period, limit)

  return c.json({
    period,
    limit,
    count: metrics.length,
    metrics,
  })
})

export default economy
