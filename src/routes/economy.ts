import { Hono } from 'hono'
import { errorResponse } from '../errors.js'
import { getEconomyDashboard } from '../services/analyticsService.js'

const economy = new Hono()

economy.get('/', (c) => {
  const outcome = getEconomyDashboard(c.req.query('period'), c.req.query('limit'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json(outcome.data)
})

export default economy
