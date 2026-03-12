import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getEconomyMetrics: vi.fn(),
}))

vi.mock('../../src/db.js', () => ({
  getEconomyMetrics: (...args: unknown[]) => state.getEconomyMetrics(...args),
  getEcosystemStats: vi.fn(),
  getRecentActivity: vi.fn(),
}))

vi.mock('../../src/templates/explorer.js', () => ({
  explorerDashboardHtml: vi.fn(),
}))

describe('GET /v1/data/economy', () => {
  beforeEach(() => {
    state.getEconomyMetrics.mockReset()
    state.getEconomyMetrics.mockReturnValue([
      {
        period_start: '2026-03-01',
        period_end: '2026-03-02',
        period_type: 'daily',
      },
    ])
  })

  it('returns the economy dashboard with default period and limit', async () => {
    const { Hono } = await import('hono')
    const { default: economyRoute } = await import('../../src/routes/economy.js')

    const app = new Hono()
    app.route('/v1/data/economy', economyRoute)

    const res = await app.request('/v1/data/economy')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.period).toBe('daily')
    expect(body.limit).toBe(30)
    expect(body.count).toBe(1)
    expect(state.getEconomyMetrics).toHaveBeenCalledWith('daily', 30)
  })

  it('clamps the limit to the public maximum', async () => {
    const { Hono } = await import('hono')
    const { default: economyRoute } = await import('../../src/routes/economy.js')

    const app = new Hono()
    app.route('/v1/data/economy', economyRoute)

    const res = await app.request('/v1/data/economy?period=monthly&limit=500')
    expect(res.status).toBe(200)
    expect(state.getEconomyMetrics).toHaveBeenCalledWith('monthly', 90)
  })

  it('returns a structured error for an invalid period', async () => {
    const { Hono } = await import('hono')
    const { default: economyRoute } = await import('../../src/routes/economy.js')

    const app = new Hono()
    app.route('/v1/data/economy', economyRoute)

    const res = await app.request('/v1/data/economy?period=yearly')
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('invalid_period')
    expect(state.getEconomyMetrics).not.toHaveBeenCalled()
  })
})
