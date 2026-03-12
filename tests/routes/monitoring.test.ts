import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const API_KEY_WALLET = '0xfeedfacefeedfacefeedfacefeedfacefeedface'

const { testDb } = vi.hoisted(() => {
  const _Database = require('better-sqlite3')
  const testDb = new _Database(':memory:')

  testDb.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'basic',
      threshold_score INTEGER,
      forensics_min_risk_level TEXT,
      forensics_report_reasons TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_delivery_at TEXT,
      disabled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS monitoring_subscriptions (
      id TEXT PRIMARY KEY,
      subscriber_wallet TEXT NOT NULL,
      target_wallet TEXT NOT NULL,
      webhook_id INTEGER NOT NULL UNIQUE REFERENCES webhooks(id),
      policy_type TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      disabled_at TEXT
    );
  `)

  return { testDb }
})

vi.mock('../../src/db.js', () => ({
  insertWebhook: (input: {
    wallet: string
    url: string
    secret: string
    events: string[]
    tier: string
    thresholdScore?: number | null
    forensicsFilter?: {
      minimum_risk_level?: string
      reasons?: string[]
    } | null
  }) => {
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
          forensics_report_reasons
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.wallet,
        input.url,
        input.secret,
        JSON.stringify(input.events),
        input.tier,
        input.thresholdScore ?? null,
        input.forensicsFilter?.minimum_risk_level ?? null,
        input.forensicsFilter?.reasons ? JSON.stringify(input.forensicsFilter.reasons) : null,
      )

    return testDb.prepare('SELECT * FROM webhooks WHERE id = ?').get(Number(result.lastInsertRowid))
  },
  deactivateWebhook: (id: number) =>
    testDb
      .prepare(`UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ? AND is_active = 1`)
      .run(id).changes > 0,
  countActiveWebhooksForWallet: (wallet: string) =>
    (
      testDb.prepare('SELECT COUNT(*) as count FROM webhooks WHERE wallet = ? AND is_active = 1').get(wallet) as {
        count: number
      }
    ).count,
  deactivateWebhookForWallet: (id: number, wallet: string) =>
    testDb
      .prepare(
        `UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ? AND wallet = ? AND is_active = 1`,
      )
      .run(id, wallet).changes > 0,
  getWebhookById: (id: number) => testDb.prepare('SELECT * FROM webhooks WHERE id = ?').get(id),
  listRecentWebhookDeliveries: () => [],
  listWebhooks: () => testDb.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all(),
  listWebhooksForWallet: (wallet: string) =>
    testDb.prepare('SELECT * FROM webhooks WHERE wallet = ? ORDER BY created_at DESC').all(wallet),
  insertMonitoringSubscription: (input: {
    id: string
    subscriber_wallet: string
    target_wallet: string
    webhook_id: number
    policy_type: string
  }) => {
    testDb
      .prepare(`
        INSERT INTO monitoring_subscriptions (id, subscriber_wallet, target_wallet, webhook_id, policy_type)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(input.id, input.subscriber_wallet, input.target_wallet, input.webhook_id, input.policy_type)
  },
  countActiveMonitoringSubscriptionsBySubscriber: (subscriberWallet: string) =>
    (
      testDb
        .prepare(`
          SELECT COUNT(*) as count
          FROM monitoring_subscriptions ms
          JOIN webhooks w ON w.id = ms.webhook_id
          WHERE ms.subscriber_wallet = ?
            AND ms.is_active = 1
            AND w.is_active = 1
        `)
        .get(subscriberWallet) as { count: number }
    ).count,
  listMonitoringSubscriptionsBySubscriber: (subscriberWallet: string) =>
    testDb
      .prepare(`
        SELECT
          ms.id,
          ms.subscriber_wallet,
          ms.target_wallet,
          ms.webhook_id,
          ms.policy_type,
          ms.is_active,
          ms.created_at,
          ms.disabled_at,
          w.url,
          w.events,
          w.threshold_score,
          w.forensics_min_risk_level,
          w.forensics_report_reasons,
          w.failure_count,
          w.last_delivery_at,
          w.is_active as webhook_is_active,
          w.disabled_at as webhook_disabled_at
        FROM monitoring_subscriptions ms
        JOIN webhooks w ON w.id = ms.webhook_id
        WHERE ms.subscriber_wallet = ?
        ORDER BY ms.created_at DESC
      `)
      .all(subscriberWallet),
  getMonitoringSubscriptionByIdForSubscriber: (id: string, subscriberWallet: string) =>
    testDb
      .prepare(`
        SELECT
          ms.id,
          ms.subscriber_wallet,
          ms.target_wallet,
          ms.webhook_id,
          ms.policy_type,
          ms.is_active,
          ms.created_at,
          ms.disabled_at,
          w.url,
          w.events,
          w.threshold_score,
          w.forensics_min_risk_level,
          w.forensics_report_reasons,
          w.failure_count,
          w.last_delivery_at,
          w.is_active as webhook_is_active,
          w.disabled_at as webhook_disabled_at
        FROM monitoring_subscriptions ms
        JOIN webhooks w ON w.id = ms.webhook_id
        WHERE ms.id = ? AND ms.subscriber_wallet = ?
        LIMIT 1
      `)
      .get(id, subscriberWallet),
  deactivateMonitoringSubscriptionForSubscriber: (id: string, subscriberWallet: string) =>
    testDb
      .prepare(`
        UPDATE monitoring_subscriptions
        SET is_active = 0, disabled_at = datetime('now')
        WHERE id = ? AND subscriber_wallet = ? AND is_active = 1
      `)
      .run(id, subscriberWallet).changes > 0,
}))

import { Hono } from 'hono'
import monitoringRoute from '../../src/routes/monitoring.js'

function makeApp(wallet: string | null = API_KEY_WALLET) {
  const app = new Hono<{ Variables: { apiKeyWallet?: string } }>()
  app.use('*', async (c, next) => {
    if (wallet) c.set('apiKeyWallet', wallet)
    await next()
  })
  app.route('/v1/monitor', monitoringRoute)
  return app
}

describe('monitoring routes', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM monitoring_subscriptions').run()
    testDb.prepare('DELETE FROM webhooks').run()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists monitoring policy presets without requiring an API key', async () => {
    const res = await makeApp(null).request('/v1/monitor/presets')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.presets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policy_type: 'anomaly_monitoring',
          supports_threshold_score: false,
          supports_forensics_filter: false,
        }),
        expect.objectContaining({ policy_type: 'score_monitoring', supports_threshold_score: true }),
        expect.objectContaining({ policy_type: 'forensics_monitoring', supports_forensics_filter: true }),
      ]),
    )
  })

  it('creates and lists a monitoring subscription for another target wallet', async () => {
    const app = makeApp()

    const createRes = await app.request('/v1/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_wallet: '0x1111111111111111111111111111111111111111',
        policy_type: 'forensics_monitoring',
        url: 'https://example.com/alerts',
        forensics_filter: {
          minimum_risk_level: 'elevated',
          reasons: ['payment_fraud'],
        },
      }),
    })

    expect(createRes.status).toBe(201)
    const created = await createRes.json()
    expect(created.target_wallet).toBe('0x1111111111111111111111111111111111111111')
    expect(created.policy_type).toBe('forensics_monitoring')
    expect(created.events).toContain('fraud.reported')
    expect(created.forensics_filter).toEqual({
      minimum_risk_level: 'elevated',
      reasons: ['payment_fraud'],
    })
    expect(created.secret).toHaveLength(64)

    const listRes = await app.request('/v1/monitor')
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody.count).toBe(1)
    expect(listBody.subscriptions[0].target_wallet).toBe('0x1111111111111111111111111111111111111111')
    expect(listBody.subscriptions[0].url).toBe('https://example.com/alerts')
  })

  it('defaults target_wallet to the subscriber wallet for score monitoring', async () => {
    const app = makeApp()

    const res = await app.request('/v1/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy_type: 'score_monitoring',
        url: 'https://example.com/score-alerts',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.target_wallet).toBe(API_KEY_WALLET)
    expect(body.threshold_score).toBe(60)
  })

  it('creates anomaly monitoring subscriptions with anomaly event bundles', async () => {
    const app = makeApp()

    const res = await app.request('/v1/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_wallet: '0x2222222222222222222222222222222222222222',
        policy_type: 'anomaly_monitoring',
        url: 'https://example.com/anomaly-alerts',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.target_wallet).toBe('0x2222222222222222222222222222222222222222')
    expect(body.policy_type).toBe('anomaly_monitoring')
    expect(body.events).toEqual([
      'anomaly.score_drop',
      'anomaly.score_spike',
      'anomaly.balance_freefall',
      'anomaly.sybil_flagged',
    ])
    expect(body.threshold_score).toBeNull()
    expect(body.forensics_filter).toBeNull()
  })

  it('deactivates a monitoring subscription', async () => {
    const app = makeApp()
    const createRes = await app.request('/v1/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy_type: 'score_monitoring',
        url: 'https://example.com/score-alerts',
      }),
    })
    const created = await createRes.json()

    const deleteRes = await app.request(`/v1/monitor/${created.id}`, {
      method: 'DELETE',
    })

    expect(deleteRes.status).toBe(200)
    expect(await deleteRes.json()).toEqual({ success: true })
  })

  it('requires an API key for create and list', async () => {
    const app = makeApp(null)

    const createRes = await app.request('/v1/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy_type: 'score_monitoring',
        url: 'https://example.com/score-alerts',
      }),
    })
    expect(createRes.status).toBe(401)

    const listRes = await app.request('/v1/monitor')
    expect(listRes.status).toBe(401)
  })
})
