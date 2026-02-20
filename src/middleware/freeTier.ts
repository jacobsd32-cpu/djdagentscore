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
import type { MiddlewareHandler } from 'hono'
import { countFreeTierUsesToday } from '../db.js'
import { getOrCalculateScore } from '../scoring/engine.js'
import type { Address } from '../types.js'

const FREE_DAILY_LIMIT = 10

function isValidAddress(addr: string): addr is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

/**
 * Derive a rate-limit key from the request.
 * Prefers an explicit X-Requester-Wallet header (for agents that self-identify),
 * then falls back to a short hash of the client IP.
 */
function requesterKey(c: Parameters<MiddlewareHandler>[0]): string {
  const walletHeader = c.req.header('X-Requester-Wallet')
  if (walletHeader && isValidAddress(walletHeader)) {
    return walletHeader.toLowerCase()
  }
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'
  // Produce a short deterministic string from the IP (not a real hash, just prefix + end)
  return `ip:${Buffer.from(ip).toString('base64').slice(0, 20)}`
}

export const freeTierMiddleware: MiddlewareHandler = async (c, next) => {
  const key = requesterKey(c)
  const usesToday = countFreeTierUsesToday(key)

  if (usesToday >= FREE_DAILY_LIMIT) {
    // Quota exhausted — hand off to x402 payment middleware
    return next()
  }

  // Still within free quota — serve directly
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
  }

  const result = await getOrCalculateScore(wallet as Address)

  // Signal to queryLogger that this was a free-tier response
  c.set('freeTier' as never, true)

  return c.json({
    wallet: result.wallet,
    score: result.score,
    tier: result.tier,
    confidence: (result as unknown as Record<string, unknown>).confidence ?? 0,
    recommendation: (result as unknown as Record<string, unknown>).recommendation ?? 'insufficient_history',
    modelVersion: '1.0.0',
    lastUpdated: result.lastUpdated,
    freeTier: true,
    freeQueriesRemainingToday: FREE_DAILY_LIMIT - usesToday - 1,
    ...(result.stale ? { stale: true } : {}),
  })
}
