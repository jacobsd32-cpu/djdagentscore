import { Hono } from 'hono'
import { errorResponse } from '../errors.js'
import { type GrowthEventInput, trackGrowthEvent } from '../services/growthService.js'

const analytics = new Hono()

analytics.post('/event', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body || typeof body !== 'object') {
    return c.json(errorResponse('invalid_json', 'Invalid JSON body'), 400)
  }

  const payload = body as GrowthEventInput & Record<string, unknown>

  const outcome = trackGrowthEvent({
    ...payload,
    source: typeof payload.source === 'string' ? payload.source : 'web',
    userAgent: c.req.header('user-agent') ?? null,
  })

  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), 400)
  }

  return c.json({ ok: true }, 202)
})

export default analytics
