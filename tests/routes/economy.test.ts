import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getEconomyMetrics: vi.fn(),
  getEconomySurvivalSummary: vi.fn(),
  getEconomySurvivalCohort: vi.fn(),
  listEconomyTierSurvival: vi.fn(),
  listEconomyAtRiskWallets: vi.fn(),
}))

vi.mock('../../src/db.js', () => ({
  getEconomyMetrics: (...args: unknown[]) => state.getEconomyMetrics(...args),
  getEconomySurvivalSummary: (...args: unknown[]) => state.getEconomySurvivalSummary(...args),
  getEconomySurvivalCohort: (...args: unknown[]) => state.getEconomySurvivalCohort(...args),
  listEconomyTierSurvival: (...args: unknown[]) => state.listEconomyTierSurvival(...args),
  listEconomyAtRiskWallets: (...args: unknown[]) => state.listEconomyAtRiskWallets(...args),
  getEcosystemStats: vi.fn(),
  getRecentActivity: vi.fn(),
}))

vi.mock('../../src/templates/explorer.js', () => ({
  explorerDashboardHtml: vi.fn(),
}))

describe('GET /v1/data/economy', () => {
  beforeEach(() => {
    state.getEconomyMetrics.mockReset()
    state.getEconomySurvivalSummary.mockReset()
    state.getEconomySurvivalCohort.mockReset()
    state.listEconomyTierSurvival.mockReset()
    state.listEconomyAtRiskWallets.mockReset()
    state.getEconomyMetrics.mockReturnValue([
      {
        period_start: '2026-03-01',
        period_end: '2026-03-02',
        period_type: 'daily',
        total_tx_count: 84,
        total_volume: 4200,
        avg_tx_size: 50,
        active_wallets: 31,
        new_wallets: 8,
      },
    ])
    state.getEconomySurvivalSummary.mockReturnValue({
      total_wallets: 120,
      active_7d: 82,
      active_30d: 96,
      dormant_30d: 24,
      avg_days_since_last_seen: 11.4,
    })
    state.getEconomySurvivalCohort.mockImplementation((days: number) => ({
      horizon_days: days,
      eligible_wallets: days === 90 ? 40 : 80,
      surviving_wallets: days === 90 ? 18 : 52,
    }))
    state.listEconomyTierSurvival.mockReturnValue([
      {
        tier: 'Trusted',
        wallet_count: 28,
        active_30d: 25,
      },
    ])
    state.listEconomyAtRiskWallets.mockReturnValue([
      {
        wallet: '0x1111111111111111111111111111111111111111',
        current_score: 41,
        current_tier: 'Emerging',
        first_seen: '2026-01-01T00:00:00.000Z',
        last_seen: '2026-02-01T00:00:00.000Z',
        days_since_last_seen: 40,
        score_change_30d: -14,
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

  it('returns the paid economy summary alias with the same payload shape', async () => {
    const { Hono } = await import('hono')
    const { default: economyRoute } = await import('../../src/routes/economy.js')

    const app = new Hono()
    app.route('/v1/data/economy', economyRoute)

    const res = await app.request('/v1/data/economy/summary?period=weekly&limit=10')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.period).toBe('weekly')
    expect(body.limit).toBe(10)
    expect(state.getEconomyMetrics).toHaveBeenCalledWith('weekly', 10)
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

  it('returns the survival analytics view', async () => {
    const { Hono } = await import('hono')
    const { default: economyRoute } = await import('../../src/routes/economy.js')

    const app = new Hono()
    app.route('/v1/data/economy', economyRoute)

    const res = await app.request('/v1/data/economy/survival?limit=5')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.summary.total_wallets).toBe(120)
    expect(body.cohorts[0].horizon_days).toBe(7)
    expect(body.by_tier[0].tier).toBe('Trusted')
    expect(body.at_risk_wallets[0].risk_bucket).toBe('dormant')
    expect(body.returned).toBe(1)
    expect(state.listEconomyAtRiskWallets).toHaveBeenCalledWith(5)
  })

  it('returns the economy volume view', async () => {
    const { Hono } = await import('hono')
    const { default: economyRoute } = await import('../../src/routes/economy.js')

    const app = new Hono()
    app.route('/v1/data/economy', economyRoute)

    const res = await app.request('/v1/data/economy/volume?period=monthly&limit=12')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.period).toBe('monthly')
    expect(body.series[0].period_start).toBe('2026-03-01')
    expect(body.series[0].total_volume).toBe(4200)
    expect(body.count).toBe(1)
    expect(state.getEconomyMetrics).toHaveBeenCalledWith('monthly', 12)
  })
})
