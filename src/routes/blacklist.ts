/**
 * GET /v1/data/fraud/blacklist?wallet=0x...
 * Price: $0.05 via x402
 */
import { Hono } from 'hono'
import { errorResponse } from '../errors.js'
import { getFraudBlacklistView } from '../services/evidenceService.js'

const blacklist = new Hono()

blacklist.get('/', (c) => {
  const outcome = getFraudBlacklistView(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

export default blacklist
