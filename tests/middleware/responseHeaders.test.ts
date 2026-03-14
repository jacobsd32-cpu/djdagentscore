import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { responseHeadersMiddleware } from '../../src/middleware/responseHeaders.js'
import { MODEL_VERSION } from '../../src/scoring/responseBuilders.js'

describe('responseHeadersMiddleware', () => {
  it('sets X-DJD-Model-Version to the canonical MODEL_VERSION', async () => {
    process.env.DJD_RUNTIME_MODE = 'api'
    process.env.DJD_RELEASE_SHA = 'ABCDEF1234567890'
    process.env.DJD_BUILD_TIMESTAMP = '2026-03-13T02:30:00Z'

    const app = new Hono()
    app.use('*', responseHeadersMiddleware)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    expect(res.headers.get('X-DJD-Model-Version')).toBe(MODEL_VERSION)
    expect(res.headers.get('X-DJD-Runtime-Mode')).toBe('api')
    expect(res.headers.get('X-DJD-Release-Sha')).toBe('abcdef1234567890')
    expect(res.headers.get('X-DJD-Build-Timestamp')).toBe('2026-03-13T02:30:00Z')
    expect(MODEL_VERSION).toBe('2.5.0')

    delete process.env.DJD_RUNTIME_MODE
    delete process.env.DJD_RELEASE_SHA
    delete process.env.DJD_BUILD_TIMESTAMP
  })

  it('applies the HTML CSP to public product pages', async () => {
    const app = new Hono()
    app.use('*', responseHeadersMiddleware)
    app.get('/directory', (c) => c.html('<html></html>'))
    app.get('/reviewer', (c) => c.html('<html></html>'))
    app.get('/certify', (c) => c.html('<html></html>'))
    app.get('/pricing', (c) => c.html('<html></html>'))
    app.get('/methodology', (c) => c.html('<html></html>'))
    app.get('/billing/success', (c) => c.html('<html></html>'))

    for (const path of ['/directory', '/reviewer', '/certify', '/pricing', '/methodology', '/billing/success']) {
      const res = await app.request(path)
      const csp = res.headers.get('Content-Security-Policy') ?? ''
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain('fonts.googleapis.com')
      expect(csp).toContain('djdagentscore.dev')
    }
  })
})
