import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import reviewerRoute from '../../src/routes/reviewer.js'

describe('GET /reviewer', () => {
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
    expect(body).toContain('Issue Certification')
    expect(body).toContain('Enter the admin key')
  })
})
