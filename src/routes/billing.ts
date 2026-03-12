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
import { ErrorCodes, errorResponse } from '../errors.js'
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js'
import {
  createBillingCheckout,
  createBillingPortalLink,
  listBillingPlans,
  renderBillingSuccessPage,
} from '../services/billingService.js'
import type { AppEnv } from '../types/hono-env.js'

const billing = new Hono<AppEnv>()

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
// Requires API key authentication to prevent unauthorized access to
// billing management (customer_id alone is not a secret).

billing.get('/portal', apiKeyAuthMiddleware, async (c) => {
  if (!c.get('apiKeyId')) {
    return c.json(
      errorResponse(
        ErrorCodes.BILLING_SESSION_NOT_FOUND,
        'API key authentication required. Include your API key in the Authorization header.',
      ),
      401,
    )
  }

  const outcome = await createBillingPortalLink(c.req.query('customer_id'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  if (c.req.header('accept')?.includes('application/json')) {
    return c.json(outcome.data)
  }

  return c.redirect(outcome.data.url)
})

export default billing
