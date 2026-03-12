import crypto from 'node:crypto'
import type { Context, Next } from 'hono'

/**
 * Shared admin authentication middleware.
 * Validates the `x-admin-key` header against the ADMIN_KEY environment variable
 * using constant-time comparison to prevent timing attacks.
 *
 * Can be used as:
 *   - Router-level: `router.use('*', adminAuth)`
 *   - Route-level:  `router.get('/path', adminAuth, handler)`
 */
export function hasValidAdminKey(candidate: string | undefined): boolean {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey || !candidate) {
    return false
  }

  const candidateHash = crypto.createHash('sha256').update(candidate).digest()
  const adminHash = crypto.createHash('sha256').update(adminKey).digest()
  return crypto.timingSafeEqual(candidateHash, adminHash)
}

export async function adminAuth(c: Context, next: Next) {
  if (!process.env.ADMIN_KEY) {
    return c.json({ error: 'Admin key not configured' }, 503)
  }

  if (!hasValidAdminKey(c.req.header('x-admin-key'))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}
