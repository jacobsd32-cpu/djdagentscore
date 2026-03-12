/**
 * API Key Authentication Middleware
 * Checks Authorization: Bearer djd_live_... header.
 * If valid + under quota: sets context vars and skips x402/freeTier.
 * If invalid/missing: passes through to downstream middleware.
 */
import type { MiddlewareHandler } from 'hono'
import { db } from '../db.js'
import { errorResponse, ErrorCodes } from '../errors.js'
import { getNextUsageResetAt, hashKey } from '../utils/apiKeyUtils.js'

interface ApiKeyRow {
  id: number
  key_hash: string
  key_prefix: string
  wallet: string
  name: string | null
  tier: string
  monthly_limit: number
  monthly_used: number
  usage_reset_at: string
  is_active: number
  last_used_at: string | null
  revoked_at: string | null
}

const stmtFindKey = db.prepare<[string], ApiKeyRow>(
  'SELECT * FROM api_keys WHERE key_hash = ?'
)
const stmtIncrementUsage = db.prepare<[string, string]>(
  'UPDATE api_keys SET monthly_used = monthly_used + 1, last_used_at = ? WHERE key_hash = ?'
)
const stmtResetUsage = db.prepare<[string, string]>(
  'UPDATE api_keys SET monthly_used = 0, usage_reset_at = ? WHERE key_hash = ?'
)

export const apiKeyAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('authorization')
  if (!authHeader?.startsWith('Bearer djd_live_')) {
    // No API key — fall through to x402/freeTier
    return next()
  }

  const rawKey = authHeader.slice(7) // strip "Bearer "
  const hash = hashKey(rawKey)
  const row = stmtFindKey.get(hash)

  if (!row) {
    // Key looks like a DJD API key but is not in the DB — reject (H3 fix)
    return c.json(errorResponse(ErrorCodes.API_KEY_INVALID, 'Invalid API key'), 401)
  }

  if (row.revoked_at) {
    return c.json(errorResponse(ErrorCodes.API_KEY_REVOKED, 'API key has been revoked'), 401)
  }

  if (!row.is_active) {
    return c.json(errorResponse(ErrorCodes.API_KEY_INVALID, 'API key is inactive'), 401)
  }

  // Check if usage needs monthly reset
  const now = new Date()
  if (new Date(row.usage_reset_at) <= now) {
    const nextReset = getNextUsageResetAt(now)
    stmtResetUsage.run(nextReset, hash)
    row.monthly_used = 0
    row.usage_reset_at = nextReset
  }

  if (row.monthly_used >= row.monthly_limit) {
    return c.json(
      errorResponse(ErrorCodes.API_KEY_EXHAUSTED, 'Monthly API key quota exhausted', {
        limit: row.monthly_limit,
        used: row.monthly_used,
        resetsAt: row.usage_reset_at,
      }),
      429,
    )
  }

  // Valid key with quota remaining — set context, then run handler
  c.set('apiKeyId', row.id)
  c.set('apiKeyWallet', row.wallet)
  c.set('apiKeyTier', row.tier)

  await next()

  // Only increment usage on successful responses (H7 fix)
  if (c.res.status >= 200 && c.res.status < 300) {
    stmtIncrementUsage.run(now.toISOString(), hash)
    row.monthly_used += 1
  }

  // Rate limit headers — always set for API key requests
  c.header('X-RateLimit-Limit', String(row.monthly_limit))
  c.header('X-RateLimit-Remaining', String(Math.max(0, row.monthly_limit - row.monthly_used)))
  c.header('X-RateLimit-Reset', row.usage_reset_at)
}
