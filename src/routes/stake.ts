import { Hono } from 'hono'

import { errorResponse, ErrorCodes } from '../errors.js'
import { submitCreatorStake } from '../services/stakingService.js'
import type { StakeBody } from '../types.js'
import { getPayerWallet } from '../utils/paymentUtils.js'

const stakeRoute = new Hono()

stakeRoute.post('/', async (c) => {
  let body: StakeBody
  try {
    body = await c.req.json<StakeBody>()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const outcome = submitCreatorStake(body, getPayerWallet(c))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 201)
})

export default stakeRoute
