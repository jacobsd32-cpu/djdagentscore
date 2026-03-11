/**
 * Webhook Delivery Job
 *
 * queueWebhookEvent() — inserts delivery rows for all matching webhooks
 * processWebhookQueue() — picks pending deliveries, POSTs with HMAC signature
 */
import crypto from 'node:crypto'
import { WEBHOOK_CONFIG } from '../config/constants.js'
import { db } from '../db.js'
import { log } from '../logger.js'
import { isValidWebhookUrl } from '../types.js'

const { MAX_ATTEMPTS, RETRY_DELAYS_MS, MAX_CONSECUTIVE_FAILURES } = WEBHOOK_CONFIG

interface WebhookRow {
  id: number
  url: string
  secret: string
  events: string
  tier: string
  failure_count: number
}

interface DeliveryRow {
  id: number
  webhook_id: number
  event_type: string
  payload: string
  attempt: number
  url: string
  secret: string
}

/**
 * Queue a webhook event for delivery to all matching active webhooks.
 */
export function queueWebhookEvent(eventType: string, payload: Record<string, unknown>): void {
  try {
    const allWebhooks = db.prepare(`
      SELECT id, url, secret, events, tier, failure_count FROM webhooks
      WHERE is_active = 1
    `).all() as WebhookRow[]

    const matching = allWebhooks.filter(w => {
      const events = JSON.parse(w.events) as string[]
      return events.includes(eventType)
    })

    if (matching.length === 0) return

    const insertDelivery = db.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload)
      VALUES (?, ?, ?)
    `)

    const payloadStr = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    })

    const insertMany = db.transaction((hooks: WebhookRow[]) => {
      for (const hook of hooks) {
        insertDelivery.run(hook.id, eventType, payloadStr)
      }
    })

    insertMany(matching)
    log.info('webhooks', `Queued ${matching.length} deliveries for ${eventType}`)
  } catch (err) {
    log.error('webhooks', 'Failed to queue webhook event', err)
  }
}

interface ThresholdWebhookRow {
  id: number
  url: string
  secret: string
  events: string
  tier: string
  failure_count: number
  threshold_score: number
}

/**
 * Check if a score change crosses any webhook's threshold and queue events.
 * Fires when oldScore was above threshold and newScore dropped below (or vice versa).
 */
export function checkScoreThresholds(
  wallet: string,
  oldScore: number | null,
  newScore: number,
  tier: string,
): void {
  if (oldScore === null) return // First score — no comparison possible

  try {
    const hooks = db.prepare(`
      SELECT id, url, secret, events, tier, failure_count, threshold_score FROM webhooks
      WHERE is_active = 1 AND threshold_score IS NOT NULL
    `).all() as ThresholdWebhookRow[]

    const matching = hooks.filter(w => {
      const events = JSON.parse(w.events) as string[]
      if (!events.includes('score.threshold')) return false
      const t = w.threshold_score
      // Crossed down: old >= threshold, new < threshold
      // Crossed up: old < threshold, new >= threshold
      return (oldScore >= t && newScore < t) || (oldScore < t && newScore >= t)
    })

    if (matching.length === 0) return

    const crossed = newScore < oldScore ? 'down' : 'up'
    const payload = JSON.stringify({
      event: 'score.threshold',
      timestamp: new Date().toISOString(),
      data: { wallet, oldScore, newScore, tier, crossed },
    })

    const insertDelivery = db.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event_type, payload)
      VALUES (?, ?, ?)
    `)

    const insertMany = db.transaction((hooks: ThresholdWebhookRow[]) => {
      for (const hook of hooks) {
        insertDelivery.run(hook.id, 'score.threshold', payload)
      }
    })

    insertMany(matching)
    log.info('webhooks', `Queued ${matching.length} score.threshold deliveries for ${wallet} (${oldScore}→${newScore})`)
  } catch (err) {
    log.error('webhooks', 'Failed to check score thresholds', err)
  }
}

/**
 * Process pending webhook deliveries.
 * Called on a 30-second interval by the worker runtime.
 */
export async function processWebhookQueue(): Promise<void> {
  const pending = db.prepare(`
    SELECT wd.id, wd.webhook_id, wd.event_type, wd.payload, wd.attempt,
           w.url, w.secret
    FROM webhook_deliveries wd
    JOIN webhooks w ON w.id = wd.webhook_id
    WHERE wd.delivered_at IS NULL
      AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= datetime('now'))
      AND wd.attempt <= ?
    ORDER BY wd.created_at ASC
    LIMIT 50
  `).all(MAX_ATTEMPTS) as DeliveryRow[]

  if (pending.length === 0) return

  log.info('webhooks', `Processing ${pending.length} pending deliveries`)

  for (const delivery of pending) {
    try {
      // SSRF prevention: validate URL before fetching (H1 fix)
      if (!isValidWebhookUrl(delivery.url)) {
        log.warn('webhooks', `Delivery ${delivery.id} blocked — unsafe URL: ${delivery.url}`)
        handleFailure(delivery, null)
        continue
      }

      const signature = crypto
        .createHmac('sha256', delivery.secret)
        .update(delivery.payload)
        .digest('hex')

      const resp = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DJD-Signature': `sha256=${signature}`,
          'X-DJD-Event': delivery.event_type,
          'X-DJD-Delivery': String(delivery.id),
        },
        body: delivery.payload,
        signal: AbortSignal.timeout(10000),
      })

      if (resp.ok) {
        // Success
        db.prepare(`
          UPDATE webhook_deliveries SET delivered_at = datetime('now'), status_code = ? WHERE id = ?
        `).run(resp.status, delivery.id)
        db.prepare(`
          UPDATE webhooks SET failure_count = 0, last_delivery_at = datetime('now') WHERE id = ?
        `).run(delivery.webhook_id)
      } else {
        handleFailure(delivery, resp.status)
      }
    } catch (err) {
      handleFailure(delivery, null)
      log.error('webhooks', `Delivery ${delivery.id} failed`, err)
    }
  }
}

function handleFailure(delivery: DeliveryRow, statusCode: number | null): void {
  const nextAttempt = delivery.attempt + 1

  if (nextAttempt > MAX_ATTEMPTS) {
    // Final attempt failed — mark delivery as failed
    db.prepare(`
      UPDATE webhook_deliveries SET status_code = ?, attempt = ? WHERE id = ?
    `).run(statusCode, nextAttempt, delivery.id)

    // Increment webhook failure count
    const result = db.prepare(`
      UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ? RETURNING failure_count
    `).get(delivery.webhook_id) as { failure_count: number } | undefined

    // Auto-disable after MAX_CONSECUTIVE_FAILURES
    if (result && result.failure_count >= MAX_CONSECUTIVE_FAILURES) {
      db.prepare(`
        UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ?
      `).run(delivery.webhook_id)
      log.warn('webhooks', `Webhook ${delivery.webhook_id} auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`)
    }
  } else {
    // Schedule retry
    const retryDelay = RETRY_DELAYS_MS[delivery.attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!
    const nextRetry = new Date(Date.now() + retryDelay).toISOString()
    db.prepare(`
      UPDATE webhook_deliveries SET attempt = ?, next_retry_at = ?, status_code = ? WHERE id = ?
    `).run(nextAttempt, nextRetry, statusCode, delivery.id)
  }
}
