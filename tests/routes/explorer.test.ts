import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getEcosystemStats: vi.fn(),
  getRecentActivity: vi.fn(),
  explorerDashboardHtml: vi.fn(),
}))

vi.mock('../../src/db.js', () => ({
  getEcosystemStats: (...args: unknown[]) => state.getEcosystemStats(...args),
  getRecentActivity: (...args: unknown[]) => state.getRecentActivity(...args),
  getEconomyMetrics: vi.fn(),
}))

vi.mock('../../src/templates/explorer.js', () => ({
  explorerDashboardHtml: (...args: unknown[]) => state.explorerDashboardHtml(...args),
}))

describe('explorer routes', () => {
  beforeEach(() => {
    state.getEcosystemStats.mockReset()
    state.getRecentActivity.mockReset()
    state.explorerDashboardHtml.mockReset()

    state.getEcosystemStats.mockReturnValue({
      totalWalletsScored: 42,
      totalWalletsIndexed: 100,
      totalTransactions: 200,
      totalRegistered: 10,
      avgScore: 71.2,
      medianScore: 73,
      tierDistribution: { Trusted: 12 },
      scoreHistogram: [{ bucket: '70-79', count: 8 }],
    })
    state.getRecentActivity.mockReturnValue([
      {
        type: 'registration',
        wallet: '0x1111111111111111111111111111111111111111',
        timestamp: '2026-03-12T00:00:00Z',
        detail: 'New agent registered',
      },
    ])
    state.explorerDashboardHtml.mockReturnValue('<html><body>Explorer dashboard</body></html>')
  })

  it('renders the explorer dashboard page', async () => {
    const { Hono } = await import('hono')
    const { default: explorerRoute } = await import('../../src/routes/explorer.js')

    const app = new Hono()
    app.route('/explorer', explorerRoute)

    const res = await app.request('/explorer')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(state.explorerDashboardHtml).toHaveBeenCalledWith(expect.objectContaining({ totalWalletsScored: 42 }))
    expect(await res.text()).toContain('Explorer dashboard')
  })

  it('returns explorer stats as JSON', async () => {
    const { Hono } = await import('hono')
    const { default: explorerRoute } = await import('../../src/routes/explorer.js')

    const app = new Hono()
    app.route('/explorer', explorerRoute)

    const res = await app.request('/explorer/api/stats')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalWalletsScored).toBe(42)
  })

  it('returns recent activity and clamps the limit', async () => {
    const { Hono } = await import('hono')
    const { default: explorerRoute } = await import('../../src/routes/explorer.js')

    const app = new Hono()
    app.route('/explorer', explorerRoute)

    const res = await app.request('/explorer/api/activity?limit=500')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activity).toHaveLength(1)
    expect(state.getRecentActivity).toHaveBeenCalledWith(50)
  })
})
