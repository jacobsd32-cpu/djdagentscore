import type Stripe from 'stripe'
import { getStripe, isStripeEnabled } from '../billing/stripeClient.js'
import {
  handleSubscriptionCanceled,
  handleSubscriptionUpdate,
  provisionApiKey,
  storePendingKey,
} from '../billing/subscriptionManager.js'
import { BILLING_PLANS } from '../config/plans.js'
import { ErrorCodes } from '../errors.js'
import { log } from '../logger.js'

interface StripeWebhookServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 503
}

interface StripeWebhookServiceSuccess {
  ok: true
  data: {
    received: true
    error?: string
  }
}

export type StripeWebhookServiceResult = StripeWebhookServiceError | StripeWebhookServiceSuccess

function billingDisabledError(message: string): StripeWebhookServiceError {
  return {
    ok: false,
    code: ErrorCodes.BILLING_DISABLED,
    message,
    status: 503,
  }
}

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

  const plan = BILLING_PLANS[planId]
  if (!plan) {
    log.error('stripeWebhook', `Unknown plan in checkout metadata: ${planId} session=${session.id}`)
    return
  }

  const email = session.customer_email ?? session.customer_details?.email ?? null
  const result = provisionApiKey(session.id, session.customer, session.subscription, plan, email)

  if (result.rawKey) {
    storePendingKey(session.id, result.rawKey)
  }
}

async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      await handleCheckoutCompleted(event)
      return
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as { id: string; status: string; current_period_end?: number }
      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null
      handleSubscriptionUpdate(subscription.id, subscription.status, periodEnd)
      return
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as { id: string }
      handleSubscriptionCanceled(subscription.id)
      return
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as { subscription?: string }
      if (invoice.subscription) {
        handleSubscriptionUpdate(invoice.subscription, 'past_due', null)
      }
      return
    }

    default:
      log.info('stripeWebhook', `Unhandled event type: ${event.type}`)
  }
}

export async function handleIncomingStripeWebhook(
  rawBody: string,
  signature: string | undefined,
): Promise<StripeWebhookServiceResult> {
  if (!isStripeEnabled()) {
    return billingDisabledError('Billing is not configured')
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    log.error('stripeWebhook', 'STRIPE_WEBHOOK_SECRET not set')
    return billingDisabledError('Webhook not configured')
  }

  if (!signature) {
    return {
      ok: false,
      code: ErrorCodes.BILLING_WEBHOOK_SIGNATURE,
      message: 'Missing stripe-signature header',
      status: 400,
    }
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret) as Stripe.Event
  } catch (err) {
    log.warn('stripeWebhook', 'Signature verification failed', err)
    return {
      ok: false,
      code: ErrorCodes.BILLING_WEBHOOK_SIGNATURE,
      message: 'Invalid signature',
      status: 400,
    }
  }

  log.info('stripeWebhook', `Event received: ${event.type} (${event.id})`)

  try {
    await processStripeEvent(event)
    return { ok: true, data: { received: true } }
  } catch (err) {
    log.error('stripeWebhook', `Error handling ${event.type}`, err)
    return {
      ok: true,
      data: {
        received: true,
        error: 'Handler failed — see server logs',
      },
    }
  }
}
