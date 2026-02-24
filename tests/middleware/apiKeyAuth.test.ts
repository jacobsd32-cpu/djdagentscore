import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

const TEST_KEY = 'djd_live_abc123def456'
const TEST_HASH = hashKey(TEST_KEY)
const TEST_WALLET = '0xtest1234'

const futureDate = new Date()
futureDate.setMonth(futureDate.getMonth() + 1)
futureDate.setDate(1)
futureDate.setHours(0, 0, 0, 0)
const FUTURE_RESET = futureDate.toISOString()

// Mock database with controllable row data
let mockRow: Record<string, unknown> | undefined

vi.mock('../../src/db.js', () => ({
  db: {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn((..._args: unknown[]) => mockRow),
      run: vi.fn(),
    }),
  },
}))

vi.mock('../../src/errors.js', () => ({
  errorResponse: (code: string, message: string, details?: Record<string, unknown>) => ({
    error: { code, message, ...(details ? { details } : {}) },
  }),
  ErrorCodes: {
    API_KEY_INVALID: 'api_key_invalid',
    API_KEY_EXHAUSTED: 'api_key_quota_exhausted',
    API_KEY_REVOKED: 'api_key_revoked',
  },
}))

describe('apiKeyAuthMiddleware', () => {
  beforeEach(() => {
    mockRow = undefined
    vi.clearAllMocks()
  })

  it('passes through when no Authorization header is present', async () => {
    const { Hono } = await import('hono')
    const { apiKeyAuthMiddleware } = await import('../../src/middleware/apiKeyAuth.js')

    const app = new Hono()
    app.use('*', apiKeyAuthMiddleware)
    app.get('/test', (c) => c.json({ passedThrough: true }))

    const res = await app.request('/test')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.passedThrough).toBe(true)
  })

  it('passes through when Authorization header is not a djd_live_ bearer token', async () => {
    const { Hono } = await import('hono')
    const { apiKeyAuthMiddleware } = await import('../../src/middleware/apiKeyAuth.js')

    const app = new Hono()
    app.use('*', apiKeyAuthMiddleware)
    app.get('/test', (c) => c.json({ passedThrough: true }))

    const res = await app.request('/test', {
      headers: { authorization: 'Bearer some_other_token' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.passedThrough).toBe(true)
  })

  it('returns 401 when djd_live_ key is not found in database', async () => {
    mockRow = undefined

    const { Hono } = await import('hono')
    const { apiKeyAuthMiddleware } = await import('../../src/middleware/apiKeyAuth.js')

    const app = new Hono()
    app.use('*', apiKeyAuthMiddleware)
    app.get('/test', (c) => c.json({ passedThrough: true }))

    const res = await app.request('/test', {
      headers: { authorization: `Bearer ${TEST_KEY}` },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('api_key_invalid')
  })

  it('returns 401 for a revoked key', async () => {
    mockRow = {
      id: 1,
      key_hash: TEST_HASH,
      key_prefix: 'djd_live_abc123...',
      wallet: TEST_WALLET,
      name: 'Test Key',
      tier: 'standard',
      monthly_limit: 10000,
      monthly_used: 0,
      usage_reset_at: FUTURE_RESET,
      is_active: 0,
      last_used_at: null,
      revoked_at: '2026-01-01T00:00:00.000Z',
    }

    const { Hono } = await import('hono')
    const { apiKeyAuthMiddleware } = await import('../../src/middleware/apiKeyAuth.js')

    const app = new Hono()
    app.use('*', apiKeyAuthMiddleware)
    app.get('/test', (c) => c.json({ passedThrough: true }))

    const res = await app.request('/test', {
      headers: { authorization: `Bearer ${TEST_KEY}` },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('api_key_revoked')
  })

  it('returns 401 for an inactive key', async () => {
    mockRow = {
      id: 1,
      key_hash: TEST_HASH,
      key_prefix: 'djd_live_abc123...',
      wallet: TEST_WALLET,
      name: 'Test Key',
      tier: 'standard',
      monthly_limit: 10000,
      monthly_used: 0,
      usage_reset_at: FUTURE_RESET,
      is_active: 0,
      last_used_at: null,
      revoked_at: null,
    }

    const { Hono } = await import('hono')
    const { apiKeyAuthMiddleware } = await import('../../src/middleware/apiKeyAuth.js')

    const app = new Hono()
    app.use('*', apiKeyAuthMiddleware)
    app.get('/test', (c) => c.json({ passedThrough: true }))

    const res = await app.request('/test', {
      headers: { authorization: `Bearer ${TEST_KEY}` },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('api_key_invalid')
  })

  it('returns 429 when monthly quota is exhausted', async () => {
    mockRow = {
      id: 1,
      key_hash: TEST_HASH,
      key_prefix: 'djd_live_abc123...',
      wallet: TEST_WALLET,
      name: 'Test Key',
      tier: 'standard',
      monthly_limit: 100,
      monthly_used: 100,
      usage_reset_at: FUTURE_RESET,
      is_active: 1,
      last_used_at: null,
      revoked_at: null,
    }

    const { Hono } = await import('hono')
    const { apiKeyAuthMiddleware } = await import('../../src/middleware/apiKeyAuth.js')

    const app = new Hono()
    app.use('*', apiKeyAuthMiddleware)
    app.get('/test', (c) => c.json({ passedThrough: true }))

    const res = await app.request('/test', {
      headers: { authorization: `Bearer ${TEST_KEY}` },
    })
    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: { code: string; details: { limit: number; used: number } } }
    expect(body.error.code).toBe('api_key_quota_exhausted')
    expect(body.error.details.limit).toBe(100)
    expect(body.error.details.used).toBe(100)
  })

  it('sets context variables for a valid key with remaining quota', async () => {
    mockRow = {
      id: 42,
      key_hash: TEST_HASH,
      key_prefix: 'djd_live_abc123...',
      wallet: TEST_WALLET,
      name: 'Test Key',
      tier: 'premium',
      monthly_limit: 10000,
      monthly_used: 50,
      usage_reset_at: FUTURE_RESET,
      is_active: 1,
      last_used_at: null,
      revoked_at: null,
    }

    const { Hono } = await import('hono')
    const { apiKeyAuthMiddleware } = await import('../../src/middleware/apiKeyAuth.js')

    const app = new Hono()
    app.use('*', apiKeyAuthMiddleware)
    app.get('/test', (c) => {
      return c.json({
        apiKeyId: c.get('apiKeyId'),
        apiKeyWallet: c.get('apiKeyWallet'),
        apiKeyTier: c.get('apiKeyTier'),
      })
    })

    const res = await app.request('/test', {
      headers: { authorization: `Bearer ${TEST_KEY}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.apiKeyId).toBe(42)
    expect(body.apiKeyWallet).toBe(TEST_WALLET)
    expect(body.apiKeyTier).toBe('premium')
  })
})
