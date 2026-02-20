import { Hono } from 'hono'
import { countCachedScores } from '../db.js'

const VERSION = '1.0.0'
const startTime = Date.now()

const health = new Hono()

health.get('/', (c) => {
  return c.json({
    status: 'ok',
    version: VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    cachedScores: countCachedScores(),
  })
})

export default health
