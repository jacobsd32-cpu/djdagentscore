import { Hono } from 'hono'
import { hasValidAdminKey } from '../middleware/adminAuth.js'
import { getHealthPayload } from '../services/opsService.js'

const health = new Hono()

health.get('/', (c) => {
  return c.json(getHealthPayload(hasValidAdminKey(c.req.header('x-admin-key'))))
})

export default health
