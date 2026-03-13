import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import pricingRoute from '../../src/routes/pricing.js'

describe('GET /pricing', () => {
  it('renders pricing page with certified directory and evaluator messaging', async () => {
    const app = new Hono()
    app.route('/pricing', pricingRoute)

    const res = await app.request('/pricing')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')

    const body = await res.text()
    expect(body).toContain('trust infrastructure')
    expect(body).toContain('Certify workflows')
    expect(body).toContain('certified directory')
    expect(body).toContain('ERC-8183 evaluator preview endpoint')
    expect(body).toContain('/v1/certification/directory')
    expect(body).toContain('/explorer')
  })
})
