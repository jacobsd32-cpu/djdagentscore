import crypto from 'node:crypto'

import { WEBHOOK_CONFIG } from '../config/constants.js'
import {
  disableWebhook,
  insertWebhookDeliveries,
  listActiveWebhooks,
  listPendingWebhookDeliveries,
  listThresholdWebhooks,
  markWebhookDeliveryFinalFailure,
  markWebhookDeliverySuccess,
  scheduleWebhookDeliveryRetry,
} from '../db.js'
import type { PendingWebhookDeliveryRow } from '../db.js'
import { log } from '../logger.js'
import { isValidWebhookUrl } from '../types.js'

const { MAX_ATTEMPTS, RETRY_DELAYS_MS, MAX_CONSECUTIVE_FAILURES } = WEBHOOK_CONFIG

function parseSubscribedEvents(events: string): string[] {
  return JSON.parse(events) as string[]
}

function buildWebhookPayload(eventType: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  })
}

export function queueWebhookEvent(eventType: string, payload: Record<string, unknown>): void {
  try {
    const matching = listActiveWebhooks().filter((webhook) => parseSubscribedEvents(webhook.events).includes(eventType))
    if (matching.length === 0) return

    insertWebhookDeliveries(matching, eventType, buildWebhookPayload(eventType, payload))
    log.info('webhooks', `Queued ${matching.length} deliveries for ${eventType}`)
  } catch (err) {
    log.error('webhooks', 'Failed to queue webhook event', err)
  }
}

export function checkScoreThresholds(
  wallet: string,
  oldScore: number | null,
  newScore: number,
  tier: string,
): void {
  if (oldScore === null) return

  try {
    const matching = listThresholdWebhooks().filter((webhook) => {
      const events = parseSubscribedEvents(webhook.events)
      if (!events.includes('score.threshold')) return false

      const threshold = webhook.threshold_score
      return (oldScore >= threshold && newScore < threshold) || (oldScore < threshold && newScore >= threshold)
    })

    if (matching.length === 0) return

    const crossed = newScore < oldScore ? 'down' : 'up'
    insertWebhookDeliveries(
      matching,
      'score.threshold',
      buildWebhookPayload('score.threshold', { wallet, oldScore, newScore, tier, crossed }),
    )

    log.info('webhooks', `Queued ${matching.length} score.threshold deliveries for ${wallet} (${oldScore}→${newScore})`)
  } catch (err) {
    log.error('webhooks', 'Failed to check score thresholds', err)
  }
}

export async function processWebhookQueue(): Promise<void> {
  const pending = listPendingWebhookDeliveries(MAX_ATTEMPTS)
  if (pending.length === 0) return

  log.info('webhooks', `Processing ${pending.length} pending deliveries`)

  for (const delivery of pending) {
    try {
      if (!isValidWebhookUrl(delivery.url)) {
        log.warn('webhooks', `Delivery ${delivery.id} blocked — unsafe URL: ${delivery.url}`)
        handleFailure(delivery, null)
        continue
      }

      const signature = crypto.createHmac('sha256', delivery.secret).update(delivery.payload).digest('hex')
      const response = await fetch(delivery.url, {
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

      if (response.ok) {
        markWebhookDeliverySuccess(delivery.id, delivery.webhook_id, response.status)
      } else {
        handleFailure(delivery, response.status)
      }
    } catch (err) {
      handleFailure(delivery, null)
      log.error('webhooks', `Delivery ${delivery.id} failed`, err)
    }
  }
}

function handleFailure(delivery: PendingWebhookDeliveryRow, statusCode: number | null): void {
  const nextAttempt = delivery.attempt + 1

  if (nextAttempt > MAX_ATTEMPTS) {
    const failureCount = markWebhookDeliveryFinalFailure(delivery.id, nextAttempt, delivery.webhook_id, statusCode)

    if (failureCount !== null && failureCount >= MAX_CONSECUTIVE_FAILURES) {
      disableWebhook(delivery.webhook_id)
      log.warn('webhooks', `Webhook ${delivery.webhook_id} auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`)
    }
    return
  }

  const retryDelay = RETRY_DELAYS_MS[delivery.attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!
  const nextRetryAt = new Date(Date.now() + retryDelay).toISOString()
  scheduleWebhookDeliveryRetry(delivery.id, nextAttempt, nextRetryAt, statusCode)
}
