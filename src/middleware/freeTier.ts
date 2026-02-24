/**
 * Free Tier Middleware — /v1/score/basic only
 *
 * Allows 10 free queries per day per requester key (wallet or IP hash).
 * When the quota is not exhausted the request is served directly here,
 * bypassing x402.  Once exhausted, next() is called and x402 handles
 * the normal payment flow.
 *
 * Register this middleware BEFORE paymentMiddleware in index.ts.
 */
import { createHash } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { countFreeTierUsesToday } from '../db.js'
import { getOrCalculateScore, MODEL_VERSION } from '../scoring/engine.js'
import { isValidAddress } from '../types.js'
import type { Address } from '../types.js'

const FREE_DAILY_LIMIT = 10

/**
 * Derive a rate-limit key from the client IP.
 *
 * NOTE: We intentionally do NOT accept wallet addresses as rate-limit keys.
 * Without signature-based ownership proof, any client can generate infinite
 * Ethereum addresses and get unlimited free queries. IP-based limiting is
 * imperfect but not trivially bypassable like address generation.
 * Wallet-based rate limiting requires EIP-4361 (SIWE) or similar — future work.
 */
function requesterKey(c: Parameters<MiddlewareHandler>[0]): string {
  const ip =
    c.req.header('fly-client-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  return `ip:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`
}

export const freeTierMiddleware: MiddlewareHandler = async (c, next) => {
  const key = requesterKey(c)
  const usesToday = countFreeTierUsesToday(key)

  if (usesToday >= FREE_DAILY_LIMIT) {
    c.header('Retry-After', '86400')
    return c.json({
      error: 'free_tier_quota_exhausted',
      message: 'Daily free quota exhausted (10/day). Upgrade to paid endpoints for unlimited access.',
      upgrade: {
        docs: '/docs',
        endpoints: {
          '/v1/score/full': { price: '$0.10', description: 'Full score with dimension breakdown' },
          '/v1/score/refresh': { price: '$0.25', description: 'Force live recalculation' },
        },
        protocol: 'x402',
        network: 'base',
        paymentInfo: 'Send x402 USDC payment header on Base. See /docs for integration guide.',
      },
    }, 429)
  }

  // Still within free quota — serve directly
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
  }

  const result = await getOrCalculateScore(wallet as Address)

  // Signal to queryLogger that this was a free-tier response
  c.set('freeTier', true)

  return c.json({
    wallet: result.wallet,
    score: result.score,
    tier: result.tier,
    confidence: result.confidence,
    recommendation: result.recommendation,
    modelVersion: MODEL_VERSION,
    lastUpdated: result.lastUpdated,
    computedAt: result.computedAt,
    scoreFreshness: result.scoreFreshness,
    freeTier: true,
    freeQueriesRemainingToday: FREE_DAILY_LIMIT - usesToday - 1,
    ...(result.stale ? { stale: true } : {}),
  })
}
