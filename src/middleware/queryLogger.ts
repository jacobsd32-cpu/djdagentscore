/**
 * Query Logger Middleware
 * Logs every request to query_log after the response is generated.
 * Must be registered BEFORE the x402 and freeTier middleware so its
 * post-next code sees context variables set by downstream handlers.
 */
import type { MiddlewareHandler } from 'hono'
import { ENDPOINT_PRICING } from '../config/constants.js'
import { insertQueryLog } from '../db.js'
import { log } from '../logger.js'
import { incHttpRequest } from '../metrics.js'
import { getPayerWallet } from '../utils/paymentUtils.js'

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
  '/billing/checkout',        // Stripe billing — self-service
  '/billing/success',
  '/billing/plans',
  '/billing/portal',
  '/stripe/webhook',          // Stripe webhook
])

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
    const pricePaid = ENDPOINT_PRICING[path] ?? 0
    const isFreeEndpoint = FREE_ENDPOINTS.has(path) ? 1 : 0
    // freeTier middleware sets this context variable for free-tier basic lookups
    const isFreeByQuota = c.get('freeTier') ? 1 : 0
    const isFreeTier = isFreeEndpoint || isFreeByQuota

    const requesterWallet = getPayerWallet(c)
    const targetWallet = c.req.query('wallet') ?? null
    const hasApiKey = !!c.get('apiKeyWallet')
    const httpStatus = c.res.status

    // Determine the true response source:
    // - 402 = x402 rejected (no payment received)
    // - API key = bypass payment entirely
    // - free tier = free endpoint or quota-based
    // - paid = successful x402 payment (2xx on a priced endpoint)
    const responseSource = httpStatus === 402
      ? 'payment_rejected'
      : hasApiKey
        ? 'api_key'
        : isFreeTier
          ? 'free_tier'
          : 'paid'

    // Only record price_paid when x402 actually collected payment —
    // rejected requests, API key bypasses, and free tier should not inflate revenue.
    const actualPricePaid = responseSource === 'paid' ? pricePaid : 0

    insertQueryLog({
      requester_wallet: requesterWallet,
      target_wallet: targetWallet,
      endpoint: path,
      tier_requested: tierFromEndpoint(path),
      target_score: null,  // populated by future outcome-matching job
      target_tier: null,
      response_source: responseSource,
      response_time_ms: Date.now() - startTime,
      user_agent: c.req.header('user-agent') ?? null,
      price_paid: actualPricePaid,
      is_free_tier: isFreeTier,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    // Never let logging failure affect the response
    log.error('queryLogger', 'Failed to log', { requestId, error: err })
  }
}
