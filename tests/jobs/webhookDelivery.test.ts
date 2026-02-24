import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { testDb } = vi.hoisted(() => {
  const _Database = require('better-sqlite3')
  const testDb = new _Database(':memory:')
  testDb.prepare(`
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
  `).run()

  testDb.prepare(`
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
  `).run()

  return { testDb }
})

vi.mock('../../src/db.js', () => ({
  db: testDb,
}))

vi.mock('../../src/logger.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { queueWebhookEvent, processWebhookQueue } from '../../src/jobs/webhookDelivery.js'

function insertWebhook(overrides: Partial<{
  wallet: string
  url: string
  secret: string
  events: string[]
  tier: string
  is_active: number
}> = {}): number {
  const {
    wallet = '0xabc123',
    url = 'https://example.com/hook',
    secret = 'test-secret-hex',
    events = ['score.updated'],
    tier = 'basic',
    is_active = 1,
  } = overrides

  const result = testDb.prepare(`
    INSERT INTO webhooks (wallet, url, secret, events, tier, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(wallet, url, secret, JSON.stringify(events), tier, is_active)

  return Number(result.lastInsertRowid)
}

describe('queueWebhookEvent', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM webhook_deliveries').run()
    testDb.prepare('DELETE FROM webhooks').run()
    vi.clearAllMocks()
  })

  it('creates delivery rows for matching webhooks', () => {
    const hookId1 = insertWebhook({ events: ['score.updated', 'fraud.reported'] })
    const hookId2 = insertWebhook({ wallet: '0xdef456', events: ['score.updated'] })

    queueWebhookEvent('score.updated', { wallet: '0x111', score: 85 })

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries ORDER BY webhook_id').all() as Array<{
      webhook_id: number
      event_type: string
      payload: string
    }>

    expect(deliveries).toHaveLength(2)
    expect(deliveries[0].webhook_id).toBe(hookId1)
    expect(deliveries[1].webhook_id).toBe(hookId2)
    expect(deliveries[0].event_type).toBe('score.updated')

    // Verify payload structure
    const payload = JSON.parse(deliveries[0].payload)
    expect(payload.event).toBe('score.updated')
    expect(payload.timestamp).toBeDefined()
    expect(payload.data).toEqual({ wallet: '0x111', score: 85 })
  })

  it('creates no delivery rows for non-matching event', () => {
    insertWebhook({ events: ['fraud.reported'] })

    queueWebhookEvent('score.updated', { wallet: '0x111' })

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries').all()
    expect(deliveries).toHaveLength(0)
  })

  it('skips inactive webhooks', () => {
    insertWebhook({ events: ['score.updated'], is_active: 0 })

    queueWebhookEvent('score.updated', { wallet: '0x111' })

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries').all()
    expect(deliveries).toHaveLength(0)
  })

  it('queues only for webhooks subscribed to the specific event', () => {
    insertWebhook({ events: ['score.updated'] })
    insertWebhook({ wallet: '0xdef456', events: ['fraud.reported'] })
    insertWebhook({ wallet: '0xghi789', events: ['score.updated', 'agent.registered'] })

    queueWebhookEvent('fraud.reported', { target: '0x999' })

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries').all() as Array<{ webhook_id: number }>
    expect(deliveries).toHaveLength(1)
  })
})

describe('processWebhookQueue', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM webhook_deliveries').run()
    testDb.prepare('DELETE FROM webhooks').run()
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  afterEach(() => {
    mockFetch.mockReset()
  })

  it('successfully delivers a webhook and marks it delivered', async () => {
    const hookId = insertWebhook({ secret: 'my-secret-key' })

    // Insert a pending delivery
    testDb.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 1)
    `).run(hookId)

    // Mock a successful fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    })

    await processWebhookQueue()

    expect(mockFetch).toHaveBeenCalledOnce()

    // Verify fetch was called with correct headers
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://example.com/hook')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(options.headers['X-DJD-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
    expect(options.headers['X-DJD-Event']).toBe('score.updated')

    // Verify delivery is marked as delivered
    const delivery = testDb.prepare('SELECT * FROM webhook_deliveries WHERE webhook_id = ?').get(hookId) as {
      delivered_at: string | null
      status_code: number
    }
    expect(delivery.delivered_at).toBeTruthy()
    expect(delivery.status_code).toBe(200)

    // Verify webhook failure_count is reset
    const webhook = testDb.prepare('SELECT failure_count, last_delivery_at FROM webhooks WHERE id = ?').get(hookId) as {
      failure_count: number
      last_delivery_at: string | null
    }
    expect(webhook.failure_count).toBe(0)
    expect(webhook.last_delivery_at).toBeTruthy()
  })

  it('handles failed delivery by incrementing attempt and setting next_retry_at', async () => {
    const hookId = insertWebhook()

    testDb.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 1)
    `).run(hookId)

    // Mock a failed fetch
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await processWebhookQueue()

    const delivery = testDb.prepare('SELECT * FROM webhook_deliveries WHERE webhook_id = ?').get(hookId) as {
      attempt: number
      next_retry_at: string | null
      status_code: number | null
      delivered_at: string | null
    }

    // attempt should be incremented to 2 (retry scheduled)
    expect(delivery.attempt).toBe(2)
    expect(delivery.next_retry_at).toBeTruthy()
    expect(delivery.status_code).toBe(500)
    expect(delivery.delivered_at).toBeNull()
  })

  it('handles network error (fetch throws) by scheduling retry', async () => {
    const hookId = insertWebhook()

    testDb.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 1)
    `).run(hookId)

    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    await processWebhookQueue()

    const delivery = testDb.prepare('SELECT * FROM webhook_deliveries WHERE webhook_id = ?').get(hookId) as {
      attempt: number
      next_retry_at: string | null
      delivered_at: string | null
    }

    expect(delivery.attempt).toBe(2)
    expect(delivery.next_retry_at).toBeTruthy()
    expect(delivery.delivered_at).toBeNull()
  })

  it('does nothing when there are no pending deliveries', async () => {
    await processWebhookQueue()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not pick up already-delivered items', async () => {
    const hookId = insertWebhook()

    testDb.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt, delivered_at, status_code)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 1, datetime('now'), 200)
    `).run(hookId)

    await processWebhookQueue()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not pick up items with future next_retry_at', async () => {
    const hookId = insertWebhook()

    // Set next_retry_at far in the future
    testDb.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt, next_retry_at)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 2, datetime('now', '+1 hour'))
    `).run(hookId)

    await processWebhookQueue()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
