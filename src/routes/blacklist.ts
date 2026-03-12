/**
 * GET /v1/data/fraud/blacklist?wallet=0x...
 * Price: $0.05 via x402
 */
import { Hono } from 'hono'
import { ErrorCodes, errorResponse } from '../errors.js'
import { getFraudBlacklistStatus } from '../services/directoryService.js'

const blacklist = new Hono()

blacklist.get('/', (c) => {
  const outcome = getFraudBlacklistStatus(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, outcome.message), outcome.status)
  }

  return c.json(outcome.data)
})

export default blacklist
