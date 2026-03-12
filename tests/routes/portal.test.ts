import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  apiKeyRow: null as null | {
    id: number
    key_prefix: string
    wallet: string
    name: string | null
    tier: string
    monthly_limit: number
    monthly_used: number
    usage_reset_at: string
    is_active: number
    created_at: string
    last_used_at: string | null
    revoked_at: string | null
    stripe_customer_id: string | null
  },
  lastAnalyticsArgs: null as null | { wallet: string; days: number },
}))

vi.mock('../../src/db.js', () => ({
  findApiKeyByHash: (keyHash: string) => {
    if (keyHash === 'a'.repeat(64)) return state.apiKeyRow
    return undefined
  },
  getApiKeyAnalytics: (wallet: string, days: number) => {
    state.lastAnalyticsArgs = { wallet, days }
    return {
      totalRequests: 42,
      endpointBreakdown: [{ endpoint: '/v1/score/basic', count: 21 }],
      dailyVolume: [{ date: '2026-03-12', count: 42 }],
      topWallets: [{ wallet: '0xabc', count: 5 }],
    }
  },
}))

describe('portal routes', () => {
  afterEach(() => {
    state.apiKeyRow = null
    state.lastAnalyticsArgs = null
  })

  it('renders the developer portal page', async () => {
    const { Hono } = await import('hono')
    const { default: portalRoute } = await import('../../src/routes/portal.js')

    const app = new Hono()
    app.route('/portal', portalRoute)

    const res = await app.request('/portal')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Developer Portal')
  })

  it('returns 400 for invalid JSON on usage lookup', async () => {
    const { Hono } = await import('hono')
    const { default: portalRoute } = await import('../../src/routes/portal.js')

    const app = new Hono()
    app.route('/portal', portalRoute)

    const res = await app.request('/portal/api/usage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_json')
  })

  it('returns 400 for invalid key hash', async () => {
    const { Hono } = await import('hono')
    const { default: portalRoute } = await import('../../src/routes/portal.js')

    const app = new Hono()
    app.route('/portal', portalRoute)

    const res = await app.request('/portal/api/usage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyHash: 'short' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_json')
  })

  it('returns 404 when the API key does not exist', async () => {
    const { Hono } = await import('hono')
    const { default: portalRoute } = await import('../../src/routes/portal.js')

    const app = new Hono()
    app.route('/portal', portalRoute)

    const res = await app.request('/portal/api/usage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyHash: 'a'.repeat(64) }),
    })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('api_key_invalid')
  })

  it('returns 401 for a revoked API key', async () => {
    state.apiKeyRow = {
      id: 1,
      key_prefix: 'djd_live_123456...',
      wallet: '0xwallet',
      name: null,
      tier: 'growth',
      monthly_limit: 5000,
      monthly_used: 10,
      usage_reset_at: '2026-04-01T00:00:00.000Z',
      is_active: 0,
      created_at: '2026-03-01T00:00:00.000Z',
      last_used_at: null,
      revoked_at: '2026-03-10T00:00:00.000Z',
      stripe_customer_id: 'cus_123',
    }

    const { Hono } = await import('hono')
    const { default: portalRoute } = await import('../../src/routes/portal.js')

    const app = new Hono()
    app.route('/portal', portalRoute)

    const res = await app.request('/portal/api/usage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyHash: 'a'.repeat(64) }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('api_key_revoked')
  })

  it('returns portal usage data for a valid API key', async () => {
    state.apiKeyRow = {
      id: 1,
      key_prefix: 'djd_live_123456...',
      wallet: '0xwallet',
      name: null,
      tier: 'growth',
      monthly_limit: 5000,
      monthly_used: 10,
      usage_reset_at: '2026-04-01T00:00:00.000Z',
      is_active: 1,
      created_at: '2026-03-01T00:00:00.000Z',
      last_used_at: '2026-03-11T00:00:00.000Z',
      revoked_at: null,
      stripe_customer_id: 'cus_123',
    }

    const { Hono } = await import('hono')
    const { default: portalRoute } = await import('../../src/routes/portal.js')

    const app = new Hono()
    app.route('/portal', portalRoute)

    const res = await app.request('/portal/api/usage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyHash: 'a'.repeat(64) }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.keyPrefix).toBe('djd_live_123456...')
    expect(body.planName).toBe('Growth')
    expect(body.monthlyUsed).toBe(10)
    expect(body.stripeCustomerId).toBe('cus_123')
  })

  it('returns analytics and clamps the days window', async () => {
    state.apiKeyRow = {
      id: 1,
      key_prefix: 'djd_live_123456...',
      wallet: '0xwallet',
      name: null,
      tier: 'starter',
      monthly_limit: 1000,
      monthly_used: 10,
      usage_reset_at: '2026-04-01T00:00:00.000Z',
      is_active: 1,
      created_at: '2026-03-01T00:00:00.000Z',
      last_used_at: '2026-03-11T00:00:00.000Z',
      revoked_at: null,
      stripe_customer_id: null,
    }

    const { Hono } = await import('hono')
    const { default: portalRoute } = await import('../../src/routes/portal.js')

    const app = new Hono()
    app.route('/portal', portalRoute)

    const res = await app.request('/portal/api/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyHash: 'a'.repeat(64), days: 365 }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalRequests).toBe(42)
    expect(state.lastAnalyticsArgs).toEqual({ wallet: '0xwallet', days: 90 })
  })
})
