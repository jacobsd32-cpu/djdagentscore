import { Hono } from 'hono'
import { getRegistration, getScore, getScoreHistory } from '../db.js'
import { log } from '../logger.js'
import { getOrCalculateScore } from '../scoring/engine.js'
import { renderAgentPage } from '../templates/agentProfile.js'
import type { Address } from '../types.js'

const agentRoute = new Hono()

agentRoute.get('/:wallet', async (c) => {
  const raw = c.req.param('wallet').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(raw)) {
    return c.text('Invalid wallet address', 400)
  }

  const origin = new URL(c.req.url).origin

  // Try cache first; if missing, compute the score (populates cache as side-effect)
  let score = getScore(raw)
  if (!score) {
    try {
      await getOrCalculateScore(raw as Address, false)
      score = getScore(raw) // re-read from cache after computation
    } catch (err) {
      log.warn('agent', `Score computation failed for ${raw} — rendering unscored state`, err)
    }
  }

  const history = getScoreHistory(raw)
  const reg = getRegistration(raw)

  const html = renderAgentPage(raw, score, history, reg, origin)
  return c.html(html)
})

export default agentRoute
