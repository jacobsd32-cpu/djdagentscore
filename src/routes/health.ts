import { Hono } from 'hono'
import { getHealthPayload } from '../services/opsService.js'

const health = new Hono()

health.get('/', (c) => {
  return c.json(getHealthPayload())
})

export default health
