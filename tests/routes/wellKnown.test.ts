import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wellKnownRoute from '../../src/routes/wellKnown.js'

describe('GET /.well-known/x402', () => {
  const originalFacilitator = process.env.FACILITATOR_URL

  beforeEach(() => {
    process.env.FACILITATOR_URL = 'https://facilitator.example.test'
  })

  afterEach(() => {
    if (originalFacilitator === undefined) {
      delete process.env.FACILITATOR_URL
      return
    }
    process.env.FACILITATOR_URL = originalFacilitator
  })

  it('returns the x402 discovery manifest using the forwarded request origin', async () => {
    const app = new Hono()
    app.route('/.well-known/x402', wellKnownRoute)

    const res = await app.request('http://api.example.test/.well-known/x402', {
      headers: { 'x-forwarded-proto': 'https' },
    })

    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      x402: { facilitator: string }
      service: { docs: string; openapi: string; version: string }
      endpoints: Array<{ path: string; price: number }>
      integration: { quickstart: string }
    }

    expect(body.x402.facilitator).toBe('https://facilitator.example.test')
    expect(body.service.docs).toBe('https://api.example.test/docs')
    expect(body.service.openapi).toBe('https://api.example.test/openapi.json')
    expect(body.service.version).toBeTruthy()
    expect(body.endpoints.some((endpoint) => endpoint.path === '/v1/score/basic' && endpoint.price === 0)).toBe(true)
    expect(body.endpoints.some((endpoint) => endpoint.path === '/v1/data/decay' && endpoint.price === 0.15)).toBe(true)
    expect(body.endpoints.some((endpoint) => endpoint.path === '/v1/data/graph' && endpoint.price === 0.2)).toBe(true)
    expect(body.integration.quickstart).toContain('https://api.example.test/v1/score/basic')
  })
})
