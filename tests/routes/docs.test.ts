import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import docsRoute from '../../src/routes/docs.js'

describe('GET /docs', () => {
  it('returns cached Swagger UI HTML', async () => {
    const app = new Hono()
    app.route('/docs', docsRoute)

    const res = await app.request('/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')

    const body = await res.text()
    expect(body).toContain('DJD Agent Score')
    expect(body).toContain('SwaggerUIBundle')
    expect(body).toContain('/openapi.json')
  })
})
