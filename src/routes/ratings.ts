import { Hono } from 'hono'
import type { RatingBody } from '../types.js'
import { errorResponse, ErrorCodes } from '../errors.js'
import { submitMutualRating } from '../services/ratingsService.js'
import { getPayerWallet } from '../utils/paymentUtils.js'

const ratingsRoute = new Hono()

ratingsRoute.post('/', async (c) => {
  let body: RatingBody
  try {
    body = await c.req.json<RatingBody>()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const outcome = await submitMutualRating(body, getPayerWallet(c))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 201)
})

export default ratingsRoute
