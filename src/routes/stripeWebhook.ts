/**
 * Stripe Webhook Handler
 *
 * IMPORTANT: This route must be mounted BEFORE bodyLimit middleware because
 * Stripe signature verification requires the raw request body. If the body
 * is parsed/limited first, the signature won't match.
 *
 * Events handled:
 * - checkout.session.completed → provision API key
 * - customer.subscription.updated → sync status
 * - customer.subscription.deleted → deactivate key
 * - invoice.payment_failed → mark past_due
 */

import { Hono } from 'hono'
import type Stripe from 'stripe'
import { getStripe, isStripeEnabled } from '../billing/stripeClient.js'
import {
  handleSubscriptionCanceled,
  handleSubscriptionUpdate,
  provisionApiKey,
  storePendingKey,
} from '../billing/subscriptionManager.js'
import { ErrorCodes, errorResponse } from '../errors.js'
import { log } from '../logger.js'

const stripeWebhook = new Hono()

stripeWebhook.post('/', async (c) => {
  if (!isStripeEnabled()) {
    return c.json(errorResponse(ErrorCodes.BILLING_DISABLED, 'Billing is not configured'), 503)
  }

  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    log.error('stripeWebhook', 'STRIPE_WEBHOOK_SECRET not set')
    return c.json(errorResponse(ErrorCodes.BILLING_DISABLED, 'Webhook not configured'), 503)
  }

  // Get raw body for signature verification
  const rawBody = await c.req.text()
  const sig = c.req.header('stripe-signature')

  if (!sig) {
    return c.json(errorResponse(ErrorCodes.BILLING_WEBHOOK_SIGNATURE, 'Missing stripe-signature header'), 400)
  }

  let event: Stripe.Event

  try {
    // constructEvent is synchronous in the Stripe Node SDK
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret) as Stripe.Event
  } catch (err) {
    log.warn('stripeWebhook', 'Signature verification failed', err)
    return c.json(errorResponse(ErrorCodes.BILLING_WEBHOOK_SIGNATURE, 'Invalid signature'), 400)
  }

  log.info('stripeWebhook', `Event received: ${event.type} (${event.id})`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event)
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as { id: string; status: string; current_period_end?: number }
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
        handleSubscriptionUpdate(sub.id, sub.status, periodEnd)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as { id: string }
        handleSubscriptionCanceled(sub.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as { subscription?: string }
        if (invoice.subscription) {
          handleSubscriptionUpdate(invoice.subscription as string, 'past_due', null)
        }
        break
      }

      default:
        log.info('stripeWebhook', `Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    log.error('stripeWebhook', `Error handling ${event.type}`, err)
    // Return 200 anyway so Stripe doesn't retry — we log the error for investigation
    return c.json({ received: true, error: 'Handler failed — see server logs' })
  }

  return c.json({ received: true })
})

// ── Event Handlers ──────────────────────────────────────────────────

async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as {
    id: string
    customer: string
    subscription: string | null
    customer_email?: string | null
    customer_details?: { email?: string | null }
    metadata?: Record<string, string>
  }

  const planId = session.metadata?.plan
  if (!planId) {
    log.error('stripeWebhook', `Checkout session missing plan metadata: ${session.id}`)
    return
  }

  // Resolve the plan — we need to look up by ID from our config
  const { BILLING_PLANS } = await import('../config/plans.js')
  const plan = BILLING_PLANS[planId]
  if (!plan) {
    log.error('stripeWebhook', `Unknown plan in checkout metadata: ${planId} session=${session.id}`)
    return
  }

  const email = session.customer_email ?? session.customer_details?.email ?? null

  const result = provisionApiKey(session.id, session.customer, session.subscription, plan, email)

  // Store the raw key temporarily so the success page can display it
  if (result.rawKey) {
    storePendingKey(session.id, result.rawKey)
  }
}

export default stripeWebhook
