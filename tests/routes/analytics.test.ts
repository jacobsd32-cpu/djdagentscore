import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  trackGrowthEvent: vi.fn(),
}))

vi.mock('../../src/services/growthService.js', () => ({
  trackGrowthEvent: (...args: unknown[]) => state.trackGrowthEvent(...args),
}))

import { Hono } from 'hono'
import analyticsRoute from '../../src/routes/analytics.js'

function createApp() {
  const app = new Hono()
  app.route('/v1/analytics', analyticsRoute)
  return app
}

describe('analytics routes', () => {
  beforeEach(() => {
    state.trackGrowthEvent.mockReset()
    state.trackGrowthEvent.mockReturnValue({ ok: true })
  })

  it('accepts a valid event payload', async () => {
    const app = createApp()
    const res = await app.request('/v1/analytics/event', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'vitest',
      },
      body: JSON.stringify({
        event: 'landing_view',
        page: '/',
        anonymousId: 'anon-123',
      }),
    })

    expect(res.status).toBe(202)
    expect(state.trackGrowthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'landing_view',
        page: '/',
        anonymousId: 'anon-123',
        userAgent: 'vitest',
      }),
    )
  })

  it('returns 400 for invalid JSON', async () => {
    const app = createApp()
    const res = await app.request('/v1/analytics/event', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{',
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('invalid_json')
  })

  it('returns 400 when the growth service rejects the payload', async () => {
    state.trackGrowthEvent.mockReturnValue({
      ok: false,
      code: 'invalid_request',
      message: 'event must be a lowercase slug up to 64 characters',
    })

    const app = createApp()
    const res = await app.request('/v1/analytics/event', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        event: 'Bad Event',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('invalid_request')
  })
})
