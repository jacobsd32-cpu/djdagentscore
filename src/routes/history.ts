/**
 * Historical Score API
 * GET /v1/score/history?wallet=0x...&limit=50&after=2024-01-01&before=2025-01-01
 *
 * Returns paginated score history with trend analysis.
 * Protected by x402 ($0.15 USDC) or API key auth.
 */
import { Hono } from 'hono'
import { errorResponse } from '../errors.js'
import { getScoreHistoryTimeline } from '../services/evidenceService.js'

const history = new Hono()

history.get('/', (c) => {
  const outcome = getScoreHistoryTimeline({
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

export default history
