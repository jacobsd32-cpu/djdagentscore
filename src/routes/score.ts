import { Hono, type Context } from 'hono'
import { getOrCalculateScore } from '../scoring/engine.js'
import { submitJob, getJob } from '../jobs/scoreQueue.js'
import { isValidAddress } from '../types.js'
import type { Address, BasicScoreResponse } from '../types.js'
import { errorResponse, ErrorCodes } from '../errors.js'

const score = new Hono()

// GET /v1/score/basic?wallet=0x...
score.get('/basic', async (c) => {
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing wallet address'), 400)
  }

  const result = await getOrCalculateScore(wallet.toLowerCase() as Address)

  const response: BasicScoreResponse & { stale?: boolean } = {
    wallet: result.wallet,
    score: result.score,
    tier: result.tier,
    confidence: result.confidence,
    recommendation: result.recommendation,
    modelVersion: result.modelVersion,
    lastUpdated: result.lastUpdated,
    computedAt: result.computedAt,
    scoreFreshness: result.scoreFreshness,
    ...(result.stale ? { stale: true } : {}),
  }

  return c.json(response)
})

// GET /v1/score/full?wallet=0x...
score.get('/full', async (c) => {
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing wallet address'), 400)
  }

  const result = await getOrCalculateScore(wallet.toLowerCase() as Address)
  return c.json(result)
})

// POST /v1/score/refresh — forces a live recalculation (mutation → POST is correct)
// Also accepts GET for backward compatibility (deprecated).
async function handleRefresh(c: Context) {
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing wallet address'), 400)
  }

  const result = await getOrCalculateScore(wallet.toLowerCase() as Address, true)
  return c.json(result)
}
score.post('/refresh', handleRefresh)
score.get('/refresh', handleRefresh) // deprecated — prefer POST

// POST /v1/score/compute
// Queues a background full-scan score computation and returns a jobId immediately.
// Free — useful when the caller can't wait 20-150s for the synchronous endpoints.
// Accepts wallet from JSON body { wallet: "0x..." } or query param ?wallet=0x... (deprecated).
score.post('/compute', async (c) => {
  let wallet: string | undefined = c.req.query('wallet')

  // Prefer body over query param for POST requests
  if (!wallet) {
    try {
      const body = await c.req.json<{ wallet?: string }>()
      wallet = body?.wallet
    } catch {
      // no body — fall through to validation
    }
  }

  if (!wallet || !isValidAddress(wallet)) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing wallet address'), 400)
  }

  const jobId = submitJob(wallet.toLowerCase() as Address)
  return c.json(
    { jobId, status: 'pending', wallet, pollUrl: `/v1/score/job/${jobId}` },
    202,
  )
})

// GET /v1/score/job/:jobId
// Poll the status of an async scoring job.
score.get('/job/:jobId', (c) => {
  const jobId = c.req.param('jobId')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    return c.json(errorResponse(ErrorCodes.INVALID_JOB_ID, 'Invalid job ID format'), 400)
  }
  const job = getJob(jobId)

  if (!job) {
    return c.json(errorResponse(ErrorCodes.JOB_NOT_FOUND, 'Job not found or expired', { ttl: '10 minutes' }), 404)
  }

  if (job.status === 'pending') {
    return c.json({ jobId, status: 'pending', wallet: job.wallet })
  }

  if (job.status === 'error') {
    return c.json({ jobId, status: 'error', wallet: job.wallet, error: job.error })
  }

  // complete
  return c.json({ jobId, status: 'complete', wallet: job.wallet, result: job.result })
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

  const { wallets } = body
  if (!Array.isArray(wallets)) {
    return c.json(
      errorResponse(ErrorCodes.BATCH_INVALID, 'wallets must be an array'),
      400,
    )
  }
  if (wallets.length < 2 || wallets.length > 20) {
    return c.json(
      errorResponse(
        ErrorCodes.BATCH_INVALID,
        'wallets array must contain 2-20 addresses',
        { min: 2, max: 20, received: wallets.length },
      ),
      400,
    )
  }

  // Validate all addresses upfront
  const invalid = wallets.filter((w) => typeof w !== 'string' || !isValidAddress(w))
  if (invalid.length > 0) {
    return c.json(
      errorResponse(
        ErrorCodes.INVALID_WALLET,
        `${invalid.length} invalid wallet address(es)`,
        { invalidCount: invalid.length },
      ),
      400,
    )
  }

  const normalized = wallets.map((w) => (w as string).toLowerCase() as Address)

  // Score all wallets in parallel
  const results = await Promise.all(
    normalized.map(async (wallet) => {
      const result = await getOrCalculateScore(wallet)
      const basic: BasicScoreResponse = {
        wallet: result.wallet,
        score: result.score,
        tier: result.tier,
        confidence: result.confidence,
        recommendation: result.recommendation,
        modelVersion: result.modelVersion,
        lastUpdated: result.lastUpdated,
        computedAt: result.computedAt,
        scoreFreshness: result.scoreFreshness,
      }
      return basic
    }),
  )

  return c.json({ results, count: results.length })
})

export default score
