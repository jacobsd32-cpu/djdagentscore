import { afterEach, describe, expect, it, vi } from 'vitest'

interface StoredApiKey {
  id: number
  key_hash: string
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
}

const state = vi.hoisted(() => ({
  rows: [] as StoredApiKey[],
  nextId: 1,
}))

vi.mock('../../src/db.js', () => ({
  insertApiKey: (input: {
    key_hash: string
    key_prefix: string
    wallet: string
    name: string | null
    tier: string
    monthly_limit: number
    usage_reset_at: string
    stripe_customer_id?: string | null
  }) => {
    const row: StoredApiKey = {
      id: state.nextId++,
      key_hash: input.key_hash,
      key_prefix: input.key_prefix,
      wallet: input.wallet,
      name: input.name,
      tier: input.tier,
      monthly_limit: input.monthly_limit,
      monthly_used: 0,
      usage_reset_at: input.usage_reset_at,
      is_active: 1,
      created_at: '2026-03-12T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
      stripe_customer_id: input.stripe_customer_id ?? null,
    }
    state.rows.unshift(row)

    return {
      id: row.id,
      key_prefix: row.key_prefix,
      wallet: row.wallet,
      name: row.name,
      tier: row.tier,
      monthly_limit: row.monthly_limit,
      monthly_used: row.monthly_used,
      usage_reset_at: row.usage_reset_at,
      is_active: row.is_active,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      revoked_at: row.revoked_at,
      stripe_customer_id: row.stripe_customer_id,
    }
  },
  listApiKeys: () =>
    state.rows.map((row) => ({
      id: row.id,
      key_prefix: row.key_prefix,
      wallet: row.wallet,
      name: row.name,
      tier: row.tier,
      monthly_limit: row.monthly_limit,
      monthly_used: row.monthly_used,
      usage_reset_at: row.usage_reset_at,
      is_active: row.is_active,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      revoked_at: row.revoked_at,
      stripe_customer_id: row.stripe_customer_id,
    })),
  revokeApiKey: (id: number) => {
    const row = state.rows.find((entry) => entry.id === id && entry.revoked_at === null)
    if (!row) return false
    row.revoked_at = '2026-03-12T00:00:00.000Z'
    row.is_active = 0
    return true
  },
  resetApiKeyUsage: (id: number, usageResetAt: string) => {
    const row = state.rows.find((entry) => entry.id === id)
    if (!row) return false
    row.monthly_used = 0
    row.usage_reset_at = usageResetAt
    return true
  },
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
    state.rows.length = 0
    state.nextId = 1
  })

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
    expect(typeof body.key).toBe('string')
    expect((body.key as string).startsWith('djd_live_')).toBe(true)
    expect(typeof body.key_prefix).toBe('string')
    expect((body.key_prefix as string).endsWith('...')).toBe(true)
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

  it('lists keys without exposing raw key values or hashes', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    state.rows.push({
      id: 1,
      key_hash: 'hashed-value',
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
      stripe_customer_id: null,
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
    expect(body.keys[0]!).not.toHaveProperty('key')
    expect(body.keys[0]!).not.toHaveProperty('key_hash')
  })

  it('revokes a key by ID', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY
    state.rows.push({
      id: 1,
      key_hash: 'hashed-value',
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
      stripe_customer_id: null,
    })

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
    expect(state.rows[0]!.is_active).toBe(0)
  })

  it('returns 404 when revoking a missing key', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys/999', {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY },
    })

    expect(res.status).toBe(404)
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

  it('resets monthly usage counter for a key', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY
    state.rows.push({
      id: 1,
      key_hash: 'hashed-value',
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
      stripe_customer_id: null,
    })

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
    expect(state.rows[0]!.monthly_used).toBe(0)
  })

  it('returns 404 when resetting a missing key', async () => {
    process.env.ADMIN_KEY = ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: apiKeysRoute } = await import('../../src/routes/apiKeys.js')

    const app = new Hono()
    app.route('/admin/api-keys', apiKeysRoute)

    const res = await app.request('/admin/api-keys/999/reset', {
      method: 'POST',
      headers: { 'x-admin-key': ADMIN_KEY },
    })

    expect(res.status).toBe(404)
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
