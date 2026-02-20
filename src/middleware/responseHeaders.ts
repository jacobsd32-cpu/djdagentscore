/**
 * Response Headers Middleware
 * Adds required experimental-disclosure headers to every response.
 */
import type { MiddlewareHandler } from 'hono'

export const MODEL_VERSION = '1.0.0'

export const responseHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next()
  c.res.headers.set('X-DJD-Status', 'experimental')
  c.res.headers.set('X-DJD-Model-Version', MODEL_VERSION)
  c.res.headers.set(
    'X-DJD-Disclaimer',
    'Scores are informational and experimental. Not financial advice.',
  )
}
