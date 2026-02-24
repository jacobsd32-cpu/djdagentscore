/**
 * API Key Authentication Middleware
 * Checks Authorization: Bearer djd_live_... header.
 * If valid + under quota: sets context vars and skips x402/freeTier.
 * If invalid/missing: passes through to downstream middleware.
 */
import crypto from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { db } from '../db.js'
import { errorResponse, ErrorCodes } from '../errors.js'

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

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
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
    // Unknown key — fall through (might be some other Bearer token)
    return next()
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
    const nextReset = new Date(now)
    nextReset.setMonth(nextReset.getMonth() + 1)
    nextReset.setDate(1)
    nextReset.setHours(0, 0, 0, 0)
    stmtResetUsage.run(nextReset.toISOString(), hash)
    row.monthly_used = 0
    row.usage_reset_at = nextReset.toISOString()
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

  // Valid key with quota remaining — increment and set context
  stmtIncrementUsage.run(now.toISOString(), hash)

  c.set('apiKeyId', row.id)
  c.set('apiKeyWallet', row.wallet)
  c.set('apiKeyTier', row.tier)

  await next()
}
