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
import { errorResponse } from '../errors.js'
import { adminAuth } from '../middleware/adminAuth.js'
import {
  applyForCertification,
  getCertificationRevenue,
  getCertificationStatus,
  listCertificationRecords,
  revokeCertificationRecord,
} from '../services/certificationService.js'
import { makeBadge } from '../utils/badgeGenerator.js'
import { getPayerWallet } from '../utils/paymentUtils.js'
import { normalizeWallet } from '../utils/walletUtils.js'

// ---------- Router ----------

const certification = new Hono()

// ── Public: Check certification status ──────────────────────────────────────

certification.get('/:wallet', (c) => {
  const wallet = normalizeWallet(c.req.param('wallet'))
  if (!wallet) {
    return c.json(errorResponse('invalid_wallet', 'Valid Ethereum wallet address required'), 400)
  }

  const cert = getCertificationStatus(wallet)
  if (!cert) {
    return c.json(errorResponse('cert_not_found', 'No active certification found for this wallet'), 404)
  }

  return c.json({
    wallet: cert.wallet,
    tier: cert.tier,
    score_at_certification: cert.score_at_certification,
    granted_at: cert.granted_at,
    expires_at: cert.expires_at,
    is_valid: true,
  })
})

// ── Public: SVG badge ───────────────────────────────────────────────────────

certification.get('/badge/:wallet', (c) => {
  const wallet = normalizeWallet(c.req.param('wallet'))
  if (!wallet) {
    return c.text('Invalid wallet address', 400)
  }

  const cert = getCertificationStatus(wallet)
  const certified = !!cert
  const label = 'djd certified'
  const value = cert ? `✓ Score ${cert.score_at_certification}` : 'not certified'
  const color = certified ? '#16a34a' : '#6b7280'
  const svg = makeBadge(label, value, color)

  c.header('Content-Type', 'image/svg+xml')
  c.header('Cache-Control', 'public, max-age=3600')
  c.header('X-Content-Type-Options', 'nosniff')
  return c.body(svg)
})

// ── Paid: Apply for certification ($99 USDC) ───────────────────────────────

certification.post('/apply', (c) => {
  // Extract payer wallet using the shared utility (handles both x402 and API key auth)
  const wallet = normalizeWallet(getPayerWallet(c))
  if (!wallet) {
    return c.json(errorResponse('invalid_wallet', 'Valid Ethereum wallet address required'), 400)
  }

  const outcome = applyForCertification(wallet)
  if (!outcome.ok) {
    return c.json(
      errorResponse(outcome.code, outcome.message, outcome.details),
      outcome.status,
    )
  }

  const newCert = outcome.cert
  return c.json({
    id: newCert.id,
    wallet: newCert.wallet,
    tier: newCert.tier,
    score_at_certification: newCert.score_at_certification,
    granted_at: newCert.granted_at,
    expires_at: newCert.expires_at,
    is_active: true,
    message: 'Certification granted for 1 year',
  }, 201)
})

// ── Admin: List all certifications ──────────────────────────────────────────

certification.get('/admin/all', adminAuth, (c) => {
  const certs = listCertificationRecords()

  return c.json({
    certifications: certs.map((cert) => ({
      id: cert.id,
      wallet: cert.wallet,
      tier: cert.tier,
      score_at_certification: cert.score_at_certification,
      granted_at: cert.granted_at,
      expires_at: cert.expires_at,
      is_active: cert.is_active === 1,
      revoked_at: cert.revoked_at,
      revocation_reason: cert.revocation_reason,
    })),
    count: certs.length,
  })
})

// ── Admin: Revoke a certification ───────────────────────────────────────────

certification.post('/admin/:id/revoke', adminAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json(errorResponse('invalid_request', 'Invalid certification ID'), 400)
  }

  let reason = 'Administrative revocation'
  try {
    const body = await c.req.json<{ reason?: string }>()
    if (body.reason) reason = body.reason
  } catch {
    // No body or invalid JSON — use default reason
  }

  if (!revokeCertificationRecord(id, reason)) {
    return c.json(errorResponse('cert_not_found', 'Certification not found or already revoked'), 404)
  }

  return c.json({
    success: true,
    message: 'Certification revoked',
    id,
    reason,
  })
})

// ── Admin: Revenue summary ──────────────────────────────────────────────────

certification.get('/admin/revenue', adminAuth, (c) => {
  return c.json(getCertificationRevenue())
})

export default certification
