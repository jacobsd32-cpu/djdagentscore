import { Hono } from 'hono'
import { getOrCalculateScore } from '../scoring/engine.js'
import { submitJob, getJob } from '../jobs/scoreQueue.js'
import type { Address, BasicScoreResponse } from '../types.js'

function isValidAddress(addr: string): addr is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

const score = new Hono()

// GET /v1/score/basic?wallet=0x...
score.get('/basic', async (c) => {
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
  }

  const result = await getOrCalculateScore(wallet as Address)

  const response: BasicScoreResponse & { stale?: boolean } = {
    wallet: result.wallet,
    score: result.score,
    tier: result.tier,
    confidence: result.confidence,
    recommendation: result.recommendation,
    modelVersion: result.modelVersion,
    lastUpdated: result.lastUpdated,
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

  const result = await getOrCalculateScore(wallet as Address)
  return c.json(result)
})

// GET /v1/score/refresh?wallet=0x...
score.get('/refresh', async (c) => {
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
  }

  const result = await getOrCalculateScore(wallet as Address, true)
  return c.json(result)
})

// POST /v1/score/compute?wallet=0x...
// Queues a background full-scan score computation and returns a jobId immediately.
// Free — useful when the caller can't wait 20-150s for the synchronous endpoints.
score.post('/compute', (c) => {
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
  }

  const jobId = submitJob(wallet as Address)
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
