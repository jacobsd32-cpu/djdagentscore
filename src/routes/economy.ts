import { Hono } from 'hono'
import { errorResponse } from '../errors.js'
import { getEconomyDashboard, getEconomySurvivalView, getEconomyVolumeView } from '../services/analyticsService.js'

const economy = new Hono()

function handleEconomySummary(period: string | undefined, limit: string | undefined) {
  return getEconomyDashboard(period, limit)
}

economy.get('/', (c) => {
  const outcome = handleEconomySummary(c.req.query('period'), c.req.query('limit'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json(outcome.data)
})

economy.get('/summary', (c) => {
  const outcome = handleEconomySummary(c.req.query('period'), c.req.query('limit'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json(outcome.data)
})

economy.get('/volume', (c) => {
  const outcome = getEconomyVolumeView(c.req.query('period'), c.req.query('limit'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json(outcome.data)
})

economy.get('/survival', (c) => {
  const outcome = getEconomySurvivalView(c.req.query('limit'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json(outcome.data)
})

export default economy
