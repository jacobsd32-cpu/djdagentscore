/**
 * Developer Portal Routes
 *
 * Self-service usage dashboard for API key holders.
 *   GET  /portal          → renders the portal page
 *   POST /portal/api/usage → returns usage stats for a hashed API key
 *
 * Authentication: the developer enters their full key in the browser,
 * which SHA-256 hashes it client-side before sending. Matches the
 * existing key_hash column in the api_keys table.
 */

import { Hono } from 'hono'
import { db, getApiKeyAnalytics } from '../db.js'
import { BILLING_PLANS } from '../config/plans.js'
import { errorResponse, ErrorCodes } from '../errors.js'
import { portalPageHtml } from '../templates/portal.js'
import type { PortalData } from '../templates/portal.js'

const portal = new Hono()

interface ApiKeyRow {
  id: number
  key_prefix: string
  wallet: string
  tier: string
  monthly_used: number
  monthly_limit: number
  usage_reset_at: string
  last_used_at: string | null
  stripe_customer_id: string | null
  is_active: number
  revoked_at: string | null
}

const stmtFindByHash = db.prepare<[string], ApiKeyRow>(
  'SELECT id, key_prefix, wallet, tier, monthly_used, monthly_limit, usage_reset_at, last_used_at, stripe_customer_id, is_active, revoked_at FROM api_keys WHERE key_hash = ?',
)

// ── GET /portal ─────────────────────────────────────────────────────
portal.get('/', (c) => {
  return c.html(portalPageHtml())
})

// ── POST /portal/api/usage ──────────────────────────────────────────
portal.post('/api/usage', async (c) => {
  let body: { keyHash?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const { keyHash } = body
  if (!keyHash || typeof keyHash !== 'string' || keyHash.length !== 64) {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid key hash'), 400)
  }

  const row = stmtFindByHash.get(keyHash)
  if (!row) {
    return c.json(errorResponse(ErrorCodes.API_KEY_INVALID, 'API key not found'), 404)
  }

  if (!row.is_active || row.revoked_at) {
    return c.json(errorResponse(ErrorCodes.API_KEY_REVOKED, 'API key is inactive or revoked'), 401)
  }

  const plan = BILLING_PLANS[row.tier]

  const data: PortalData = {
    keyPrefix: row.key_prefix,
    planName: plan?.name ?? row.tier,
    tier: row.tier,
    monthlyUsed: row.monthly_used,
    monthlyLimit: row.monthly_limit,
    usageResetAt: row.usage_reset_at,
    stripeCustomerId: row.stripe_customer_id,
    lastUsedAt: row.last_used_at,
  }

  return c.json(data)
})

// ── POST /portal/api/analytics ───────────────────────────────────────
portal.post('/api/analytics', async (c) => {
  let body: { keyHash?: string; days?: number }
  try {
    body = await c.req.json()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const { keyHash, days = 30 } = body
  if (!keyHash || typeof keyHash !== 'string' || keyHash.length !== 64) {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid key hash'), 400)
  }

  const row = stmtFindByHash.get(keyHash)
  if (!row) {
    return c.json(errorResponse(ErrorCodes.API_KEY_INVALID, 'API key not found'), 404)
  }

  if (!row.is_active || row.revoked_at) {
    return c.json(errorResponse(ErrorCodes.API_KEY_REVOKED, 'API key is inactive or revoked'), 401)
  }

  const clampedDays = Math.min(Math.max(1, days), 90)
  const analytics = getApiKeyAnalytics(row.wallet, clampedDays)
  return c.json(analytics)
})

export default portal
