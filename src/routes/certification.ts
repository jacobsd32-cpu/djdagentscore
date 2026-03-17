/**
 * Certified Agent Badge — Phase B monetization
 *
 * Public (free):
 *   GET  /tiers        — inspect the certification tier catalog
 *   GET  /readiness    — check whether a wallet can apply for certification
 *   GET  /review       — inspect the latest certification review request for a wallet
 *   POST /review       — submit a certification review request
 *   GET  /directory     — browse active certifications
 *   GET  /:wallet       — check certification status
 *   GET  /badge/:wallet — SVG badge (green if certified, gray if not)
 *
 * Paid (tier-priced x402):
 *   POST /apply                  — legacy transactional apply path
 *   POST /apply/operational      — Tier 1 / Operational
 *   POST /apply/transactional    — Tier 2 / Transactional
 *   POST /apply/autonomous       — Tier 3 / Autonomous
 *
 * Admin (X-ADMIN-KEY):
 *   GET  /admin/all          — list all certifications
 *   POST /admin/:id/revoke   — revoke a certification
 *   GET  /admin/revenue      — revenue summary
 */
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../types/hono-env.js'
import { errorResponse } from '../errors.js'
import { adminAuth } from '../middleware/adminAuth.js'
import {
  applyForCertificationByPayer,
  getCertificationRevenue,
  getCertificationBadgeView,
  getCertificationDirectoryView,
  getCertificationTierCatalogView,
  issueCertificationFromReviewRequest,
  getCertificationReadinessView,
  getCertificationReviewStatusView,
  getCertificationStatusView,
  listCertificationReviewRequestViews,
  reviewCertificationRequestDecision,
  listCertificationRecords,
  submitCertificationReviewRequest,
  revokeCertificationRecord,
} from '../services/certificationService.js'
import { getPayerWallet } from '../utils/paymentUtils.js'

// ---------- Router ----------

const certification = new Hono<AppEnv>()

// ── Public: Certified directory ─────────────────────────────────────────────

certification.get('/tiers', (c) => {
  const outcome = getCertificationTierCatalogView()
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

certification.get('/readiness', (c) => {
  const outcome = getCertificationReadinessView(c.req.query('wallet'), c.req.query('tier'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

certification.get('/directory', (c) => {
  const outcome = getCertificationDirectoryView({
    limit: c.req.query('limit'),
    tier: c.req.query('tier'),
    search: c.req.query('search'),
    sort: c.req.query('sort'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

certification.get('/review', (c) => {
  const outcome = getCertificationReviewStatusView(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

certification.post('/review', async (c) => {
  const body = await c.req.json<{ wallet?: string; note?: string; tier?: string }>().catch(() => null)
  const outcome = submitCertificationReviewRequest({
    wallet: body?.wallet,
    note: body?.note,
    tier: body?.tier,
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 201)
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

// ── Paid: Apply for certification ───────────────────────────────────────────
// Certification requires tier-specific x402 payment. API key auth alone is NOT
// sufficient — the key bypasses per-request x402 fees but certification is a
// one-time purchase that must be paid via x402.

function ensureCertificationPayment(c: Context<AppEnv>) {
  const paymentHeader = c.req.header('X-PAYMENT') ?? c.req.header('x-payment')
  if (c.get('apiKeyId') && !paymentHeader) {
    return c.json(
      errorResponse(
        'payment_required',
        'Certification requires tier-priced x402 payment. API key authentication alone is not sufficient for this endpoint.',
      ),
      402,
    )
  }

  return null
}

function handleCertificationApply(c: Context<AppEnv>, tier?: string) {
  const paymentError = ensureCertificationPayment(c)
  if (paymentError) {
    return paymentError
  }

  const outcome = applyForCertificationByPayer(getPayerWallet(c), tier)
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 201)
}

certification.post('/apply', (c) => {
  return handleCertificationApply(c)
})

certification.post('/apply/operational', (c) => {
  return handleCertificationApply(c, 'operational')
})

certification.post('/apply/transactional', (c) => {
  return handleCertificationApply(c, 'transactional')
})

certification.post('/apply/autonomous', (c) => {
  return handleCertificationApply(c, 'autonomous')
})

// Keep a flexible path for internal callers and future route expansion.
certification.post('/apply/:tier', (c) => {
  return handleCertificationApply(c, c.req.param('tier'))
})

// ── Public: Check certification status ──────────────────────────────────────

certification.get('/:wallet', (c) => {
  const outcome = getCertificationStatusView(c.req.param('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// ── Admin: List all certifications ──────────────────────────────────────────

certification.get('/admin/all', adminAuth, (c) => {
  const certifications = listCertificationRecords()
  return c.json({ certifications, count: certifications.length })
})

certification.get('/admin/reviews', adminAuth, (c) => {
  const outcome = listCertificationReviewRequestViews({
    status: c.req.query('status'),
    search: c.req.query('search'),
    limit: c.req.query('limit'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

certification.post('/admin/reviews/:id/decision', adminAuth, async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req
    .json<{ decision?: string; note?: string; reviewed_by?: string }>()
    .catch(() => null)

  const outcome = reviewCertificationRequestDecision({
    id,
    decision: body?.decision,
    note: body?.note,
    reviewedBy: body?.reviewed_by,
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

certification.post('/admin/reviews/:id/issue', adminAuth, (c) => {
  const outcome = issueCertificationFromReviewRequest({
    id: Number(c.req.param('id')),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 201)
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
