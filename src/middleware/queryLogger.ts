/**
 * Query Logger Middleware
 * Logs every request to query_log after the response is generated.
 * Must be registered BEFORE the x402 and freeTier middleware so its
 * post-next code sees context variables set by downstream handlers.
 */
import type { MiddlewareHandler } from 'hono'
import { insertQueryLog } from '../db.js'
import { log } from '../logger.js'
import { incHttpRequest } from '../metrics.js'

const ENDPOINT_PRICES: Record<string, number> = {
  '/v1/score/full': 0.10,
  '/v1/score/refresh': 0.25,
  '/v1/report': 0.02,
  '/v1/data/fraud/blacklist': 0.05,
  '/v1/score/history': 0.15,
  '/v1/score/batch': 0.50,
  '/v1/certification/apply': 99.00,
}

const FREE_ENDPOINTS = new Set([
  '/health',
  '/v1/leaderboard',
  '/v1/score/basic',
  '/v1/badge',
  '/v1/agent/register',
  '/v1/data/economy',
  '/docs',
  '/metrics',
  '/openapi.json',
  '/v1/certification',        // GET check is free
  '/v1/certification/badge',  // SVG badge is free
  '/v1/webhooks',             // webhook management is free (paid via subscription)
])

/**
 * Attempt to extract the payer wallet from the x402 X-PAYMENT header.
 * The header is a base64-encoded JSON payload whose structure depends on
 * the facilitator version; we try common paths and fall back to null.
 */
function extractPayerWallet(header: string | undefined): string | null {
  if (!header) return null
  try {
    const json = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    return (
      json?.payload?.authorization?.from ??
      json?.payer ??
      json?.from ??
      null
    )
  } catch {
    return null
  }
}

function tierFromEndpoint(endpoint: string): string {
  if (endpoint.includes('/score/basic')) return 'basic'
  if (endpoint.includes('/score/full')) return 'full'
  if (endpoint.includes('/score/refresh')) return 'refresh'
  if (endpoint.includes('/score/batch')) return 'batch'
  if (endpoint.includes('/score/history')) return 'history'
  if (endpoint.includes('/certification/apply')) return 'certification'
  if (endpoint.includes('/report')) return 'report'
  if (endpoint.includes('/blacklist')) return 'fraud'
  return 'free'
}

export const queryLoggerMiddleware: MiddlewareHandler = async (c, next) => {
  const startTime = Date.now()
  const requestId = c.get('requestId') ?? null

  await next()

  // Record HTTP metric (non-blocking, before try/catch so it always fires)
  incHttpRequest(c.req.method, c.req.path, c.res.status)

  // Run logging non-blocking so it never delays the response
  try {
    const path = c.req.path
    const pricePaid = ENDPOINT_PRICES[path] ?? 0
    const isFreeEndpoint = FREE_ENDPOINTS.has(path) ? 1 : 0
    // freeTier middleware sets this context variable for free-tier basic lookups
    const isFreeByQuota = c.get('freeTier') ? 1 : 0
    const isFreeTier = isFreeEndpoint || isFreeByQuota

    const paymentHeader =
      c.req.header('X-PAYMENT') ?? c.req.header('x-payment') ?? undefined
    // Prefer API key wallet if present (set by apiKeyAuth middleware)
    const apiKeyWallet = c.get('apiKeyWallet') ?? null
    const requesterWallet = apiKeyWallet ?? extractPayerWallet(paymentHeader)
    const targetWallet = c.req.query('wallet') ?? null

    insertQueryLog({
      requester_wallet: requesterWallet,
      target_wallet: targetWallet,
      endpoint: path,
      tier_requested: tierFromEndpoint(path),
      target_score: null,  // populated by future outcome-matching job
      target_tier: null,
      response_source: apiKeyWallet ? 'api_key' : isFreeTier ? 'free_tier' : 'paid',
      response_time_ms: Date.now() - startTime,
      user_agent: c.req.header('user-agent') ?? null,
      price_paid: isFreeTier ? 0 : pricePaid,
      is_free_tier: isFreeTier,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    // Never let logging failure affect the response
    log.error('queryLogger', 'Failed to log', { requestId, error: err })
  }
}
