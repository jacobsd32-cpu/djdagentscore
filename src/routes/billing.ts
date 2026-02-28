/**
 * Billing Routes
 *
 * Self-service Stripe billing for human developers:
 *   POST /billing/checkout  → create Stripe Checkout session
 *   GET  /billing/success   → display provisioned API key
 *   GET  /billing/portal    → redirect to Stripe Customer Portal
 *   GET  /billing/plans     → list available plans
 *
 * These routes live in the "free zone" (before x402) so developers
 * can access them without paying per-request.
 */

import type { Context } from 'hono'
import { Hono } from 'hono'
import { isStripeEnabled } from '../billing/stripeClient.js'
import {
  consumePendingKey,
  createCheckoutSession,
  createPortalSession,
  getSubscriptionBySessionId,
} from '../billing/subscriptionManager.js'
import { BILLING_PLANS } from '../config/plans.js'
import { ErrorCodes, errorResponse } from '../errors.js'
import { log } from '../logger.js'
import { successPageHtml } from '../templates/billingSuccess.js'

const billing = new Hono()

// ── Guard ────────────────────────────────────────────────────────────
// All billing routes require Stripe to be configured.

function requireStripe(c: Context): Response | null {
  if (!isStripeEnabled()) {
    return c.json(errorResponse(ErrorCodes.BILLING_DISABLED, 'Billing is not configured on this instance'), 503)
  }
  return null
}

// ── GET /billing/plans ───────────────────────────────────────────────
// Public plan listing (no Stripe required — shows plans even in dev).

billing.get('/plans', (c) => {
  const plans = Object.values(BILLING_PLANS).map((p) => ({
    id: p.id,
    name: p.name,
    monthlyPrice: p.monthlyPrice,
    monthlyLimit: p.monthlyLimit,
  }))
  return c.json({ plans })
})

// ── POST /billing/checkout ───────────────────────────────────────────
// Create a Stripe Checkout session and return the hosted payment URL.

billing.post('/checkout', async (c) => {
  const guard = requireStripe(c)
  if (guard) return guard

  let body: { plan?: string; email?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const planId = body.plan
  if (!planId || !BILLING_PLANS[planId]) {
    return c.json(
      errorResponse(ErrorCodes.BILLING_INVALID_PLAN, `Invalid plan. Choose: ${Object.keys(BILLING_PLANS).join(', ')}`),
      400,
    )
  }

  try {
    const result = await createCheckoutSession(planId, body.email)
    return c.json({ url: result.url, sessionId: result.sessionId })
  } catch (err) {
    log.error('billing', 'Failed to create checkout session', { planId, error: err })
    return c.json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create checkout session'), 500)
  }
})

// ── GET /billing/success ─────────────────────────────────────────────
// Success landing page after Stripe Checkout. Displays the provisioned
// API key exactly once (consumed from the pending key store).

billing.get('/success', (c) => {
  const guard = requireStripe(c)
  if (guard) return guard

  const sessionId = c.req.query('session_id')
  if (!sessionId) {
    return c.html(successPageHtml({ error: 'Missing session_id parameter.' }))
  }

  // Look up the subscription to get plan info
  const sub = getSubscriptionBySessionId(sessionId)

  // Try to consume the one-time raw key
  const rawKey = consumePendingKey(sessionId)

  if (!sub) {
    // Webhook hasn't fired yet — this can happen if user arrives before webhook
    return c.html(
      successPageHtml({
        error: 'Your API key is being provisioned. Please refresh this page in a few seconds.',
      }),
    )
  }

  const plan = BILLING_PLANS[sub.plan]

  if (rawKey) {
    // First visit — show the key
    return c.html(
      successPageHtml({
        apiKey: rawKey,
        planName: plan?.name ?? sub.plan,
        monthlyLimit: plan?.monthlyLimit ?? 0,
      }),
    )
  }

  // Key already consumed (page refreshed) or expired
  return c.html(
    successPageHtml({
      alreadyConsumed: true,
      planName: plan?.name ?? sub.plan,
    }),
  )
})

// ── GET /billing/portal ──────────────────────────────────────────────
// Creates a Stripe Customer Portal session for self-service management
// (cancel, change plan, update payment method).

billing.get('/portal', async (c) => {
  const guard = requireStripe(c)
  if (guard) return guard

  const customerId = c.req.query('customer_id')
  if (!customerId) {
    return c.json(errorResponse(ErrorCodes.BILLING_SESSION_NOT_FOUND, 'Missing customer_id parameter'), 400)
  }

  try {
    const url = await createPortalSession(customerId)
    return c.redirect(url)
  } catch (err) {
    log.error('billing', 'Failed to create portal session', { customerId, error: err })
    return c.json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create portal session'), 500)
  }
})

export default billing
