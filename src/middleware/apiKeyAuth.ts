/**
 * API Key Authentication Middleware
 * Checks Authorization: Bearer djd_live_... header.
 * If valid + under quota: sets context vars and skips x402/freeTier.
 * If invalid/missing: passes through to downstream middleware.
 */
import type { MiddlewareHandler } from 'hono'
import { errorResponse, ErrorCodes } from '../errors.js'
import { authenticateApiKeyHeader, recordSuccessfulApiKeyUsage } from '../services/apiKeyAuthService.js'

export const apiKeyAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = authenticateApiKeyHeader(c.req.header('authorization'))
  if (auth.kind === 'skip') {
    // No API key — fall through to x402/freeTier
    return next()
  }

  if (auth.kind === 'error') {
    return c.json(errorResponse(auth.code, auth.message, auth.details), auth.status)
  }

  // Valid key with quota remaining — set context, then run handler
  c.set('apiKeyId', auth.row.id)
  c.set('apiKeyWallet', auth.row.wallet)
  c.set('apiKeyTier', auth.row.tier)

  await next()

  // Only increment usage on successful responses (H7 fix)
  if (c.res.status >= 200 && c.res.status < 300) {
    recordSuccessfulApiKeyUsage(auth)
  }

  // Rate limit headers — always set for API key requests
  c.header('X-RateLimit-Limit', String(auth.row.monthly_limit))
  c.header('X-RateLimit-Remaining', String(Math.max(0, auth.row.monthly_limit - auth.row.monthly_used)))
  c.header('X-RateLimit-Reset', auth.row.usage_reset_at)
}
