import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { responseHeadersMiddleware } from '../../src/middleware/responseHeaders.js'
import { MODEL_VERSION } from '../../src/scoring/responseBuilders.js'

describe('responseHeadersMiddleware', () => {
  it('sets X-DJD-Model-Version to the canonical MODEL_VERSION', async () => {
    const app = new Hono()
    app.use('*', responseHeadersMiddleware)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    expect(res.headers.get('X-DJD-Model-Version')).toBe(MODEL_VERSION)
    expect(MODEL_VERSION).toBe('2.5.0')
  })

  it('applies the HTML CSP to pricing and methodology pages', async () => {
    const app = new Hono()
    app.use('*', responseHeadersMiddleware)
    app.get('/pricing', (c) => c.html('<html></html>'))
    app.get('/methodology', (c) => c.html('<html></html>'))
    app.get('/billing/success', (c) => c.html('<html></html>'))

    for (const path of ['/pricing', '/methodology', '/billing/success']) {
      const res = await app.request(path)
      const csp = res.headers.get('Content-Security-Policy') ?? ''
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain('fonts.googleapis.com')
      expect(csp).toContain('djdagentscore.dev')
    }
  })
})
