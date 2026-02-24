import { afterEach, describe, expect, it, vi } from 'vitest'

// Track all DB operations for assertions
const mockDbRuns: Array<{ sql: string; params: unknown[] }> = []
const mockDbRows: Record<string, unknown>[] = []
let lastInsertRowid = 1

vi.mock('../../src/db.js', () => ({
  db: {
    prepare: vi.fn((sql: string) => ({
      get: vi.fn(),
      all: vi.fn(() => mockDbRows),
      run: vi.fn((...params: unknown[]) => {
        mockDbRuns.push({ sql, params })
        return { lastInsertRowid: lastInsertRowid++, changes: sql.includes('UPDATE') ? 1 : 0 }
      }),
    })),
  },
}))

vi.mock('../../src/errors.js', () => ({
  errorResponse: (code: string, message: string, details?: Record<string, unknown>) => ({
    error: { code, message, ...(details ? { details } : {}) },
  }),
}))

describe('apiKeys admin routes', () => {
  const ADMIN_KEY = 'test-admin-key-12345678901234567890'
  const originalKey = process.env.ADMIN_KEY

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ADMIN_KEY = originalKey
    } else {
      delete process.env.ADMIN_KEY
    }
    mockDbRuns.length = 0
    mockDbRows.length = 0
    lastInsertRowid = 1
  })

  // ── Auth tests ──

  it('returns 401 without X-ADMIN-KEY header', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys', {
      method: 'GET',
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 with wrong X-ADMIN-KEY', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys', {
      method: 'GET',
      headers: { 'x-admin-key': 'wrong-key-that-is-wrong-length!!' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 503 when ADMIN_KEY is not configured', async () => {
    delete process.env.ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys', {
      method: 'GET',
      headers: { 'x-admin-key': 'anything' },
    })
    expect(res.status).toBe(503)
  })

  // ── POST / — Create key ──

  it('creates a new API key and returns the raw key only on creation', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys', {
      method: 'POST',
      headers: {
        'x-admin-key': ADMIN_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        wallet: '0xABCD1234',
        name: 'My Test Key',
        tier: 'premium',
        monthly_limit: 5000,
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    // The raw key is returned
    expect(typeof body.key).toBe('string')
    expect((body.key as string).startsWith('djd_live_')).toBe(true)
    // The prefix is returned (first 16 chars + ...)
    expect(typeof body.key_prefix).toBe('string')
    expect((body.key_prefix as string).endsWith('...')).toBe(true)
    // Wallet is lowercased
    expect(body.wallet).toBe('0xabcd1234')
    expect(body.name).toBe('My Test Key')
    expect(body.tier).toBe('premium')
    expect(body.monthly_limit).toBe(5000)
    expect(body.message).toContain('Store this key securely')
  })

  it('returns 400 when wallet is missing from create request', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys', {
      method: 'POST',
      headers: {
        'x-admin-key': ADMIN_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Missing wallet' }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('invalid_request')
  })

  // ── GET / — List keys ──

  it('lists keys without exposing raw key values', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    // Set up mock rows that would be returned by the listing query
    mockDbRows.push({
      id: 1,
      key_prefix: 'djd_live_abc123...',
      wallet: '0xabcd1234',
      name: 'Test',
      tier: 'standard',
      monthly_limit: 10000,
      monthly_used: 42,
      usage_reset_at: '2026-04-01T00:00:00.000Z',
      is_active: 1,
      created_at: '2026-02-24T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
    })

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys', {
      method: 'GET',
      headers: { 'x-admin-key': ADMIN_KEY },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { keys: Record<string, unknown>[]; count: number }
    expect(body.count).toBe(1)
    expect(body.keys[0]!.key_prefix).toBe('djd_live_abc123...')
    // The raw key or hash should NOT be in the listing
    expect(body.keys[0]!).not.toHaveProperty('key')
    expect(body.keys[0]!).not.toHaveProperty('key_hash')
  })

  // ── DELETE /:id — Revoke key ──

  it('revokes a key by ID (soft delete)', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys/1', {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.success).toBe(true)
    expect(body.message).toBe('API key revoked')
  })

  it('returns 400 for invalid key ID on revoke', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys/abc', {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY },
    })

    expect(res.status).toBe(400)
  })

  // ── POST /:id/reset — Reset usage ──

  it('resets monthly usage counter for a key', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys/1/reset', {
      method: 'POST',
      headers: { 'x-admin-key': ADMIN_KEY },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.success).toBe(true)
    expect(body.message).toBe('Usage counter reset')
  })

  it('returns 400 for invalid key ID on reset', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys/xyz/reset', {
      method: 'POST',
      headers: { 'x-admin-key': ADMIN_KEY },
    })

    expect(res.status).toBe(400)
  })
})
