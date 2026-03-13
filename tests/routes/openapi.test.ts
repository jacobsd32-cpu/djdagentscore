import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import openapiRoute from '../../src/routes/openapi.js'

describe('GET /openapi.json', () => {
  const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL
  const originalSupportEmail = process.env.PUBLIC_SUPPORT_EMAIL

  afterEach(() => {
    if (originalPublicBaseUrl === undefined) {
      delete process.env.PUBLIC_BASE_URL
    } else {
      process.env.PUBLIC_BASE_URL = originalPublicBaseUrl
    }

    if (originalSupportEmail === undefined) {
      delete process.env.PUBLIC_SUPPORT_EMAIL
    } else {
      process.env.PUBLIC_SUPPORT_EMAIL = originalSupportEmail
    }
  })

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

  it('injects the canonical public URL and support email at runtime', async () => {
    process.env.PUBLIC_BASE_URL = 'https://api.example.test'
    process.env.PUBLIC_SUPPORT_EMAIL = 'support@example.test'

    const app = new Hono()
    app.route('/openapi.json', openapiRoute)

    const res = await app.request('/openapi.json')
    const body = JSON.parse(await res.text()) as {
      info?: { contact?: { email?: string } }
      servers?: Array<{ url?: string }>
    }

    expect(body.info?.contact?.email).toBe('support@example.test')
    expect(body.servers?.[0]?.url).toBe('https://api.example.test')
  })

  it('documents the current webhook preset and lifecycle routes', async () => {
    const app = new Hono()
    app.route('/openapi.json', openapiRoute)

    const res = await app.request('/openapi.json')
    const body = JSON.parse(await res.text()) as {
      paths?: Record<string, unknown>
      components?: {
        schemas?: Record<string, { properties?: Record<string, { enum?: string[] }> }>
      }
    }

    expect(body.paths?.['/v1/webhooks/presets']).toBeDefined()
    expect(body.paths?.['/v1/webhooks']).toBeDefined()
    expect(body.paths?.['/v1/webhooks/{id}']).toBeDefined()
    expect(body.paths?.['/v1/monitor/presets']).toBeDefined()
    expect(body.paths?.['/v1/monitor']).toBeDefined()
    expect(body.paths?.['/v1/monitor/{id}']).toBeDefined()
    expect(body.paths?.['/v1/score/erc8004']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator']).toBeDefined()
    expect(body.paths?.['/v1/certification/readiness']).toBeDefined()
    expect(body.paths?.['/v1/certification/directory']).toBeDefined()
    expect(body.paths?.['/v1/score/risk']).toBeDefined()
    expect(body.paths?.['/v1/cluster']).toBeDefined()
    expect(body.paths?.['/v1/rate']).toBeDefined()
    expect(body.paths?.['/v1/stake']).toBeDefined()
    expect(body.paths?.['/v1/data/economy/summary']).toBeDefined()
    expect(body.paths?.['/v1/data/economy/volume']).toBeDefined()
    expect(body.paths?.['/v1/data/economy/survival']).toBeDefined()
    expect(body.paths?.['/v1/data/decay']).toBeDefined()
    expect(body.paths?.['/v1/data/graph']).toBeDefined()
    expect(body.paths?.['/v1/data/intent']).toBeDefined()
    expect(body.paths?.['/v1/data/ratings']).toBeDefined()
    expect(body.components?.schemas?.WebhookPreset).toBeDefined()
    expect(body.components?.schemas?.WebhookForensicsFilter).toBeDefined()
    expect(body.components?.schemas?.MonitoringPreset).toBeDefined()
    expect(body.components?.schemas?.ERC8004CompatibleScoreResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorPreviewResponse).toBeDefined()
    expect(body.components?.schemas?.CertificationReadinessResponse).toBeDefined()
    expect(body.components?.schemas?.CertificationDirectoryResponse).toBeDefined()
    expect(body.components?.schemas?.RiskScoreResponse).toBeDefined()
    expect(body.components?.schemas?.ClusterResponse).toBeDefined()
    expect(body.components?.schemas?.EconomySummaryResponse).toBeDefined()
    expect(body.components?.schemas?.EconomyVolumeResponse).toBeDefined()
    expect(body.components?.schemas?.EconomySurvivalResponse).toBeDefined()
    expect(body.components?.schemas?.RatingRequest).toBeDefined()
    expect(body.components?.schemas?.RatingResponse).toBeDefined()
    expect(body.components?.schemas?.StakeRequest).toBeDefined()
    expect(body.components?.schemas?.StakeResponse).toBeDefined()
    expect(body.components?.schemas?.DataDecayResponse).toBeDefined()
    expect(body.components?.schemas?.DataGraphResponse).toBeDefined()
    expect(body.components?.schemas?.DataIntentResponse).toBeDefined()
    expect(body.components?.schemas?.DataRatingsResponse).toBeDefined()
    expect(body.components?.schemas?.WebhookPreset?.properties?.name?.enum).toContain('anomaly_monitoring')
    expect(body.components?.schemas?.MonitoringPreset?.properties?.policy_type?.enum).toContain('anomaly_monitoring')
  })
})
