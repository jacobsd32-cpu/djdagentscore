import { Hono } from 'hono'
import { ErrorCodes, errorResponse } from '../errors.js'
import { hasValidAdminKey } from '../middleware/adminAuth.js'
import {
  clearReviewerSession,
  hasValidReviewerSession,
  REVIEWER_SESSION_MAX_AGE_SECONDS,
  startReviewerSession,
} from '../middleware/reviewerSession.js'
import { reviewerPageHtml } from '../templates/reviewer.js'

const reviewer = new Hono()

reviewer.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})

reviewer.get('/', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.body(reviewerPageHtml())
})

reviewer.get('/session', async (c) => {
  const authenticated = await hasValidReviewerSession(c)
  return c.json({
    authenticated,
    expires_in_seconds: authenticated ? REVIEWER_SESSION_MAX_AGE_SECONDS : 0,
  })
})

reviewer.post('/session', async (c) => {
  if (!process.env.ADMIN_KEY) {
    return c.json({ error: 'Admin key not configured' }, 503)
  }

  const body = await c.req.json<{ admin_key?: string }>().catch(() => null)
  if (!body) {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  if (!hasValidAdminKey(body.admin_key)) {
    return c.json(errorResponse('unauthorized', 'Unauthorized'), 401)
  }

  await startReviewerSession(c)
  return c.json({
    authenticated: true,
    expires_in_seconds: REVIEWER_SESSION_MAX_AGE_SECONDS,
    message: 'Reviewer session started.',
  })
})

reviewer.delete('/session', (c) => {
  clearReviewerSession(c)
  return c.json({
    authenticated: false,
    expires_in_seconds: 0,
    message: 'Reviewer session ended.',
  })
})

export default reviewer
