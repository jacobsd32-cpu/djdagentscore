import { Hono } from 'hono'
import { getOrCalculateScore } from '../scoring/engine.js'
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

export default score
