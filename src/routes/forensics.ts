/**
 * DJD Forensics
 *
 * Paid:
 *   GET /summary?wallet=0x...
 *   GET /feed?reason=payment_fraud&limit=50&after=2024-01-01&before=2025-01-01
 *   GET /watchlist?limit=25&after=2024-01-01&before=2025-01-01
 *   GET /reports?wallet=0x...&limit=50&after=2024-01-01&before=2025-01-01
 *   GET /timeline?wallet=0x...&limit=50&after=2024-01-01&before=2025-01-01
 *   POST /dispute
 */
import { Hono } from 'hono'
import { ErrorCodes, errorResponse } from '../errors.js'
import {
  getForensicsFeed,
  getForensicsOverview,
  getForensicsReports,
  getForensicsTimeline,
  getForensicsWatchlist,
  submitFraudDispute,
} from '../services/evidenceService.js'
import type { FraudDisputeBody } from '../types.js'
import { getPayerWallet } from '../utils/paymentUtils.js'

const forensics = new Hono()

forensics.get('/summary', (c) => {
  const outcome = getForensicsOverview(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

forensics.get('/feed', (c) => {
  const outcome = getForensicsFeed({
    reason: c.req.query('reason'),
    limit: c.req.query('limit'),
    after: c.req.query('after'),
    before: c.req.query('before'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

forensics.get('/watchlist', (c) => {
  const outcome = getForensicsWatchlist({
    limit: c.req.query('limit'),
    after: c.req.query('after'),
    before: c.req.query('before'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

forensics.get('/reports', (c) => {
  const outcome = getForensicsReports({
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

forensics.get('/timeline', (c) => {
  const outcome = getForensicsTimeline({
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

forensics.post('/dispute', async (c) => {
  let body: FraudDisputeBody
  try {
    body = await c.req.json<FraudDisputeBody>()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const outcome = submitFraudDispute(body, getPayerWallet(c))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 201)
})

export default forensics
