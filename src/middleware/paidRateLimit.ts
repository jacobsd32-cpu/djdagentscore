/**
 * Paid Rate Limit Middleware
 * SQLite-backed, per-payer wallet rate limiting for paid endpoints.
 * 120 requests/hour per payer wallet.
 */
import type { MiddlewareHandler } from 'hono'
import { db } from '../db.js'
import { errorResponse, ErrorCodes } from '../errors.js'

const MAX_REQUESTS_PER_HOUR = 120

/**
 * Extract the payer wallet from the x402 X-PAYMENT header.
 * Reuses the same parsing logic as queryLogger.
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

function getCurrentWindow(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}`
}

const upsertStmt = db.prepare<[string, string]>(
  `INSERT INTO rate_limits (key, window, count) VALUES (?, ?, 1)
   ON CONFLICT(key, window) DO UPDATE SET count = count + 1
   RETURNING count`,
)

const getCountStmt = db.prepare<[string, string], { count: number }>(
  `SELECT count FROM rate_limits WHERE key = ? AND window = ?`,
)

/** Clean up old windows. Called periodically (e.g., from hourly job). */
export function cleanupRateLimits(): void {
  const window = getCurrentWindow()
  db.prepare(`DELETE FROM rate_limits WHERE window < ?`).run(window)
}

export const paidRateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const paymentHeader =
    c.req.header('X-PAYMENT') ?? c.req.header('x-payment') ?? undefined
  // Also check for API key wallet so API key users are rate-limited too (H8 fix)
  const apiKeyWallet = (c.get('apiKeyWallet') as string | null) ?? null
  const wallet = apiKeyWallet ?? extractPayerWallet(paymentHeader)

  // If no payer wallet identified, let through (free tier or other checks handle it)
  if (!wallet) {
    await next()
    return
  }

  const key = wallet.toLowerCase()
  const window = getCurrentWindow()

  // Increment and get current count (atomic via RETURNING)
  const row = upsertStmt.get(key, window) as { count: number } | undefined
  const currentCount = row?.count ?? (getCountStmt.get(key, window)?.count ?? 1)

  // Set rate limit headers on ALL responses
  const remaining = Math.max(0, MAX_REQUESTS_PER_HOUR - currentCount)
  const resetDate = new Date()
  resetDate.setUTCMinutes(0, 0, 0)
  resetDate.setUTCHours(resetDate.getUTCHours() + 1)
  const resetTimestamp = Math.floor(resetDate.getTime() / 1000)

  c.header('RateLimit-Limit', String(MAX_REQUESTS_PER_HOUR))
  c.header('RateLimit-Remaining', String(remaining))
  c.header('RateLimit-Reset', String(resetTimestamp))

  if (currentCount > MAX_REQUESTS_PER_HOUR) {
    c.header('Retry-After', String(resetTimestamp - Math.floor(Date.now() / 1000)))
    return c.json(
      errorResponse(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        `Rate limit exceeded: ${MAX_REQUESTS_PER_HOUR} requests/hour per payer wallet`,
        { limit: MAX_REQUESTS_PER_HOUR, reset: resetTimestamp },
      ),
      429,
    )
  }

  await next()
}
