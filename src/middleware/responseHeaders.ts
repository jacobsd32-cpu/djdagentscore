/**
 * Response Headers Middleware
 * Adds required experimental-disclosure headers and security headers to every response.
 */
import type { MiddlewareHandler } from 'hono'

import { getPublicOrigin } from '../config/public.js'
import { getReleaseMetadata, getRuntimeMode } from '../config/runtimeMetadata.js'
import { MODEL_VERSION } from '../scoring/responseBuilders.js'
export { MODEL_VERSION }

const PUBLIC_SITE_ORIGIN = getPublicOrigin()

export const responseHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next()

  // ── DJD custom headers ──
  const release = getReleaseMetadata()
  c.res.headers.set('X-DJD-Status', 'experimental')
  c.res.headers.set('X-DJD-Model-Version', MODEL_VERSION)
  c.res.headers.set('X-DJD-Runtime-Mode', getRuntimeMode())
  if (release?.sha) {
    c.res.headers.set('X-DJD-Release-Sha', release.sha)
  }
  if (release?.builtAt) {
    c.res.headers.set('X-DJD-Build-Timestamp', release.builtAt)
  }
  c.res.headers.set('X-DJD-Disclaimer', 'Scores are informational and experimental. Not financial advice.')

  // ── Security headers ──
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // CSP: HTML pages need inline styles/scripts + Google Fonts; /docs needs Swagger CDN; API routes locked down
  const path = c.req.path
  const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  const isDocsRoute = normalizedPath.startsWith('/docs')
  const isHtmlPage =
    normalizedPath === '/' ||
    normalizedPath === '/leaderboard' ||
    normalizedPath === '/explorer' ||
    normalizedPath === '/certify' ||
    normalizedPath === '/pricing' ||
    normalizedPath === '/methodology' ||
    normalizedPath === '/portal' ||
    normalizedPath === '/billing/success' ||
    normalizedPath === '/terms' ||
    normalizedPath === '/privacy' ||
    normalizedPath.startsWith('/agent/') ||
    normalizedPath.startsWith('/blog')
  if (isDocsRoute) {
    c.res.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data:; font-src 'self' https://unpkg.com; frame-ancestors 'none'",
    )
  } else if (isHtmlPage) {
    c.res.headers.set(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: ${PUBLIC_SITE_ORIGIN}; connect-src 'self'; frame-ancestors 'none'`,
    )
  } else {
    c.res.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  }
}
