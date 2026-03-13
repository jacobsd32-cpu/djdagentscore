import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getEcosystemStats: vi.fn(),
  getRecentActivity: vi.fn(),
  getCertificationDirectoryView: vi.fn(),
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

vi.mock('../../src/services/certificationService.js', () => ({
  getCertificationDirectoryView: (...args: unknown[]) => state.getCertificationDirectoryView(...args),
}))

describe('explorer routes', () => {
  beforeEach(() => {
    state.getEcosystemStats.mockReset()
    state.getRecentActivity.mockReset()
    state.getCertificationDirectoryView.mockReset()
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
    state.getCertificationDirectoryView.mockReturnValue({
      ok: true,
      data: {
        as_of: '2026-03-12T00:00:00Z',
        filters: { limit: 8, tier: null },
        returned: 1,
        certifications: [
          {
            wallet: '0x2222222222222222222222222222222222222222',
            certification: {
              id: 1,
              tier: 'Trusted',
              score_at_certification: 82,
              granted_at: '2026-03-12T00:00:00Z',
              expires_at: '2027-03-12T00:00:00Z',
            },
            current_score: { score: 84, tier: 'Trusted', confidence: 0.88 },
            profile: {
              name: 'Certified Agent',
              description: 'Active certified endpoint',
              github_url: null,
              website_url: 'https://example.test',
              github_verified: false,
            },
            links: {
              certification_badge: 'https://example.test/badge',
              score_badge: 'https://example.test/score-badge',
              standards_document: 'https://example.test/erc8004',
              evaluator_preview: 'https://example.test/evaluator',
              agent_profile: 'https://example.test/profile',
              certify_readiness: 'https://example.test/certify?wallet=0x2222',
            },
          },
        ],
      },
    })
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

  it('returns certified directory entries and clamps the limit', async () => {
    const { Hono } = await import('hono')
    const { default: explorerRoute } = await import('../../src/routes/explorer.js')

    const app = new Hono()
    app.route('/explorer', explorerRoute)

    const res = await app.request('/explorer/api/certified?limit=100')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.returned).toBe(1)
    expect(body.certified[0]?.wallet).toBe('0x2222222222222222222222222222222222222222')
    expect(state.getCertificationDirectoryView).toHaveBeenCalledWith({ limit: '24', tier: undefined })
  })
})
