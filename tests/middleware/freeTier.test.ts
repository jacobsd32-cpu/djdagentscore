import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/db.js', () => ({
  countFreeTierUsesToday: vi.fn().mockReturnValue(0),
}))

vi.mock('../../src/scoring/engine.js', () => ({
  getOrCalculateScore: vi.fn().mockResolvedValue({
    wallet: '0x1234567890abcdef1234567890abcdef12345678',
    score: 75,
    tier: 'Trusted',
    confidence: 0.85,
    recommendation: 'generally_reliable',
    modelVersion: '2.0.0',
    lastUpdated: '2026-02-23T00:00:00Z',
    computedAt: '2026-02-23T00:00:00Z',
    scoreFreshness: 1.0,
  }),
  MODEL_VERSION: '2.0.0',
}))

describe('freeTierMiddleware', () => {
  it('returns confidence and recommendation from the result', async () => {
    const { Hono } = await import('hono')
    const { freeTierMiddleware } = await import('../../src/middleware/freeTier.js')

    const app = new Hono()
    app.use('/v1/score/basic', freeTierMiddleware)

    const res = await app.request(
      '/v1/score/basic?wallet=0x1234567890abcdef1234567890abcdef12345678',
    )
    const body = await res.json()

    expect(body.confidence).toBe(0.85)
    expect(body.recommendation).toBe('generally_reliable')
    expect(body.freeTier).toBe(true)
  })
})
