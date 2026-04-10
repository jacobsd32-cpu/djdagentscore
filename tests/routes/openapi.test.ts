import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import openapiRoute from '../../src/routes/openapi.js'
import { getX402DiscoveryView } from '../../src/services/discoveryService.js'

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

    const body = JSON.parse(await res.text()) as { info?: { title?: string; description?: string } }
    expect(body.info?.title).toBe('DJD Agent Score API')
    expect(body.info?.version).toBe('2.5.0')
    expect(body.info?.description).toContain('Wallet screening and trust signals')
    expect(body.info?.description).toContain('payout and escrow flows')
  })

  it('keeps the basic score example aligned with the current runtime model version', async () => {
    const app = new Hono()
    app.route('/openapi.json', openapiRoute)

    const res = await app.request('/openapi.json')
    const body = JSON.parse(await res.text()) as {
      paths?: Record<
        string,
        { get?: { responses?: Record<string, { content?: Record<string, { example?: Record<string, unknown> }> }> } }
      >
    }

    expect(
      body.paths?.['/v1/score/basic']?.get?.responses?.['200']?.content?.['application/json']?.example,
    ).toMatchObject({
      score: 78,
      tier: 'Trusted',
      confidence: 0.85,
      recommendation: 'proceed',
      modelVersion: '2.5.0',
    })
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
    expect(body.paths?.['/v1/score/evaluator/verifier']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/networks']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/deployments']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/promotion']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/artifacts']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/proof']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/escrow']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/deploy']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/deploy/bundle']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/evidence']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/oracle']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/verdict']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/verdicts']).toBeDefined()
    expect(body.paths?.['/v1/score/evaluator/callback']).toBeDefined()
    expect(body.paths?.['/v1/certification/readiness']).toBeDefined()
    expect(body.paths?.['/v1/certification/review']).toBeDefined()
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
    expect(body.components?.schemas?.EvaluatorVerifierPackageResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorDeploymentRegistryResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorDeploymentPromotionResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorArtifactPackageResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorVerifierProofResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorEscrowSettlementResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorDeploymentPlanResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorDeploymentBundleResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorEvidencePacketResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorOracleResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorVerdictRecordResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorVerdictHistoryResponse).toBeDefined()
    expect(body.components?.schemas?.EvaluatorCallbackResponse).toBeDefined()
    expect(body.components?.schemas?.CertificationReadinessResponse).toBeDefined()
    expect(body.components?.schemas?.CertificationReviewResponse).toBeDefined()
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

  it('documents certification directory filters and response metadata', async () => {
    const app = new Hono()
    app.route('/openapi.json', openapiRoute)

    const res = await app.request('/openapi.json')
    const body = JSON.parse(await res.text()) as {
      paths?: Record<string, { get?: { parameters?: Array<{ name?: string }> } }>
      components?: {
        schemas?: Record<
          string,
          {
            properties?: Record<
              string,
              {
                properties?: Record<string, { enum?: string[] }>
              }
            >
          }
        >
      }
    }

    const directoryParams = body.paths?.['/v1/certification/directory']?.get?.parameters ?? []
    expect(directoryParams.some((parameter) => parameter.name === 'search')).toBe(true)
    expect(directoryParams.some((parameter) => parameter.name === 'sort')).toBe(true)
    expect(body.components?.schemas?.CertificationDirectoryResponse?.properties?.total).toBeDefined()
    expect(
      body.components?.schemas?.CertificationDirectoryResponse?.properties?.filters?.properties?.sort?.enum,
    ).toEqual(['score', 'confidence', 'recent', 'name'])
  })

  it('documents certification review request and status surfaces', async () => {
    const app = new Hono()
    app.route('/openapi.json', openapiRoute)

    const res = await app.request('/openapi.json')
    const body = JSON.parse(await res.text()) as {
      paths?: Record<string, { get?: object; post?: object }>
      components?: {
        schemas?: Record<string, { properties?: Record<string, { enum?: string[] }> }>
      }
    }

    expect(body.paths?.['/v1/certification/review']?.get).toBeDefined()
    expect(body.paths?.['/v1/certification/review']?.post).toBeDefined()
    expect(body.components?.schemas?.CertificationReviewRequest).toBeDefined()
    expect(body.components?.schemas?.CertificationReviewResponse).toBeDefined()
    expect(body.components?.schemas?.CertificationReviewResponse?.properties?.status?.enum).toEqual([
      'pending',
      'approved',
      'needs_info',
      'rejected',
    ])
  })

  it('documents ERC-8004 identity and publication metadata', async () => {
    const app = new Hono()
    app.route('/openapi.json', openapiRoute)

    const res = await app.request('/openapi.json')
    const body = JSON.parse(await res.text()) as {
      components?: {
        schemas?: Record<
          string,
          {
            properties?: Record<
              string,
              {
                properties?: Record<string, unknown>
              }
            >
          }
        >
      }
    }

    expect(
      body.components?.schemas?.ERC8004CompatibleScoreResponse?.properties?.identity?.properties?.erc8004_registered,
    ).toBeDefined()
    expect(
      body.components?.schemas?.ERC8004CompatibleScoreResponse?.properties?.identity?.properties
        ?.erc8004_registry_contract,
    ).toBeDefined()
    expect(
      body.components?.schemas?.ERC8004CompatibleScoreResponse?.properties?.publication?.properties?.feedback_hash,
    ).toBeDefined()
    expect(
      body.components?.schemas?.ERC8004CompatibleScoreResponse?.properties?.publication?.properties?.eligible_now,
    ).toBeDefined()
    expect(
      body.components?.schemas?.ERC8004CompatibleScoreResponse?.properties?.publication?.properties?.registry_contract,
    ).toBeDefined()
  })

  it('documents evaluator oracle and verdict history metadata', async () => {
    const app = new Hono()
    app.route('/openapi.json', openapiRoute)

    const res = await app.request('/openapi.json')
    const body = JSON.parse(await res.text()) as {
      paths?: Record<string, { get?: { parameters?: Array<{ name?: string }> } }>
      components?: {
        schemas?: Record<string, any>
      }
    }

    const oracleParams = body.paths?.['/v1/score/evaluator/oracle']?.get?.parameters ?? []
    const verdictParams = body.paths?.['/v1/score/evaluator/verdict']?.get?.parameters ?? []
    const verdictHistoryParams = body.paths?.['/v1/score/evaluator/verdicts']?.get?.parameters ?? []
    const callbackParams = body.paths?.['/v1/score/evaluator/callback']?.get?.parameters ?? []
    const verifierParams = body.paths?.['/v1/score/evaluator/verifier']?.get?.parameters ?? []
    const networksParams = body.paths?.['/v1/score/evaluator/networks']?.get?.parameters ?? []
    const deploymentsParams = body.paths?.['/v1/score/evaluator/deployments']?.get?.parameters ?? []
    const promotionParams = body.paths?.['/v1/score/evaluator/promotion']?.get?.parameters ?? []
    const artifactParams = body.paths?.['/v1/score/evaluator/artifacts']?.get?.parameters ?? []
    const proofParams = body.paths?.['/v1/score/evaluator/proof']?.get?.parameters ?? []
    const escrowParams = body.paths?.['/v1/score/evaluator/escrow']?.get?.parameters ?? []
    const deployParams = body.paths?.['/v1/score/evaluator/deploy']?.get?.parameters ?? []
    const bundleParams = body.paths?.['/v1/score/evaluator/deploy/bundle']?.get?.parameters ?? []

    expect(oracleParams.some((parameter) => parameter.name === 'counterparty_wallet')).toBe(true)
    expect(oracleParams.some((parameter) => parameter.name === 'escrow_id')).toBe(true)
    expect(oracleParams.some((parameter) => parameter.name === 'network')).toBe(true)
    expect(verdictParams.some((parameter) => parameter.name === 'id')).toBe(true)
    expect(verdictHistoryParams.some((parameter) => parameter.name === 'limit')).toBe(true)
    expect(callbackParams.some((parameter) => parameter.name === 'target_contract')).toBe(true)
    expect(callbackParams.some((parameter) => parameter.name === 'network')).toBe(true)
    expect(verifierParams.some((parameter) => parameter.name === 'network')).toBe(true)
    expect(networksParams.length).toBe(0)
    expect(deploymentsParams.some((parameter) => parameter.name === 'network')).toBe(true)
    expect(promotionParams.some((parameter) => parameter.name === 'network')).toBe(true)
    expect(artifactParams.length).toBe(0)
    expect(proofParams.some((parameter) => parameter.name === 'id')).toBe(true)
    expect(proofParams.some((parameter) => parameter.name === 'target_contract')).toBe(true)
    expect(proofParams.some((parameter) => parameter.name === 'network')).toBe(true)
    expect(escrowParams.some((parameter) => parameter.name === 'id')).toBe(true)
    expect(escrowParams.some((parameter) => parameter.name === 'escrow_contract')).toBe(true)
    expect(escrowParams.some((parameter) => parameter.name === 'network')).toBe(true)
    expect(deployParams.some((parameter) => parameter.name === 'id')).toBe(true)
    expect(deployParams.some((parameter) => parameter.name === 'verifier_contract')).toBe(true)
    expect(deployParams.some((parameter) => parameter.name === 'network')).toBe(true)
    expect(bundleParams.some((parameter) => parameter.name === 'id')).toBe(true)
    expect(bundleParams.some((parameter) => parameter.name === 'verifier_contract')).toBe(true)
    expect(bundleParams.some((parameter) => parameter.name === 'network')).toBe(true)
    expect(body.components?.schemas?.EvaluatorVerifierPackageResponse?.properties?.contracts).toBeDefined()
    expect(body.components?.schemas?.EvaluatorNetworkCatalogResponse?.properties?.supported_networks).toBeDefined()
    expect(body.components?.schemas?.EvaluatorDeploymentRegistryResponse?.properties?.networks).toBeDefined()
    expect(body.components?.schemas?.EvaluatorDeploymentPromotionResponse?.properties?.outputs).toBeDefined()
    expect(body.components?.schemas?.EvaluatorVerifierPackageResponse?.properties?.signing).toBeDefined()
    expect(body.components?.schemas?.EvaluatorArtifactPackageResponse?.properties?.summary).toBeDefined()
    expect(body.components?.schemas?.EvaluatorVerifierProofResponse?.properties?.call).toBeDefined()
    expect(body.components?.schemas?.EvaluatorVerifierProofResponse?.properties?.resolution).toBeDefined()
    expect(body.components?.schemas?.EvaluatorEscrowSettlementResponse?.properties?.settlement).toBeDefined()
    expect(body.components?.schemas?.EvaluatorEscrowSettlementResponse?.properties?.resolution).toBeDefined()
    expect(body.components?.schemas?.EvaluatorDeploymentPlanResponse?.properties?.escrow).toBeDefined()
    expect(body.components?.schemas?.EvaluatorDeploymentBundleResponse?.properties?.deployment).toBeDefined()
    expect(
      body.components?.schemas?.EvaluatorDeploymentPlanResponse?.properties?.escrow?.properties?.constructor?.properties
        ?.escrow_id,
    ).toBeDefined()
    expect(
      body.components?.schemas?.EvaluatorDeploymentPlanResponse?.properties?.escrow?.properties?.constructor?.properties
        ?.verifier_source,
    ).toBeDefined()
    expect(
      body.components?.schemas?.EvaluatorDeploymentBundleResponse?.properties?.deployment?.properties?.escrow
        ?.properties?.constructor?.properties?.escrow_id,
    ).toBeDefined()
    expect(body.components?.schemas?.EvaluatorOracleResponse?.properties?.sla_metrics).toBeDefined()
    expect(body.components?.schemas?.EvaluatorOracleResponse?.properties?.attestation).toBeDefined()
    expect(body.components?.schemas?.EvaluatorCallbackResponse?.properties?.callback).toBeDefined()
    expect(body.components?.schemas?.EvaluatorVerdictRecordResponse?.properties?.recorded_at).toBeDefined()
    expect(body.components?.schemas?.EvaluatorVerdictHistoryResponse?.properties?.summary).toBeDefined()
    expect(
      body.components?.schemas?.EvaluatorVerdictHistoryResponse?.properties?.items?.items?.properties
        ?.attestation_status,
    ).toBeDefined()
  })

  it('keeps the x402 discovery view on the same version and example values', () => {
    const discovery = getX402DiscoveryView('https://djdagentscore.dev')

    expect(discovery.service.version).toBe('2.5.0')
    expect(discovery.endpoints[0]?.output?.example).toMatchObject({
      score: 78,
      tier: 'Trusted',
      recommendation: 'proceed',
    })
    expect(discovery.endpoints[1]?.output?.example?.reputation).toMatchObject({
      composite_score: 78,
      tier: 'Trusted',
      confidence: 0.85,
    })
  })
})
