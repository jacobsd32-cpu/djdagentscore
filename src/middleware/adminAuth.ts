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
export async function adminAuth(c: Context, next: Next) {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) {
    return c.json({ error: 'Admin key not configured' }, 503)
  }
  const key = c.req.header('x-admin-key')
  if (!key) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  // Hash both sides to fixed-length buffers before comparing.
  // Prevents leaking the admin key length via timing side-channel
  // (the old `key.length !== adminKey.length` short-circuit was measurable).
  const keyHash = crypto.createHash('sha256').update(key).digest()
  const adminHash = crypto.createHash('sha256').update(adminKey).digest()
  if (!crypto.timingSafeEqual(keyHash, adminHash)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}
