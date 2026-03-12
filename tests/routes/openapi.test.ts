import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import openapiRoute from '../../src/routes/openapi.js'

describe('GET /openapi.json', () => {
  it('returns cached OpenAPI JSON', async () => {
    const app = new Hono()
    app.route('/openapi.json', openapiRoute)

    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')

    const body = JSON.parse(await res.text()) as { info?: { title?: string } }
    expect(body.info?.title).toBe('DJD Agent Score API')
  })
})
