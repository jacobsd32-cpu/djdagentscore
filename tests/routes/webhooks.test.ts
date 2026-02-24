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
}))

import { Hono } from 'hono'
import { adminWebhooks } from '../../src/routes/webhooks.js'

const ADMIN_KEY = 'test-admin-key-12345'

function makeApp() {
  const app = new Hono()
  app.route('/webhooks', adminWebhooks)
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
    // Clear tables before each test
    testDb.prepare('DELETE FROM webhook_deliveries').run()
    testDb.prepare('DELETE FROM webhooks').run()
  })

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ADMIN_KEY = originalKey
    } else {
      delete process.env.ADMIN_KEY
    }
  })

  // ---------- Auth ----------

  it('returns 503 when ADMIN_KEY is not configured', async () => {
    delete process.env.ADMIN_KEY
    const app = makeApp()
    const res = await app.request('/webhooks', {
      headers: { 'x-admin-key': 'anything' },
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('Admin key not configured')
  })

  it('returns 401 when wrong key is provided', async () => {
    const app = makeApp()
    const res = await app.request('/webhooks', {
      headers: { 'x-admin-key': 'wrong-key-wrong' },
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when no key is provided', async () => {
    const app = makeApp()
    const res = await app.request('/webhooks')
    expect(res.status).toBe(401)
  })

  // ---------- POST / — Create webhook ----------

  it('creates a webhook and returns id + secret', async () => {
    const app = makeApp()
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
    expect(body.secret.length).toBe(64) // 32 bytes hex
    expect(body.wallet).toBe('0xabc123') // lowercased
    expect(body.url).toBe('https://example.com/hook')
    expect(body.events).toEqual(['score.updated', 'fraud.reported'])
    expect(body.tier).toBe('basic')
    expect(body.message).toContain('secret')
  })

  it('creates a webhook with custom tier', async () => {
    const app = makeApp()
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

  // ---------- GET / — List webhooks ----------

  it('lists webhooks with parsed events array', async () => {
    const app = makeApp()

    // Create a webhook first
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
  })

  // ---------- GET /:id — Webhook detail ----------

  it('returns webhook detail with recent deliveries', async () => {
    const app = makeApp()

    // Create a webhook
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

    // Insert a test delivery
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
    expect(body.events).toEqual(['score.updated'])
    expect(body.recent_deliveries).toHaveLength(1)
    expect(body.recent_deliveries[0].event_type).toBe('score.updated')
    expect(body.recent_deliveries[0].status_code).toBe(200)
  })

  it('returns 404 for nonexistent webhook detail', async () => {
    const app = makeApp()
    const res = await app.request('/webhooks/9999', {
      headers: adminHeaders(),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('webhook_not_found')
  })

  // ---------- DELETE /:id — Deactivate webhook ----------

  it('deactivates a webhook', async () => {
    const app = makeApp()

    // Create a webhook
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

    // Deactivate
    const delRes = await app.request(`/webhooks/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    expect(delRes.status).toBe(200)
    const delBody = await delRes.json()
    expect(delBody.success).toBe(true)

    // Verify not listed as active
    const row = testDb.prepare('SELECT is_active, disabled_at FROM webhooks WHERE id = ?').get(id) as {
      is_active: number
      disabled_at: string
    }
    expect(row.is_active).toBe(0)
    expect(row.disabled_at).toBeTruthy()
  })

  it('returns 404 when deactivating nonexistent webhook', async () => {
    const app = makeApp()
    const res = await app.request('/webhooks/9999', {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('webhook_not_found')
  })

  it('returns 404 when deactivating already-disabled webhook', async () => {
    const app = makeApp()

    // Create and deactivate
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

    // Try again
    const res = await app.request(`/webhooks/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    expect(res.status).toBe(404)
  })

  // ---------- Validation errors ----------

  it('returns 400 for missing required fields', async () => {
    const app = makeApp()
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
    const app = makeApp()
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
    const app = makeApp()
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
    const app = makeApp()
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
    const app = makeApp()
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
})
