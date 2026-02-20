/**
 * Query Logger Middleware
 * Logs every request to query_log after the response is generated.
 * Must be registered BEFORE the x402 and freeTier middleware so its
 * post-next code sees context variables set by downstream handlers.
 */
import type { MiddlewareHandler } from 'hono'
import { insertQueryLog } from '../db.js'

const ENDPOINT_PRICES: Record<string, number> = {
  '/v1/score/basic': 0.03,
  '/v1/score/full': 0.10,
  '/v1/score/refresh': 0.25,
  '/v1/report': 0.02,
  '/v1/data/fraud/blacklist': 0.05,
}

const FREE_ENDPOINTS = new Set(['/health', '/v1/leaderboard'])

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
  return 'free'
}

export const queryLoggerMiddleware: MiddlewareHandler = async (c, next) => {
  const startTime = Date.now()

  await next()

  // Run logging non-blocking so it never delays the response
  try {
    const path = c.req.path
    const pricePaid = ENDPOINT_PRICES[path] ?? 0
    const isFreeEndpoint = FREE_ENDPOINTS.has(path) ? 1 : 0
    // freeTier middleware sets this context variable for free-tier basic lookups
    const isFreeByQuota = (c.get('freeTier' as never) as boolean | undefined) ? 1 : 0
    const isFreeTier = isFreeEndpoint || isFreeByQuota

    const paymentHeader =
      c.req.header('X-PAYMENT') ?? c.req.header('x-payment') ?? undefined
    const requesterWallet = extractPayerWallet(paymentHeader)
    const targetWallet = c.req.query('wallet') ?? null

    insertQueryLog({
      requester_wallet: requesterWallet,
      target_wallet: targetWallet,
      endpoint: path,
      tier_requested: tierFromEndpoint(path),
      target_score: null,  // populated by future outcome-matching job
      target_tier: null,
      response_source: isFreeTier ? 'free_tier' : isFreeEndpoint ? 'cache' : 'paid',
      response_time_ms: Date.now() - startTime,
      user_agent: c.req.header('user-agent') ?? null,
      price_paid: isFreeTier ? 0 : pricePaid,
      is_free_tier: isFreeTier,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    // Never let logging failure affect the response
    console.error('[queryLogger] failed to log:', err)
  }
}
