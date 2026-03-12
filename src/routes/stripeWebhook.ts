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
import { errorResponse } from '../errors.js'
import { handleIncomingStripeWebhook } from '../services/stripeWebhookService.js'

const stripeWebhook = new Hono()

stripeWebhook.post('/', async (c) => {
  const outcome = await handleIncomingStripeWebhook(
    await c.req.text(),
    c.req.header('stripe-signature'),
  )
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json(outcome.data)
})

export default stripeWebhook
