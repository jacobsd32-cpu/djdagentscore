import { Hono } from 'hono'
import { errorResponse } from '../errors.js'
import { adminAuth } from '../middleware/adminAuth.js'
import {
  createAdminApiKey,
  listAdminApiKeys,
  resetApiKeyUsageRecord,
  revokeApiKeyRecord,
} from '../services/apiKeyService.js'

const apiKeys = new Hono()

apiKeys.use('*', adminAuth)

// POST / — Create a new API key
apiKeys.post('/', async (c) => {
  const outcome = createAdminApiKey(await c.req.json().catch(() => null))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  const { apiKey, message } = outcome
  return c.json(
    {
      id: apiKey.id,
      key: apiKey.key,
      key_prefix: apiKey.key_prefix,
      wallet: apiKey.wallet,
      name: apiKey.name,
      tier: apiKey.tier,
      monthly_limit: apiKey.monthly_limit,
      usage_reset_at: apiKey.usage_reset_at,
      message,
    },
    201,
  )
})

// GET / — List all API keys
apiKeys.get('/', (c) => {
  const keys = listAdminApiKeys()
  return c.json({ keys, count: keys.length })
})

// DELETE /:id — Revoke a key
apiKeys.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!id || Number.isNaN(id)) {
    return c.json(errorResponse('invalid_request', 'Invalid key ID'), 400)
  }
  const outcome = revokeApiKeyRecord(id)
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }
  return c.json({ success: true, message: 'API key revoked' })
})

// POST /:id/reset — Reset monthly usage
apiKeys.post('/:id/reset', (c) => {
  const id = Number(c.req.param('id'))
  if (!id || Number.isNaN(id)) {
    return c.json(errorResponse('invalid_request', 'Invalid key ID'), 400)
  }
  const outcome = resetApiKeyUsageRecord(id)
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }
  return c.json({ success: true, message: 'Usage counter reset' })
})

export default apiKeys
