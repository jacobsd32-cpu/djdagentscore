import { Hono } from 'hono'
import crypto from 'node:crypto'
import { db } from '../db.js'
import { errorResponse } from '../errors.js'

const apiKeys = new Hono()

// Admin auth middleware (same pattern as src/routes/admin.ts)
apiKeys.use('*', async (c, next) => {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) {
    return c.json({ error: 'Admin key not configured' }, 503)
  }
  const key = c.req.header('x-admin-key')
  if (!key || key.length !== adminKey.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(adminKey))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

function generateApiKey(): string {
  return `djd_live_${crypto.randomBytes(32).toString('hex')}`
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// POST / — Create a new API key
apiKeys.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.wallet) {
    return c.json(errorResponse('invalid_request', 'wallet is required'), 400)
  }

  const rawKey = generateApiKey()
  const keyHash = hashKey(rawKey)
  const keyPrefix = rawKey.slice(0, 16) + '...'
  const name = body.name ?? null
  const tier = body.tier ?? 'standard'
  const monthlyLimit = body.monthly_limit ?? 10000

  const nextReset = new Date()
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)

  const result = db.prepare(`
    INSERT INTO api_keys (key_hash, key_prefix, wallet, name, tier, monthly_limit, usage_reset_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(keyHash, keyPrefix, body.wallet.toLowerCase(), name, tier, monthlyLimit, nextReset.toISOString())

  return c.json({
    id: result.lastInsertRowid,
    key: rawKey,  // ONLY returned on creation
    key_prefix: keyPrefix,
    wallet: body.wallet.toLowerCase(),
    name,
    tier,
    monthly_limit: monthlyLimit,
    usage_reset_at: nextReset.toISOString(),
    message: 'Store this key securely — it cannot be retrieved again.',
  }, 201)
})

// GET / — List all API keys
apiKeys.get('/', (c) => {
  const keys = db.prepare(`
    SELECT id, key_prefix, wallet, name, tier, monthly_limit, monthly_used,
           usage_reset_at, is_active, created_at, last_used_at, revoked_at
    FROM api_keys ORDER BY created_at DESC
  `).all()
  return c.json({ keys, count: keys.length })
})

// DELETE /:id — Revoke a key
apiKeys.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!id || isNaN(id)) {
    return c.json(errorResponse('invalid_request', 'Invalid key ID'), 400)
  }
  const result = db.prepare(
    'UPDATE api_keys SET revoked_at = datetime("now"), is_active = 0 WHERE id = ? AND revoked_at IS NULL'
  ).run(id)
  if (result.changes === 0) {
    return c.json(errorResponse('not_found', 'API key not found or already revoked'), 404)
  }
  return c.json({ success: true, message: 'API key revoked' })
})

// POST /:id/reset — Reset monthly usage
apiKeys.post('/:id/reset', (c) => {
  const id = Number(c.req.param('id'))
  if (!id || isNaN(id)) {
    return c.json(errorResponse('invalid_request', 'Invalid key ID'), 400)
  }
  const nextReset = new Date()
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)

  const result = db.prepare(
    'UPDATE api_keys SET monthly_used = 0, usage_reset_at = ? WHERE id = ?'
  ).run(nextReset.toISOString(), id)
  if (result.changes === 0) {
    return c.json(errorResponse('not_found', 'API key not found'), 404)
  }
  return c.json({ success: true, message: 'Usage counter reset' })
})

export default apiKeys
