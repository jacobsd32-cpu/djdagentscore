/**
 * Certified Agent Badge — Phase B monetization
 *
 * Public (free):
 *   GET  /:wallet       — check certification status
 *   GET  /badge/:wallet — SVG badge (green if certified, gray if not)
 *
 * Paid ($99 USDC via x402):
 *   POST /apply         — apply for certification
 *
 * Admin (X-ADMIN-KEY):
 *   GET  /admin/all          — list all certifications
 *   POST /admin/:id/revoke   — revoke a certification
 *   GET  /admin/revenue      — revenue summary
 */
import { Hono } from 'hono'
import type { AppEnv } from '../types/hono-env.js'
import { errorResponse } from '../errors.js'
import { adminAuth } from '../middleware/adminAuth.js'
import {
  applyForCertificationByPayer,
  getCertificationRevenue,
  getCertificationBadgeView,
  getCertificationStatusView,
  listCertificationRecords,
  revokeCertificationRecord,
} from '../services/certificationService.js'
import { getPayerWallet } from '../utils/paymentUtils.js'

// ---------- Router ----------

const certification = new Hono<AppEnv>()

// ── Public: Check certification status ──────────────────────────────────────

certification.get('/:wallet', (c) => {
  const outcome = getCertificationStatusView(c.req.param('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// ── Public: SVG badge ───────────────────────────────────────────────────────

certification.get('/badge/:wallet', (c) => {
  const outcome = getCertificationBadgeView(c.req.param('wallet'))
  if (!outcome.ok) {
    return c.text(outcome.message, outcome.status)
  }

  c.header('Content-Type', 'image/svg+xml')
  c.header('Cache-Control', 'public, max-age=3600')
  c.header('X-Content-Type-Options', 'nosniff')
  return c.body(outcome.data.svg)
})

// ── Paid: Apply for certification ($99 USDC) ───────────────────────────────
// Certification requires x402 payment of $99 USDC. API key auth alone is NOT
// sufficient — the key bypasses per-request x402 fees but certification is a
// one-time purchase that must be paid via x402.

certification.post('/apply', (c) => {
  const paymentHeader = c.req.header('X-PAYMENT') ?? c.req.header('x-payment')
  if (c.get('apiKeyId') && !paymentHeader) {
    return c.json(
      errorResponse(
        'payment_required',
        'Certification requires $99 USDC payment via x402. API key authentication alone is not sufficient for this endpoint.',
      ),
      402,
    )
  }

  const outcome = applyForCertificationByPayer(getPayerWallet(c))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 201)
})

// ── Admin: List all certifications ──────────────────────────────────────────

certification.get('/admin/all', adminAuth, (c) => {
  const certifications = listCertificationRecords()
  return c.json({ certifications, count: certifications.length })
})

// ── Admin: Revoke a certification ───────────────────────────────────────────

certification.post('/admin/:id/revoke', adminAuth, async (c) => {
  const id = Number(c.req.param('id'))

  let reason = 'Administrative revocation'
  try {
    const body = await c.req.json<{ reason?: string }>()
    if (body.reason) reason = body.reason
  } catch {
    // No body or invalid JSON — use default reason
  }

  const outcome = revokeCertificationRecord(id, reason)
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// ── Admin: Revenue summary ──────────────────────────────────────────────────

certification.get('/admin/revenue', adminAuth, (c) => {
  return c.json(getCertificationRevenue())
})

export default certification
