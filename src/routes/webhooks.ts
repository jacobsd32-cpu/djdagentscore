import type { Context } from 'hono'
import { Hono } from 'hono'

import { errorResponse } from '../errors.js'
import { adminAuth } from '../middleware/adminAuth.js'
import {
  createAdminWebhook,
  createWalletWebhook,
  deactivateAdminWebhook,
  deactivateWalletWebhookRecord,
  getWebhookDetail,
  listAdminWebhooks,
  listWalletWebhookRecords,
  listWebhookPresets,
  sendTestWebhook,
} from '../services/webhookService.js'
import type { AppEnv } from '../types/hono-env.js'

/** Helper to read API key wallet from the context (set by apiKeyAuth middleware on the parent app). */
function getApiKeyWallet(c: Context): string | null {
  return (c as Context<AppEnv>).get('apiKeyWallet') ?? null
}

function webhookResponseFields(webhook: { threshold_score?: number | null; forensics_filter?: unknown }) {
  return {
    ...(webhook.threshold_score !== null && webhook.threshold_score !== undefined
      ? { threshold_score: webhook.threshold_score }
      : {}),
    ...(webhook.forensics_filter ? { forensics_filter: webhook.forensics_filter } : {}),
  }
}

// ---------- Admin routes ----------
const adminWebhooks = new Hono()

adminWebhooks.use('*', adminAuth)

// POST / — Create webhook
adminWebhooks.post('/', async (c) => {
  const outcome = createAdminWebhook(await c.req.json().catch(() => null))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  const { webhook, message } = outcome
  return c.json(
    {
      id: webhook.id,
      wallet: webhook.wallet,
      url: webhook.url,
      secret: webhook.secret,
      events: webhook.events,
      tier: webhook.tier,
      ...webhookResponseFields(webhook),
      ...(outcome.presetsApplied.length > 0 ? { presets_applied: outcome.presetsApplied } : {}),
      message,
    },
    201,
  )
})

// GET / — List all webhooks
adminWebhooks.get('/', (c) => {
  const webhooks = listAdminWebhooks()

  return c.json({
    webhooks: webhooks.map((webhook) => ({
      id: webhook.id,
      wallet: webhook.wallet,
      url: webhook.url,
      events: webhook.events,
      tier: webhook.tier,
      is_active: webhook.is_active,
      created_at: webhook.created_at,
      failure_count: webhook.failure_count,
      last_delivery_at: webhook.last_delivery_at,
      disabled_at: webhook.disabled_at,
      ...webhookResponseFields(webhook),
    })),
    count: webhooks.length,
  })
})

// GET /:id — Webhook detail + recent deliveries
adminWebhooks.get('/:id', (c) => {
  const webhook = getWebhookDetail(Number(c.req.param('id')))
  if (!webhook) return c.json(errorResponse('webhook_not_found', 'Webhook not found'), 404)

  return c.json(webhook)
})

// DELETE /:id — Deactivate webhook
adminWebhooks.delete('/:id', (c) => {
  if (!deactivateAdminWebhook(Number(c.req.param('id')))) {
    return c.json(errorResponse('webhook_not_found', 'Webhook not found or already disabled'), 404)
  }

  return c.json({ success: true, message: 'Webhook deactivated' })
})

// POST /:id/test — Send test event
adminWebhooks.post('/:id/test', async (c) => {
  const outcome = await sendTestWebhook(Number(c.req.param('id')))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json({
    success: outcome.success,
    status_code: outcome.statusCode,
    message: outcome.message,
  })
})

// ---------- Public self-service routes ----------
const publicWebhooks = new Hono()

publicWebhooks.get('/presets', (c) => {
  const presets = listWebhookPresets()
  return c.json({ presets, count: presets.length })
})

// POST / — Register webhook (authenticated by API key)
publicWebhooks.post('/', async (c) => {
  const wallet = getApiKeyWallet(c)
  if (!wallet) {
    return c.json(errorResponse('unauthorized', 'API key required to register webhooks'), 401)
  }

  const outcome = createWalletWebhook(wallet, await c.req.json().catch(() => null))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  const { webhook, message } = outcome
  return c.json(
    {
      id: webhook.id,
      url: webhook.url,
      secret: webhook.secret,
      events: webhook.events,
      ...webhookResponseFields(webhook),
      ...(outcome.presetsApplied.length > 0 ? { presets_applied: outcome.presetsApplied } : {}),
      message,
    },
    201,
  )
})

// GET / — List own webhooks
publicWebhooks.get('/', (c) => {
  const wallet = getApiKeyWallet(c)
  if (!wallet) return c.json(errorResponse('unauthorized', 'API key required'), 401)

  const webhooks = listWalletWebhookRecords(wallet)

  return c.json({
    webhooks: webhooks.map((webhook) => ({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      tier: webhook.tier,
      is_active: webhook.is_active,
      created_at: webhook.created_at,
      failure_count: webhook.failure_count,
      last_delivery_at: webhook.last_delivery_at,
      ...webhookResponseFields(webhook),
    })),
    count: webhooks.length,
  })
})

// DELETE /:id — Deactivate own webhook
publicWebhooks.delete('/:id', (c) => {
  const wallet = getApiKeyWallet(c)
  if (!wallet) return c.json(errorResponse('unauthorized', 'API key required'), 401)

  if (!deactivateWalletWebhookRecord(Number(c.req.param('id')), wallet)) {
    return c.json(errorResponse('webhook_not_found', 'Webhook not found or already disabled'), 404)
  }

  return c.json({ success: true })
})

export { adminWebhooks, publicWebhooks }
