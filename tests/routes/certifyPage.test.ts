import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import certifyRoute from '../../src/routes/certify.js'

describe('GET /certify', () => {
  it('renders the Certify product page', async () => {
    const app = new Hono()
    app.route('/certify', certifyRoute)

    const res = await app.request('/certify')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')

    const body = await res.text()
    expect(body).toContain('DJD Certify')
    expect(body).toContain('public trust infrastructure')
    expect(body).toContain('Check certification readiness')
    expect(body).toContain('/directory')
    expect(body).toContain('/v1/certification/readiness')
    expect(body).toContain('/v1/certification/review')
    expect(body).toContain('/v1/certification/directory')
    expect(body).toContain('POST /v1/certification/apply')
    expect(body).toContain('/v1/score/evaluator?wallet=')
    expect(body).toContain('/v1/score/evaluator/evidence?wallet=')
    expect(body).toContain('/v1/score/evaluator/oracle?wallet=')
    expect(body).toContain('/v1/score/evaluator/callback?id=')
    expect(body).toContain('/v1/score/evaluator/verifier')
    expect(body).toContain('/v1/score/evaluator/networks')
    expect(body).toContain('/v1/score/evaluator/artifacts')
    expect(body).toContain('/v1/score/evaluator/proof?id=')
    expect(body).toContain('/v1/score/evaluator/escrow?id=')
    expect(body).toContain('/v1/score/evaluator/deploy?id=')
    expect(body).toContain('/v1/score/evaluator/deploy/bundle?id=')
  })
})
