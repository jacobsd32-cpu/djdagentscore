import { Hono, type Context } from 'hono'
import { errorResponse, ErrorCodes } from '../errors.js'
import { getRiskScore } from '../services/riskService.js'
import {
  getBasicScore,
  getBatchScores,
  getFullScore,
  getScoreJobStatus,
  queueScoreComputation,
  refreshScore,
} from '../services/scoreService.js'

const score = new Hono()

// GET /v1/score/basic?wallet=0x...
score.get('/basic', async (c) => {
  const outcome = await getBasicScore(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/full?wallet=0x...
score.get('/full', async (c) => {
  const outcome = await getFullScore(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/risk?wallet=0x...
score.get('/risk', async (c) => {
  const outcome = await getRiskScore(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// POST /v1/score/refresh — forces a live recalculation (mutation → POST is correct)
// Also accepts GET for backward compatibility (deprecated).
async function handleRefresh(c: Context) {
  const outcome = await refreshScore(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
}
score.post('/refresh', handleRefresh)
score.get('/refresh', handleRefresh) // deprecated — prefer POST

// POST /v1/score/compute
// Queues a background full-scan score computation and returns a jobId immediately.
// Free — useful when the caller can't wait 20-150s for the synchronous endpoints.
// Accepts wallet from JSON body { wallet: "0x..." } or query param ?wallet=0x... (deprecated).
score.post('/compute', async (c) => {
  const outcome = await queueScoreComputation(
    c.req.query('wallet'),
    async () => await c.req.json<{ wallet?: string }>(),
  )
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 202)
})

// GET /v1/score/job/:jobId
// Poll the status of an async scoring job.
score.get('/job/:jobId', (c) => {
  const outcome = getScoreJobStatus(c.req.param('jobId'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// POST /v1/score/batch
// Score up to 20 wallets in one request ($0.50 flat fee via x402).
score.post('/batch', async (c) => {
  let body: { wallets?: unknown }
  try {
    body = await c.req.json<{ wallets?: unknown }>()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const outcome = await getBatchScores(body.wallets)
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

export default score
