/**
 * Request ID Middleware
 * Reads X-Request-ID from client or generates a new UUID.
 * Sets on Hono context + response header.
 */
import type { MiddlewareHandler } from 'hono'
import { v4 as uuidv4 } from 'uuid'

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header('X-Request-ID') ?? uuidv4()
  c.set('requestId', requestId)
  await next()
  c.res.headers.set('X-Request-ID', requestId)
}
