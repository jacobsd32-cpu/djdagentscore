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
import { db } from '../db.js'
import { errorResponse } from '../errors.js'
import { adminAuth } from '../middleware/adminAuth.js'
import { makeBadge } from '../utils/badgeGenerator.js'
import { normalizeWallet } from '../utils/walletUtils.js'

// ---------- Types ----------

interface ScoreRow {
  wallet: string
  composite_score: number
  tier: string
  expires_at: string
}

interface RegistrationRow {
  wallet: string
  name: string | null
}

interface CertificationRow {
  id: number
  wallet: string
  tier: string
  score_at_certification: number
  granted_at: string
  expires_at: string
  is_active: number
  tx_hash: string | null
  revoked_at: string | null
  revocation_reason: string | null
}

// ---------- Router ----------

const certification = new Hono()

// ── Public: Check certification status ──────────────────────────────────────

certification.get('/:wallet', (c) => {
  const wallet = normalizeWallet(c.req.param('wallet'))
  if (!wallet) {
    return c.json(errorResponse('invalid_wallet', 'Valid Ethereum wallet address required'), 400)
  }

  const cert = db.prepare(
    `SELECT * FROM certifications
     WHERE wallet = ? AND is_active = 1 AND expires_at > datetime('now')
     LIMIT 1`,
  ).get(wallet) as CertificationRow | undefined

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

  const cert = db.prepare(
    `SELECT * FROM certifications
     WHERE wallet = ? AND is_active = 1 AND expires_at > datetime('now')
     LIMIT 1`,
  ).get(wallet) as CertificationRow | undefined

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
  // Extract payer wallet from x402 header or API key context
  const payerWallet = c.req.header('x-payer-address') ?? c.get('apiKeyWallet' as never) as string | undefined
  const wallet = normalizeWallet(payerWallet)
  if (!wallet) {
    return c.json(errorResponse('invalid_wallet', 'Valid Ethereum wallet address required'), 400)
  }

  // All validation + INSERT in a single transaction to prevent race conditions.
  // Without this, concurrent requests could both pass the "no active cert" check
  // and the second INSERT would throw an unhandled SQLITE_CONSTRAINT error.
  const certifyTxn = db.transaction((w: string) => {
    // 1. Must have a current (non-expired) score
    const scoreRow = db.prepare(
      `SELECT * FROM scores WHERE wallet = ? LIMIT 1`,
    ).get(w) as ScoreRow | undefined

    if (!scoreRow || scoreRow.expires_at <= new Date().toISOString()) {
      return { error: 'cert_requirements_not_met', message: 'Score has expired — request a fresh score first', status: 400 as const }
    }

    // 2. Composite score must be >= 75
    if (scoreRow.composite_score < 75) {
      return { error: 'cert_score_too_low', message: 'Composite score must be >= 75 for certification', status: 400 as const, data: { current_score: scoreRow.composite_score } }
    }

    // 3. Must be a registered agent
    const registration = db.prepare(
      `SELECT * FROM agent_registrations WHERE wallet = ? LIMIT 1`,
    ).get(w) as RegistrationRow | undefined

    if (!registration) {
      return { error: 'cert_not_registered', message: 'Agent must be registered before applying for certification', status: 400 as const }
    }

    // 4. Must not already have an active cert
    const existingCert = db.prepare(
      `SELECT * FROM certifications
       WHERE wallet = ? AND is_active = 1 AND expires_at > datetime('now')
       LIMIT 1`,
    ).get(w) as CertificationRow | undefined

    if (existingCert) {
      return { error: 'cert_already_active', message: 'Wallet already has an active certification', status: 409 as const }
    }

    // All checks passed — grant certification
    const result = db.prepare(
      `INSERT INTO certifications (wallet, tier, score_at_certification, expires_at)
       VALUES (?, ?, ?, datetime('now', '+1 year'))`,
    ).run(w, scoreRow.tier, scoreRow.composite_score)

    const newCert = db.prepare(
      `SELECT * FROM certifications WHERE id = ?`,
    ).get(result.lastInsertRowid) as CertificationRow

    return { cert: newCert }
  })

  try {
    const outcome = certifyTxn(wallet)

    if ('error' in outcome) {
      const err = outcome as { error: string; message: string; status: 400 | 409; data?: Record<string, unknown> }
      return c.json(
        errorResponse(err.error, err.message, err.data),
        err.status,
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
  } catch (err: unknown) {
    // Handle UNIQUE constraint race: if a concurrent request inserted first,
    // treat as a duplicate rather than a 500.
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      return c.json(
        errorResponse('cert_already_active', 'Wallet already has an active certification'),
        409,
      )
    }
    throw err
  }
})

// ── Admin: List all certifications ──────────────────────────────────────────

certification.get('/admin/all', adminAuth, (c) => {
  const certs = db.prepare(
    `SELECT * FROM certifications ORDER BY granted_at DESC`,
  ).all() as CertificationRow[]

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

  const result = db.prepare(
    `UPDATE certifications
     SET is_active = 0, revoked_at = datetime('now'), revocation_reason = ?
     WHERE id = ? AND is_active = 1`,
  ).run(reason, id)

  if (result.changes === 0) {
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
  const total = db.prepare(
    `SELECT COUNT(*) as count FROM certifications`,
  ).get() as { count: number }

  const active = db.prepare(
    `SELECT COUNT(*) as count FROM certifications WHERE is_active = 1 AND expires_at > datetime('now')`,
  ).get() as { count: number }

  const revoked = db.prepare(
    `SELECT COUNT(*) as count FROM certifications WHERE revoked_at IS NOT NULL`,
  ).get() as { count: number }

  const byMonth = db.prepare(
    `SELECT
       strftime('%Y-%m', granted_at) as month,
       COUNT(*) as count,
       SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) as revoked_count,
       SUM(99) as gross_revenue_usd,
       SUM(CASE WHEN revoked_at IS NULL THEN 99 ELSE 0 END) as net_revenue_usd
     FROM certifications
     GROUP BY strftime('%Y-%m', granted_at)
     ORDER BY month DESC`,
  ).all() as Array<{ month: string; count: number; revoked_count: number; gross_revenue_usd: number; net_revenue_usd: number }>

  return c.json({
    total_certifications: total.count,
    active_certifications: active.count,
    revoked_certifications: revoked.count,
    gross_revenue_usd: total.count * 99,
    net_revenue_usd: (total.count - revoked.count) * 99,
    price_per_cert_usd: 99,
    by_month: byMonth,
  })
})

export default certification
