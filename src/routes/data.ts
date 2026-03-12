import { Hono } from 'hono'
import { errorResponse } from '../errors.js'
import { getRelationshipGraphView, getScoreDecayView } from '../services/dataProductService.js'

const dataRoute = new Hono()

dataRoute.get('/decay', (c) => {
  const outcome = getScoreDecayView({
    rawWallet: c.req.query('wallet'),
    limit: c.req.query('limit'),
    after: c.req.query('after'),
    before: c.req.query('before'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

dataRoute.get('/graph', (c) => {
  const outcome = getRelationshipGraphView({
    rawWallet: c.req.query('wallet'),
    limit: c.req.query('limit'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

export default dataRoute
