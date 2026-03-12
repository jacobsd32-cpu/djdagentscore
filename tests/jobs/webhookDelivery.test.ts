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
      threshold_score INTEGER,
      forensics_min_risk_level TEXT,
      forensics_report_reasons TEXT,
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
  listActiveWebhooks: () =>
    testDb
      .prepare(
        'SELECT id, wallet, url, secret, events, tier, failure_count, forensics_min_risk_level, forensics_report_reasons FROM webhooks WHERE is_active = 1',
      )
      .all(),
  listThresholdWebhooks: () =>
    testDb
      .prepare(`
        SELECT id, wallet, url, secret, events, tier, failure_count, threshold_score, forensics_min_risk_level, forensics_report_reasons
        FROM webhooks
        WHERE is_active = 1 AND threshold_score IS NOT NULL
      `)
      .all(),
  insertWebhookDeliveries: (webhooks: Array<{ id: number }>, eventType: string, payload: string) => {
    const stmt = testDb.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload)
      VALUES (?, ?, ?)
    `)
    const run = testDb.transaction((rows: Array<{ id: number }>) => {
      for (const webhook of rows) {
        stmt.run(webhook.id, eventType, payload)
      }
    })
    run(webhooks)
  },
  listPendingWebhookDeliveries: (maxAttempts: number) =>
    testDb
      .prepare(`
        SELECT wd.id, wd.webhook_id, wd.event_type, wd.payload, wd.attempt,
               w.url, w.secret
        FROM webhook_deliveries wd
        JOIN webhooks w ON w.id = wd.webhook_id
        WHERE wd.delivered_at IS NULL
          AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= datetime('now'))
          AND wd.attempt <= ?
        ORDER BY wd.created_at ASC
        LIMIT 50
      `)
      .all(maxAttempts),
  markWebhookDeliverySuccess: (deliveryId: number, webhookId: number, statusCode: number) => {
    testDb
      .prepare("UPDATE webhook_deliveries SET delivered_at = datetime('now'), status_code = ? WHERE id = ?")
      .run(statusCode, deliveryId)
    testDb
      .prepare("UPDATE webhooks SET failure_count = 0, last_delivery_at = datetime('now') WHERE id = ?")
      .run(webhookId)
  },
  markWebhookDeliveryFinalFailure: (
    deliveryId: number,
    nextAttempt: number,
    webhookId: number,
    statusCode: number | null,
  ) => {
    testDb
      .prepare('UPDATE webhook_deliveries SET status_code = ?, attempt = ? WHERE id = ?')
      .run(statusCode, nextAttempt, deliveryId)
    testDb.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').run(webhookId)
    const row = testDb.prepare('SELECT failure_count FROM webhooks WHERE id = ?').get(webhookId) as {
      failure_count: number
    }
    return row.failure_count
  },
  disableWebhook: (id: number) => {
    testDb.prepare("UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ?").run(id)
  },
  scheduleWebhookDeliveryRetry: (
    deliveryId: number,
    nextAttempt: number,
    nextRetryAt: string,
    statusCode: number | null,
  ) => {
    testDb
      .prepare('UPDATE webhook_deliveries SET attempt = ?, next_retry_at = ?, status_code = ? WHERE id = ?')
      .run(nextAttempt, nextRetryAt, statusCode, deliveryId)
  },
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

import { checkScoreThresholds, processWebhookQueue, queueWebhookEvent } from '../../src/jobs/webhookDelivery.js'

function insertWebhook(
  overrides: Partial<{
    wallet: string
    url: string
    secret: string
    events: string[]
    tier: string
    threshold_score: number | null
    forensics_min_risk_level: string | null
    forensics_report_reasons: string | null
    is_active: number
  }> = {},
): number {
  const {
    wallet = '0xabc123',
    url = 'https://example.com/hook',
    secret = 'test-secret-hex',
    events = ['score.updated'],
    tier = 'basic',
    threshold_score = null,
    forensics_min_risk_level = null,
    forensics_report_reasons = null,
    is_active = 1,
  } = overrides

  const result = testDb
    .prepare(`
    INSERT INTO webhooks (
      wallet,
      url,
      secret,
      events,
      tier,
      threshold_score,
      forensics_min_risk_level,
      forensics_report_reasons,
      is_active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      wallet,
      url,
      secret,
      JSON.stringify(events),
      tier,
      threshold_score,
      forensics_min_risk_level,
      forensics_report_reasons,
      is_active,
    )

  return Number(result.lastInsertRowid)
}

describe('queueWebhookEvent', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM webhook_deliveries').run()
    testDb.prepare('DELETE FROM webhooks').run()
    vi.clearAllMocks()
  })

  it('creates delivery rows for matching webhooks', () => {
    const hookId1 = insertWebhook({ wallet: '0x111', events: ['score.updated', 'fraud.reported'] })
    const hookId2 = insertWebhook({ wallet: '0x111', url: 'https://example.com/hook-2', events: ['score.updated'] })

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
    insertWebhook({ wallet: '0x111', events: ['fraud.reported'] })

    queueWebhookEvent('score.updated', { wallet: '0x111' })

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries').all()
    expect(deliveries).toHaveLength(0)
  })

  it('skips inactive webhooks', () => {
    insertWebhook({ wallet: '0x111', events: ['score.updated'], is_active: 0 })

    queueWebhookEvent('score.updated', { wallet: '0x111' })

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries').all()
    expect(deliveries).toHaveLength(0)
  })

  it('queues only for webhooks subscribed to the specific event', () => {
    insertWebhook({ wallet: '0x111', events: ['score.updated'] })
    insertWebhook({ wallet: '0x999', events: ['fraud.reported'] })
    insertWebhook({ wallet: '0xghi789', events: ['score.updated', 'agent.registered'] })

    queueWebhookEvent('fraud.reported', { target: '0x999' })

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries').all() as Array<{ webhook_id: number }>
    expect(deliveries).toHaveLength(1)
  })

  it('queues the new forensics monitoring events for subscribed webhooks', () => {
    insertWebhook({ wallet: '0x111', events: ['forensics.risk.changed'] })

    queueWebhookEvent('forensics.risk.changed', {
      wallet: '0x111',
      previousRiskLevel: 'watch',
      currentRiskLevel: 'elevated',
    })

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries').all() as Array<{
      event_type: string
      payload: string
    }>
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].event_type).toBe('forensics.risk.changed')
    expect(JSON.parse(deliveries[0].payload).data.currentRiskLevel).toBe('elevated')
  })

  it('queues anomaly monitoring events for subscribed wallets', () => {
    insertWebhook({ wallet: '0x111', events: ['anomaly.score_drop'] })

    queueWebhookEvent('anomaly.score_drop', {
      wallet: '0x111',
      anomalyType: 'score_drop',
      currentScore: 42,
      previousScore: 63,
      scoreDelta: -21,
    })

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries').all() as Array<{
      event_type: string
      payload: string
    }>
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].event_type).toBe('anomaly.score_drop')
    expect(JSON.parse(deliveries[0].payload).data.currentScore).toBe(42)
  })

  it('only queues deliveries for the subscribed wallet subject', () => {
    insertWebhook({ wallet: '0xabc123', events: ['score.updated'] })
    insertWebhook({ wallet: '0xdef456', events: ['score.updated'] })

    queueWebhookEvent('score.updated', { wallet: '0xdef456', score: 72 })

    const deliveries = testDb.prepare('SELECT webhook_id FROM webhook_deliveries').all() as Array<{
      webhook_id: number
    }>
    expect(deliveries).toHaveLength(1)
  })

  it('applies forensics risk and reason filters before queueing deliveries', () => {
    insertWebhook({
      wallet: '0xabc123',
      events: ['fraud.reported'],
      forensics_min_risk_level: 'elevated',
      forensics_report_reasons: JSON.stringify(['payment_fraud']),
    })
    insertWebhook({
      wallet: '0xabc123',
      events: ['fraud.reported'],
      forensics_min_risk_level: 'critical',
      forensics_report_reasons: JSON.stringify(['payment_fraud']),
    })
    insertWebhook({
      wallet: '0xabc123',
      events: ['fraud.reported'],
      forensics_min_risk_level: 'watch',
      forensics_report_reasons: JSON.stringify(['impersonation']),
    })

    queueWebhookEvent('fraud.reported', {
      target: '0xabc123',
      reportReason: 'payment_fraud',
      currentRiskLevel: 'elevated',
    })

    const deliveries = testDb.prepare('SELECT webhook_id FROM webhook_deliveries').all() as Array<{
      webhook_id: number
    }>
    expect(deliveries).toHaveLength(1)
  })
})

describe('checkScoreThresholds', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM webhook_deliveries').run()
    testDb.prepare('DELETE FROM webhooks').run()
    vi.clearAllMocks()
  })

  it('queues a threshold delivery when a wallet crosses its configured score threshold', () => {
    insertWebhook({
      wallet: '0xabc123',
      events: ['score.threshold'],
      threshold_score: 60,
    })

    checkScoreThresholds('0xabc123', 67, 58, 'Watch')

    const deliveries = testDb.prepare('SELECT event_type, payload FROM webhook_deliveries').all() as Array<{
      event_type: string
      payload: string
    }>

    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].event_type).toBe('score.threshold')
    expect(JSON.parse(deliveries[0].payload).data).toEqual({
      wallet: '0xabc123',
      oldScore: 67,
      newScore: 58,
      tier: 'Watch',
      crossed: 'down',
    })
  })

  it('ignores threshold subscriptions for other wallets or when the threshold is not crossed', () => {
    insertWebhook({
      wallet: '0xabc123',
      events: ['score.threshold'],
      threshold_score: 60,
    })
    insertWebhook({
      wallet: '0xdef456',
      events: ['score.threshold'],
      threshold_score: 50,
    })

    checkScoreThresholds('0xabc123', 67, 61, 'Established')

    const deliveries = testDb.prepare('SELECT * FROM webhook_deliveries').all()
    expect(deliveries).toHaveLength(0)
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
    testDb
      .prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 1)
    `)
      .run(hookId)

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

    testDb
      .prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 1)
    `)
      .run(hookId)

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

    testDb
      .prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 1)
    `)
      .run(hookId)

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

    testDb
      .prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt, delivered_at, status_code)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 1, datetime('now'), 200)
    `)
      .run(hookId)

    await processWebhookQueue()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not pick up items with future next_retry_at', async () => {
    const hookId = insertWebhook()

    // Set next_retry_at far in the future
    testDb
      .prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload, attempt, next_retry_at)
      VALUES (?, 'score.updated', '{"event":"score.updated","data":{}}', 2, datetime('now', '+1 hour'))
    `)
      .run(hookId)

    await processWebhookQueue()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
