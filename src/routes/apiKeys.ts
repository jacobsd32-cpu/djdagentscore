import { Hono } from 'hono'
import { db } from '../db.js'
import { errorResponse } from '../errors.js'
import { adminAuth } from '../middleware/adminAuth.js'
import { generateApiKey, hashKey, keyPrefix } from '../utils/apiKeyUtils.js'

const apiKeys = new Hono()

apiKeys.use('*', adminAuth)

// POST / — Create a new API key
apiKeys.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.wallet) {
    return c.json(errorResponse('invalid_request', 'wallet is required'), 400)
  }

  const rawKey = generateApiKey()
  const keyHash = hashKey(rawKey)
  const prefix = keyPrefix(rawKey)
  const name = body.name ?? null
  const tier = body.tier ?? 'standard'
  const monthlyLimit = body.monthly_limit ?? 10000

  const nextReset = new Date()
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)

  const result = db
    .prepare(`
    INSERT INTO api_keys (key_hash, key_prefix, wallet, name, tier, monthly_limit, usage_reset_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .run(keyHash, prefix, body.wallet.toLowerCase(), name, tier, monthlyLimit, nextReset.toISOString())

  return c.json(
    {
      id: result.lastInsertRowid,
      key: rawKey, // ONLY returned on creation
      key_prefix: prefix,
      wallet: body.wallet.toLowerCase(),
      name,
      tier,
      monthly_limit: monthlyLimit,
      usage_reset_at: nextReset.toISOString(),
      message: 'Store this key securely — it cannot be retrieved again.',
    },
    201,
  )
})

// GET / — List all API keys
apiKeys.get('/', (c) => {
  const keys = db
    .prepare(`
    SELECT id, key_prefix, wallet, name, tier, monthly_limit, monthly_used,
           usage_reset_at, is_active, created_at, last_used_at, revoked_at
    FROM api_keys ORDER BY created_at DESC
  `)
    .all()
  return c.json({ keys, count: keys.length })
})

// DELETE /:id — Revoke a key
apiKeys.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!id || Number.isNaN(id)) {
    return c.json(errorResponse('invalid_request', 'Invalid key ID'), 400)
  }
  const result = db
    .prepare('UPDATE api_keys SET revoked_at = datetime("now"), is_active = 0 WHERE id = ? AND revoked_at IS NULL')
    .run(id)
  if (result.changes === 0) {
    return c.json(errorResponse('not_found', 'API key not found or already revoked'), 404)
  }
  return c.json({ success: true, message: 'API key revoked' })
})

// POST /:id/reset — Reset monthly usage
apiKeys.post('/:id/reset', (c) => {
  const id = Number(c.req.param('id'))
  if (!id || Number.isNaN(id)) {
    return c.json(errorResponse('invalid_request', 'Invalid key ID'), 400)
  }
  const nextReset = new Date()
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)

  const result = db
    .prepare('UPDATE api_keys SET monthly_used = 0, usage_reset_at = ? WHERE id = ?')
    .run(nextReset.toISOString(), id)
  if (result.changes === 0) {
    return c.json(errorResponse('not_found', 'API key not found'), 404)
  }
  return c.json({ success: true, message: 'Usage counter reset' })
})

export default apiKeys
