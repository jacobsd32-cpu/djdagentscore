import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import legalRoute from '../../src/routes/legal.js'

describe('GET /', () => {
  it('renders landing page with certify and standards surfaces', async () => {
    const app = new Hono()
    app.route('/', legalRoute)

    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')

    const body = await res.text()
    expect(body).toContain('Browse certified agents')
    expect(body).toContain("See who's already certified")
    expect(body).toContain('Trust Infrastructure for the Agent Economy')
    expect(body).toContain('DJD is evolving from a score API into trust infrastructure for the agent economy')
    expect(body).toContain('Certification profile')
    expect(body).toContain('Certify readiness')
    expect(body).toContain('/directory')
    expect(body).toContain('ERC-8004 document')
    expect(body).toContain('/v1/certification/directory')
    expect(body).toContain('/v1/score/erc8004?wallet=')
    expect(body).toContain('/v1/score/evaluator?wallet=')
  })

  it('uses PUBLIC_BASE_URL for robots.txt and agent metadata', async () => {
    process.env.PUBLIC_BASE_URL = 'https://preview.djdagentscore.test'
    process.env.PUBLIC_SUPPORT_EMAIL = 'preview-support@djdagentscore.test'

    const app = new Hono()
    app.route('/', legalRoute)

    const landingRes = await app.request('/')
    expect(landingRes.status).toBe(200)
    const landingBody = await landingRes.text()
    expect(landingBody).toContain('https://preview.djdagentscore.test/')
    expect(landingBody).toContain('https://preview.djdagentscore.test/v1/score/basic?wallet=0x...')
    expect(landingBody).toContain('https://preview.djdagentscore.test/v1/agent/register')
    expect(landingBody).toContain('mailto:preview-support@djdagentscore.test?subject=DJD%20Agent%20Score%20pilot')
    expect(landingBody).toContain('email preview-support@djdagentscore.test directly')

    const robotsRes = await app.request('/robots.txt')
    expect(robotsRes.status).toBe(200)
    const robotsBody = await robotsRes.text()
    expect(robotsBody).toContain('Allow: /directory')
    expect(robotsBody).toContain('Sitemap: https://preview.djdagentscore.test/openapi.json')

    const agentRes = await app.request('/.well-known/agent.json')
    expect(agentRes.status).toBe(200)
    const agentBody = await agentRes.json()
    expect(agentBody.url).toBe('https://preview.djdagentscore.test')
    expect(agentBody.docs).toBe('https://preview.djdagentscore.test/docs')
    expect(agentBody.openapi).toBe('https://preview.djdagentscore.test/openapi.json')
    expect(agentBody.payment.discovery).toBe('https://preview.djdagentscore.test/.well-known/x402')

    delete process.env.PUBLIC_BASE_URL
    delete process.env.PUBLIC_SUPPORT_EMAIL
  })

  it('describes internal reviewer session cookies in the privacy policy', async () => {
    const app = new Hono()
    app.route('/', legalRoute)

    const res = await app.request('/privacy')
    expect(res.status).toBe(200)

    const body = await res.text()
    expect(body).toContain('Reviewer Session Data')
    expect(body).toContain('short-lived, signed')
    expect(body).toContain('HttpOnly')
    expect(body).toContain('We do not use tracking pixels or browser fingerprinting')
  })
})
