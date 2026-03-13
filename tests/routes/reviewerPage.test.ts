import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import reviewerRoute from '../../src/routes/reviewer.js'

const ORIGINAL_ADMIN_KEY = process.env.ADMIN_KEY

describe('GET /reviewer', () => {
  beforeEach(() => {
    process.env.ADMIN_KEY = 'reviewer-secret-key-1234567890123456'
  })

  afterEach(() => {
    if (ORIGINAL_ADMIN_KEY !== undefined) {
      process.env.ADMIN_KEY = ORIGINAL_ADMIN_KEY
    } else {
      delete process.env.ADMIN_KEY
    }
  })

  it('renders the certification reviewer dashboard page', async () => {
    const app = new Hono()
    app.route('/reviewer', reviewerRoute)

    const res = await app.request('/reviewer')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('no-store')

    const body = await res.text()
    expect(body).toContain('Certification Reviewer Dashboard')
    expect(body).toContain('/v1/certification/admin/reviews')
    expect(body).toContain('/reviewer/session')
    expect(body).toContain('Issue Certification')
    expect(body).toContain('Start Reviewer Session')
    expect(body).toContain('Wallet, name, or description')
    expect(body).toContain('HttpOnly')
    expect(body).toContain('sessionStorage')
    expect(body).toContain('djd-reviewer-dashboard')
  })

  it('creates, reports, and clears reviewer session cookies', async () => {
    const app = new Hono()
    app.route('/reviewer', reviewerRoute)

    const startRes = await app.request('/reviewer/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ admin_key: process.env.ADMIN_KEY }),
    })

    expect(startRes.status).toBe(200)
    expect(startRes.headers.get('cache-control')).toBe('no-store')
    const startBody = (await startRes.json()) as { authenticated: boolean; expires_in_seconds: number }
    expect(startBody.authenticated).toBe(true)
    expect(startBody.expires_in_seconds).toBeGreaterThan(0)

    const sessionCookie = startRes.headers.get('set-cookie')
    expect(sessionCookie).toContain('djd_reviewer_session=')
    expect(sessionCookie).toContain('HttpOnly')

    const cookieHeader = sessionCookie?.split(';')[0] ?? ''
    const statusRes = await app.request('/reviewer/session', {
      headers: { Cookie: cookieHeader },
    })
    expect(statusRes.status).toBe(200)
    const statusBody = (await statusRes.json()) as { authenticated: boolean }
    expect(statusBody.authenticated).toBe(true)

    const clearRes = await app.request('/reviewer/session', {
      method: 'DELETE',
      headers: { Cookie: cookieHeader },
    })
    expect(clearRes.status).toBe(200)
    expect(clearRes.headers.get('set-cookie')).toContain('Max-Age=0')
    const clearBody = (await clearRes.json()) as { authenticated: boolean }
    expect(clearBody.authenticated).toBe(false)
  })
})
