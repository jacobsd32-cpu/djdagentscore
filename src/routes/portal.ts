/**
 * Developer Portal Routes
 *
 * Self-service usage dashboard for API key holders.
 *   GET  /portal          → renders the portal page
 *   POST /portal/api/usage → returns usage stats for a hashed API key
 *
 * Authentication: the developer enters their full key in the browser,
 * which SHA-256 hashes it client-side before sending. Matches the
 * existing key_hash column in the api_keys table.
 */

import { Hono } from 'hono'
import { ErrorCodes, errorResponse } from '../errors.js'
import { getPortalAnalytics, getPortalUsage } from '../services/portalService.js'
import type { PortalData } from '../templates/portal.js'
import { portalPageHtml } from '../templates/portal.js'

const portal = new Hono()

// ── GET /portal ─────────────────────────────────────────────────────
portal.get('/', (c) => {
  return c.html(portalPageHtml())
})

// ── POST /portal/api/usage ──────────────────────────────────────────
portal.post('/api/usage', async (c) => {
  let body: { keyHash?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const outcome = getPortalUsage(body)
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json(outcome.data as PortalData)
})

// ── POST /portal/api/analytics ───────────────────────────────────────
portal.post('/api/analytics', async (c) => {
  let body: { keyHash?: string; days?: number }
  try {
    body = await c.req.json()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const outcome = getPortalAnalytics(body)
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message), outcome.status)
  }

  return c.json(outcome.analytics)
})

export default portal
