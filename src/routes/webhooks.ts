import crypto from 'node:crypto'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { db } from '../db.js'
import { errorResponse } from '../errors.js'
import type { AppEnv } from '../types/hono-env.js'
import { isValidWebhookUrl } from '../types.js'

/** Helper to read API key wallet from the context (set by apiKeyAuth middleware on the parent app). */
function getApiKeyWallet(c: Context): string | null {
  return (c as Context<AppEnv>).get('apiKeyWallet') ?? null
}

const VALID_EVENTS = ['score.updated', 'score.expired', 'fraud.reported', 'agent.registered', 'score.threshold']
const MAX_WEBHOOKS_PER_WALLET = 10

// ---------- Admin routes ----------
const adminWebhooks = new Hono()

adminWebhooks.use('*', async (c, next) => {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) return c.json({ error: 'Admin key not configured' }, 503)
  const key = c.req.header('x-admin-key')
  if (!key || key.length !== adminKey.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(adminKey))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

// POST / — Create webhook
adminWebhooks.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.wallet || !body?.url || !body?.events) {
    return c.json(errorResponse('webhook_invalid', 'wallet, url, and events[] are required'), 400)
  }

  // Validate URL — must be HTTPS and not target internal networks (H1 SSRF fix)
  if (!isValidWebhookUrl(body.url)) {
    return c.json(
      errorResponse('webhook_url_invalid', 'Invalid webhook URL: must be HTTPS and not target internal networks'),
      400,
    )
  }

  // Validate events
  const events = body.events as string[]
  if (!Array.isArray(events) || events.length === 0 || !events.every((e: string) => VALID_EVENTS.includes(e))) {
    return c.json(errorResponse('webhook_invalid', `Invalid events. Valid: ${VALID_EVENTS.join(', ')}`), 400)
  }

  const secret = crypto.randomBytes(32).toString('hex')
  const tier = body.tier ?? 'basic'

  const result = db
    .prepare(`
    INSERT INTO webhooks (wallet, url, secret, events, tier)
    VALUES (?, ?, ?, ?, ?)
  `)
    .run(body.wallet.toLowerCase(), body.url, secret, JSON.stringify(events), tier)

  return c.json(
    {
      id: result.lastInsertRowid,
      wallet: body.wallet.toLowerCase(),
      url: body.url,
      secret,
      events,
      tier,
      message: 'Store the secret securely — used to verify webhook signatures.',
    },
    201,
  )
})

// GET / — List all webhooks
adminWebhooks.get('/', (c) => {
  const webhooks = db
    .prepare(`
    SELECT id, wallet, url, events, tier, is_active, created_at, failure_count, last_delivery_at, disabled_at
    FROM webhooks ORDER BY created_at DESC
  `)
    .all()

  return c.json({
    webhooks: (webhooks as Record<string, unknown>[]).map((w) => ({ ...w, events: JSON.parse(w.events as string) })),
    count: webhooks.length,
  })
})

// GET /:id — Webhook detail + recent deliveries
adminWebhooks.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!webhook) return c.json(errorResponse('webhook_not_found', 'Webhook not found'), 404)

  const deliveries = db
    .prepare(`
    SELECT id, event_type, status_code, attempt, delivered_at, created_at
    FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT 20
  `)
    .all(id)

  return c.json({
    ...webhook,
    events: JSON.parse(webhook.events as string),
    recent_deliveries: deliveries,
  })
})

// DELETE /:id — Deactivate webhook
adminWebhooks.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  const result = db
    .prepare(`UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ? AND is_active = 1`)
    .run(id)
  if (result.changes === 0)
    return c.json(errorResponse('webhook_not_found', 'Webhook not found or already disabled'), 404)
  return c.json({ success: true, message: 'Webhook deactivated' })
})

// POST /:id/test — Send test event
adminWebhooks.post('/:id/test', async (c) => {
  const id = Number(c.req.param('id'))
  const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!webhook) return c.json(errorResponse('webhook_not_found', 'Webhook not found'), 404)

  // SSRF prevention on test delivery too (H1 fix)
  if (!isValidWebhookUrl(webhook.url as string)) {
    return c.json(
      errorResponse('webhook_url_invalid', 'Webhook URL is unsafe — must be HTTPS and not target internal networks'),
      400,
    )
  }

  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test webhook delivery from DJD Agent Score' },
  }

  try {
    const body = JSON.stringify(testPayload)
    const signature = crypto
      .createHmac('sha256', webhook.secret as string)
      .update(body)
      .digest('hex')

    const resp = await fetch(webhook.url as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DJD-Signature': `sha256=${signature}`,
        'X-DJD-Event': 'test',
      },
      body,
      signal: AbortSignal.timeout(10000),
    })

    return c.json({
      success: resp.ok,
      status_code: resp.status,
      message: resp.ok ? 'Test delivery successful' : 'Test delivery failed',
    })
  } catch (err) {
    return c.json({
      success: false,
      status_code: null,
      message: `Test delivery failed: ${(err as Error).message}`,
    })
  }
})

// ---------- Public self-service routes ----------
const publicWebhooks = new Hono()

// POST / — Register webhook (authenticated by API key)
publicWebhooks.post('/', async (c) => {
  const wallet = getApiKeyWallet(c)
  if (!wallet) {
    return c.json(errorResponse('unauthorized', 'API key required to register webhooks'), 401)
  }

  // Check webhook limit
  const row = db
    .prepare('SELECT COUNT(*) as count FROM webhooks WHERE wallet = ? AND is_active = 1')
    .get(wallet.toLowerCase()) as { count: number } | undefined
  const count = row?.count ?? 0
  if (count >= MAX_WEBHOOKS_PER_WALLET) {
    return c.json(
      errorResponse('webhook_limit_exceeded', `Maximum ${MAX_WEBHOOKS_PER_WALLET} active webhooks per wallet`),
      429,
    )
  }

  const body = await c.req.json().catch(() => null)
  if (!body?.url || !body?.events) {
    return c.json(errorResponse('webhook_invalid', 'url and events[] are required'), 400)
  }

  // Validate URL — must be HTTPS and not target internal networks (H1 SSRF fix)
  if (!isValidWebhookUrl(body.url)) {
    return c.json(
      errorResponse('webhook_url_invalid', 'Invalid webhook URL: must be HTTPS and not target internal networks'),
      400,
    )
  }

  const events = body.events as string[]
  if (!Array.isArray(events) || events.length === 0 || !events.every((e: string) => VALID_EVENTS.includes(e))) {
    return c.json(errorResponse('webhook_invalid', `Invalid events. Valid: ${VALID_EVENTS.join(', ')}`), 400)
  }

  const secret = crypto.randomBytes(32).toString('hex')

  const result = db
    .prepare(`
    INSERT INTO webhooks (wallet, url, secret, events, tier)
    VALUES (?, ?, ?, ?, 'basic')
  `)
    .run(wallet.toLowerCase(), body.url, secret, JSON.stringify(events))

  return c.json(
    {
      id: result.lastInsertRowid,
      url: body.url,
      secret,
      events,
      message: 'Store the secret securely — used to verify webhook signatures.',
    },
    201,
  )
})

// GET / — List own webhooks
publicWebhooks.get('/', (c) => {
  const wallet = getApiKeyWallet(c)
  if (!wallet) return c.json(errorResponse('unauthorized', 'API key required'), 401)

  const webhooks = db
    .prepare(`
    SELECT id, url, events, tier, is_active, created_at, failure_count, last_delivery_at
    FROM webhooks WHERE wallet = ? ORDER BY created_at DESC
  `)
    .all(wallet.toLowerCase())

  return c.json({
    webhooks: (webhooks as Record<string, unknown>[]).map((w) => ({ ...w, events: JSON.parse(w.events as string) })),
    count: webhooks.length,
  })
})

// DELETE /:id — Deactivate own webhook
publicWebhooks.delete('/:id', (c) => {
  const wallet = getApiKeyWallet(c)
  if (!wallet) return c.json(errorResponse('unauthorized', 'API key required'), 401)

  const id = Number(c.req.param('id'))
  const result = db
    .prepare(
      `UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ? AND wallet = ? AND is_active = 1`,
    )
    .run(id, wallet.toLowerCase())
  if (result.changes === 0)
    return c.json(errorResponse('webhook_not_found', 'Webhook not found or already disabled'), 404)
  return c.json({ success: true })
})

export { adminWebhooks, publicWebhooks }
