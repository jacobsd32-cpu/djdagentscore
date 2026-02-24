/**
 * Response Headers Middleware
 * Adds required experimental-disclosure headers and security headers to every response.
 */
import type { MiddlewareHandler } from 'hono'

import { MODEL_VERSION } from '../scoring/responseBuilders.js'
export { MODEL_VERSION }

export const responseHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next()

  // ── DJD custom headers ──
  c.res.headers.set('X-DJD-Status', 'experimental')
  c.res.headers.set('X-DJD-Model-Version', MODEL_VERSION)
  c.res.headers.set('X-DJD-Disclaimer', 'Scores are informational and experimental. Not financial advice.')

  // ── Security headers ──
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // CSP: HTML pages need inline styles/scripts + Google Fonts; /docs needs Swagger CDN; API routes locked down
  const path = c.req.path
  const isDocsRoute = path.startsWith('/docs')
  const isHtmlPage =
    path === '/' || path === '/leaderboard' || path === '/terms' || path === '/privacy' || path.startsWith('/agent/')
  if (isDocsRoute) {
    c.res.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data:; font-src 'self' https://unpkg.com; frame-ancestors 'none'",
    )
  } else if (isHtmlPage) {
    c.res.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://djd-agent-score.fly.dev; connect-src 'self'; frame-ancestors 'none'",
    )
  } else {
    c.res.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  }
}
