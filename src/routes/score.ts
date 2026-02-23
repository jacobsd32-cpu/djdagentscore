import { Hono, type Context } from 'hono'
import { getOrCalculateScore } from '../scoring/engine.js'
import { submitJob, getJob } from '../jobs/scoreQueue.js'
import { isValidAddress } from '../types.js'
import type { Address, BasicScoreResponse } from '../types.js'

const score = new Hono()

// GET /v1/score/basic?wallet=0x...
score.get('/basic', async (c) => {
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
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
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
  }

  const result = await getOrCalculateScore(wallet.toLowerCase() as Address)
  return c.json(result)
})

// POST /v1/score/refresh — forces a live recalculation (mutation → POST is correct)
// Also accepts GET for backward compatibility (deprecated).
async function handleRefresh(c: Context) {
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
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
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
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
  const job = getJob(jobId)

  if (!job) {
    return c.json({ error: 'Job not found or expired (jobs expire after 10 minutes)' }, 404)
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

export default score
