import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { testDb } = vi.hoisted(() => {
  const _Database = require('better-sqlite3')
  const testDb = new _Database(':memory:')
  testDb
    .prepare(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet      TEXT NOT NULL,
      url         TEXT NOT NULL,
      secret      TEXT NOT NULL,
      events      TEXT NOT NULL,
      tier        TEXT NOT NULL DEFAULT 'basic',
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_delivery_at TEXT,
      disabled_at TEXT
    )
  `)
    .run()

  testDb
    .prepare(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id  INTEGER NOT NULL REFERENCES webhooks(id),
      event_type  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      status_code INTEGER,
      response_body TEXT,
      attempt     INTEGER NOT NULL DEFAULT 1,
      delivered_at TEXT,
      next_retry_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
    .run()

  return { testDb }
})

vi.mock('../../src/db.js', () => ({
  db: testDb,
  insertWebhook: (input: {
    wallet: string
    url: string
    secret: string
    events: string[]
    tier: string
  }) => {
    const result = testDb
      .prepare(`
        INSERT INTO webhooks (wallet, url, secret, events, tier)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(input.wallet, input.url, input.secret, JSON.stringify(input.events), input.tier)

    return testDb.prepare('SELECT * FROM webhooks WHERE id = ?').get(Number(result.lastInsertRowid))
  },
  listWebhooks: () => testDb.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all(),
  getWebhookById: (id: number) => testDb.prepare('SELECT * FROM webhooks WHERE id = ?').get(id),
  listRecentWebhookDeliveries: (webhookId: number, limit = 20) =>
    testDb
      .prepare(`
        SELECT id, event_type, status_code, attempt, delivered_at, created_at
        FROM webhook_deliveries
        WHERE webhook_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(webhookId, limit),
  deactivateWebhook: (id: number) =>
    testDb
      .prepare(`UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ? AND is_active = 1`)
      .run(id).changes > 0,
  countActiveWebhooksForWallet: (wallet: string) =>
    (testDb.prepare('SELECT COUNT(*) as count FROM webhooks WHERE wallet = ? AND is_active = 1').get(wallet) as {
      count: number
    }).count,
  listWebhooksForWallet: (wallet: string) =>
    testDb.prepare('SELECT * FROM webhooks WHERE wallet = ? ORDER BY created_at DESC').all(wallet),
  deactivateWebhookForWallet: (id: number, wallet: string) =>
    testDb
      .prepare(`UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ? AND wallet = ? AND is_active = 1`)
      .run(id, wallet).changes > 0,
}))

import { Hono } from 'hono'
import { adminWebhooks, publicWebhooks } from '../../src/routes/webhooks.js'

const ADMIN_KEY = 'test-admin-key-12345'
const API_KEY_WALLET = '0xfeedface'

function makeAdminApp() {
  const app = new Hono()
  app.route('/webhooks', adminWebhooks)
  return app
}

function makePublicApp(wallet: string | null = API_KEY_WALLET) {
  const app = new Hono<{ Variables: { apiKeyWallet?: string } }>()
  app.use('*', async (c, next) => {
    if (wallet) c.set('apiKeyWallet', wallet)
    await next()
  })
  app.route('/v1/webhooks', publicWebhooks)
  return app
}

function adminHeaders(extra: Record<string, string> = {}) {
  return {
    'x-admin-key': ADMIN_KEY,
    'Content-Type': 'application/json',
    ...extra,
  }
}

describe('Admin webhook routes', () => {
  const originalKey = process.env.ADMIN_KEY

  beforeEach(() => {
    process.env.ADMIN_KEY = ADMIN_KEY
    testDb.prepare('DELETE FROM webhook_deliveries').run()
    testDb.prepare('DELETE FROM webhooks').run()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalKey !== undefined) {
      process.env.ADMIN_KEY = originalKey
    } else {
      delete process.env.ADMIN_KEY
    }
  })

  it('returns 503 when ADMIN_KEY is not configured', async () => {
    delete process.env.ADMIN_KEY
    const app = makeAdminApp()
    const res = await app.request('/webhooks', {
      headers: { 'x-admin-key': 'anything' },
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('Admin key not configured')
  })

  it('returns 401 when wrong key is provided', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks', {
      headers: { 'x-admin-key': 'wrong-key-wrong' },
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when no key is provided', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks')
    expect(res.status).toBe(401)
  })

  it('creates a webhook and returns id + secret', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: ['score.updated', 'fraud.reported'],
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(typeof body.secret).toBe('string')
    expect(body.secret.length).toBe(64)
    expect(body.wallet).toBe('0xabc123')
    expect(body.url).toBe('https://example.com/hook')
    expect(body.events).toEqual(['score.updated', 'fraud.reported'])
    expect(body.tier).toBe('basic')
    expect(body.message).toContain('secret')
  })

  it('creates a webhook with custom tier', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: ['score.updated'],
        tier: 'premium',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.tier).toBe('premium')
  })

  it('lists webhooks with parsed events array', async () => {
    const app = makeAdminApp()

    await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: ['score.updated', 'agent.registered'],
      }),
    })

    const res = await app.request('/webhooks', {
      headers: adminHeaders(),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(1)
    expect(body.webhooks).toHaveLength(1)
    expect(body.webhooks[0].events).toEqual(['score.updated', 'agent.registered'])
    expect(body.webhooks[0].wallet).toBe('0xabc123')
    expect(body.webhooks[0].is_active).toBe(1)
    expect(body.webhooks[0].secret).toBeUndefined()
  })

  it('returns webhook detail with recent deliveries', async () => {
    const app = makeAdminApp()

    const createRes = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: ['score.updated'],
      }),
    })
    const { id } = await createRes.json()

    testDb
      .prepare(`
        INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status_code, delivered_at)
        VALUES (?, 'score.updated', '{}', 200, datetime('now'))
      `)
      .run(id)

    const res = await app.request(`/webhooks/${id}`, {
      headers: adminHeaders(),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(id)
    expect(body.secret).toHaveLength(64)
    expect(body.events).toEqual(['score.updated'])
    expect(body.recent_deliveries).toHaveLength(1)
    expect(body.recent_deliveries[0].event_type).toBe('score.updated')
    expect(body.recent_deliveries[0].status_code).toBe(200)
  })

  it('returns 404 for nonexistent webhook detail', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks/9999', {
      headers: adminHeaders(),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('webhook_not_found')
  })

  it('deactivates a webhook', async () => {
    const app = makeAdminApp()

    const createRes = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: ['score.updated'],
      }),
    })
    const { id } = await createRes.json()

    const deleteRes = await app.request(`/webhooks/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    expect(deleteRes.status).toBe(200)
    const deleteBody = await deleteRes.json()
    expect(deleteBody.success).toBe(true)

    const row = testDb.prepare('SELECT is_active, disabled_at FROM webhooks WHERE id = ?').get(id) as {
      is_active: number
      disabled_at: string
    }
    expect(row.is_active).toBe(0)
    expect(row.disabled_at).toBeTruthy()
  })

  it('returns 404 when deactivating nonexistent webhook', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks/9999', {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('webhook_not_found')
  })

  it('returns 404 when deactivating already-disabled webhook', async () => {
    const app = makeAdminApp()

    const createRes = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: ['score.updated'],
      }),
    })
    const { id } = await createRes.json()

    await app.request(`/webhooks/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })

    const res = await app.request(`/webhooks/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 for missing required fields', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ wallet: '0xABC123' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('webhook_invalid')
    expect(body.error.message).toContain('required')
  })

  it('returns 400 for invalid URL', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'not-a-valid-url',
        events: ['score.updated'],
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('webhook_url_invalid')
  })

  it('returns 400 for invalid events', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: ['invalid.event'],
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('webhook_invalid')
    expect(body.error.message).toContain('Invalid events')
  })

  it('returns 400 for empty events array', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: [],
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('webhook_invalid')
  })

  it('returns 400 for non-array events', async () => {
    const app = makeAdminApp()
    const res = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: 'score.updated',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('sends a test webhook delivery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    const app = makeAdminApp()
    const createRes = await app.request('/webhooks', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        wallet: '0xABC123',
        url: 'https://example.com/hook',
        events: ['score.updated'],
      }),
    })
    const { id } = await createRes.json()

    const res = await app.request(`/webhooks/${id}/test`, {
      method: 'POST',
      headers: adminHeaders(),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.status_code).toBe(204)
    expect(body.message).toContain('successful')
  })
})

describe('Public webhook routes', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM webhook_deliveries').run()
    testDb.prepare('DELETE FROM webhooks').run()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requires an API key wallet to create a webhook', async () => {
    const app = makePublicApp(null)
    const res = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/public-hook',
        events: ['score.updated'],
      }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('unauthorized')
  })

  it('creates, lists, and deactivates own webhooks without exposing wallet or secret in list responses', async () => {
    const app = makePublicApp()

    const createRes = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/public-hook',
        events: ['score.updated', 'score.expired'],
      }),
    })

    expect(createRes.status).toBe(201)
    const created = await createRes.json()
    expect(created.url).toBe('https://example.com/public-hook')
    expect(created.secret).toHaveLength(64)
    expect(created.events).toEqual(['score.updated', 'score.expired'])

    const listRes = await app.request('/v1/webhooks')
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody.count).toBe(1)
    expect(listBody.webhooks[0].url).toBe('https://example.com/public-hook')
    expect(listBody.webhooks[0].events).toEqual(['score.updated', 'score.expired'])
    expect(listBody.webhooks[0].wallet).toBeUndefined()
    expect(listBody.webhooks[0].secret).toBeUndefined()

    const deleteRes = await app.request(`/v1/webhooks/${created.id}`, {
      method: 'DELETE',
    })
    expect(deleteRes.status).toBe(200)
    expect(await deleteRes.json()).toEqual({ success: true })
  })

  it('enforces the active webhook limit per wallet', async () => {
    const app = makePublicApp()

    for (let index = 0; index < 10; index += 1) {
      const res = await app.request('/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://example.com/hook-${index}`,
          events: ['score.updated'],
        }),
      })
      expect(res.status).toBe(201)
    }

    const limitedRes = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/hook-11',
        events: ['score.updated'],
      }),
    })

    expect(limitedRes.status).toBe(429)
    const body = await limitedRes.json()
    expect(body.error.code).toBe('webhook_limit_exceeded')
  })
})
