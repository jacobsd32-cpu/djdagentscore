import { describe, expect, it, vi } from 'vitest'

const mockGetScore = vi.fn()

vi.mock('../../src/db.js', () => ({
  getScore: (...args: unknown[]) => mockGetScore(...args),
}))

import { Hono } from 'hono'
import badgeRoute from '../../src/routes/badge.js'

describe('GET /v1/badge/:wallet.svg', () => {
  it('returns an SVG badge for a scored wallet', async () => {
    mockGetScore.mockReturnValue({ composite_score: 88, tier: 'Trusted' })

    const app = new Hono()
    app.route('/v1/badge', badgeRoute)

    const res = await app.request('/v1/badge/0x1111111111111111111111111111111111111111.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/svg+xml')
    expect(res.headers.get('cache-control')).toContain('max-age=600')
    const body = await res.text()
    expect(body).toContain('djd score')
    expect(body).toContain('88')
    expect(body).toContain('Trusted')
  })

  it('returns 400 for an invalid wallet filename', async () => {
    const app = new Hono()
    app.route('/v1/badge', badgeRoute)

    const res = await app.request('/v1/badge/not-a-wallet.svg')
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Invalid wallet address')
  })
})
