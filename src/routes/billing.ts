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

import { Hono } from 'hono'
import { errorResponse } from '../errors.js'
import {
  createBillingCheckout,
  createBillingPortalLink,
  listBillingPlans,
  renderBillingSuccessPage,
} from '../services/billingService.js'

const billing = new Hono()

// ── GET /billing/plans ───────────────────────────────────────────────
// Public plan listing (no Stripe required — shows plans even in dev).

billing.get('/plans', (c) => {
  return c.json(listBillingPlans())
})

// ── POST /billing/checkout ───────────────────────────────────────────
// Create a Stripe Checkout session and return the hosted payment URL.

billing.post('/checkout', async (c) => {
  const outcome = await createBillingCheckout(async () => await c.req.json<{ plan?: string; email?: string }>())
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json(outcome.data)
})

// ── GET /billing/success ─────────────────────────────────────────────
// Success landing page after Stripe Checkout. Displays the provisioned
// API key exactly once (consumed from the pending key store).

billing.get('/success', (c) => {
  const outcome = renderBillingSuccessPage(c.req.query('session_id'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.html(outcome.data.html)
})

// ── GET /billing/portal ──────────────────────────────────────────────
// Creates a Stripe Customer Portal session for self-service management
// (cancel, change plan, update payment method).

billing.get('/portal', async (c) => {
  const outcome = await createBillingPortalLink(c.req.query('customer_id'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.redirect(outcome.data.url)
})

export default billing
