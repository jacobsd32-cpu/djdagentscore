import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  validWallet: '0x1234567890abcdef1234567890abcdef12345678',
  secondWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  scoreResult: {
    wallet: '0x1234567890abcdef1234567890abcdef12345678',
    score: 82,
    tier: 'Trusted',
    confidence: 0.92,
    recommendation: 'keep shipping',
    modelVersion: '2.0.0',
    lastUpdated: '2026-03-12T00:00:00.000Z',
    computedAt: '2026-03-12T00:00:00.000Z',
    scoreFreshness: 1,
    dataSource: 'live',
    sybilFlag: false,
    gamingIndicators: [],
    dimensions: {
      reliability: { score: 80, data: {} },
      viability: { score: 81, data: {} },
      identity: { score: 83, data: { erc8004Registered: false } },
      capability: { score: 84, data: {} },
    },
    dataAvailability: {
      transactionHistory: 'high',
      walletAge: 'high',
      economicData: 'high',
      identityData: 'medium',
      communityData: 'low',
    },
    scoreHistory: [],
  },
  submitJob: vi.fn(() => '123e4567-e89b-42d3-a456-426614174000'),
  getJob: vi.fn(),
  getOrCalculateScore: vi.fn(),
  getScore: vi.fn(),
  getRegistration: vi.fn(),
  getActiveCertification: vi.fn(),
  getReputationPublication: vi.fn(),
  insertEvaluatorVerdict: vi.fn(),
  getEvaluatorVerdict: vi.fn(),
  listEvaluatorVerdictsByWallet: vi.fn(),
  countScoreHistory: vi.fn(),
  listFraudReportsByTarget: vi.fn(),
  countFraudReportsByTarget: vi.fn(),
  countDistinctReportersByTarget: vi.fn(),
  sumFraudPenaltyByTarget: vi.fn(),
  countFraudDisputesByTarget: vi.fn(),
  getFraudReasonBreakdown: vi.fn(),
  getRatingsSummaryForWallet: vi.fn(),
  getIntentSummaryByTarget: vi.fn(),
  getCreatorStakeSummary: vi.fn(),
  listFraudPatternsByNames: vi.fn(),
}))

const VALID_WALLET = state.validWallet
const SECOND_WALLET = state.secondWallet
const ORIGINAL_ORACLE_SIGNER_PRIVATE_KEY = process.env.ORACLE_SIGNER_PRIVATE_KEY
const ORIGINAL_DEPLOYMENTS_PATH = process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH

vi.mock('../../src/scoring/engine.js', () => ({
  getOrCalculateScore: state.getOrCalculateScore,
}))

vi.mock('../../src/jobs/scoreQueue.js', () => ({
  submitJob: state.submitJob,
  getJob: state.getJob,
}))

vi.mock('../../src/db.js', () => ({
  getScore: (...args: unknown[]) => state.getScore(...args),
  getRegistration: (...args: unknown[]) => state.getRegistration(...args),
  getActiveCertification: (...args: unknown[]) => state.getActiveCertification(...args),
  getReputationPublication: (...args: unknown[]) => state.getReputationPublication(...args),
  insertEvaluatorVerdict: (...args: unknown[]) => state.insertEvaluatorVerdict(...args),
  getEvaluatorVerdict: (...args: unknown[]) => state.getEvaluatorVerdict(...args),
  listEvaluatorVerdictsByWallet: (...args: unknown[]) => state.listEvaluatorVerdictsByWallet(...args),
  countScoreHistory: (...args: unknown[]) => state.countScoreHistory(...args),
  listFraudReportsByTarget: (...args: unknown[]) => state.listFraudReportsByTarget(...args),
  countFraudReportsByTarget: (...args: unknown[]) => state.countFraudReportsByTarget(...args),
  countDistinctReportersByTarget: (...args: unknown[]) => state.countDistinctReportersByTarget(...args),
  sumFraudPenaltyByTarget: (...args: unknown[]) => state.sumFraudPenaltyByTarget(...args),
  countFraudDisputesByTarget: (...args: unknown[]) => state.countFraudDisputesByTarget(...args),
  getFraudReasonBreakdown: (...args: unknown[]) => state.getFraudReasonBreakdown(...args),
  getRatingsSummaryForWallet: (...args: unknown[]) => state.getRatingsSummaryForWallet(...args),
  getIntentSummaryByTarget: (...args: unknown[]) => state.getIntentSummaryByTarget(...args),
  getCreatorStakeSummary: (...args: unknown[]) => state.getCreatorStakeSummary(...args),
  listFraudPatternsByNames: (...args: unknown[]) => state.listFraudPatternsByNames(...args),
}))

describe('score routes', () => {
  beforeEach(() => {
    state.getOrCalculateScore.mockReset()
    state.submitJob.mockClear()
    state.getJob.mockReset()
    state.getOrCalculateScore.mockResolvedValue({ ...state.scoreResult })
    state.getScore.mockReset()
    state.getRegistration.mockReset()
    state.getActiveCertification.mockReset()
    state.getReputationPublication.mockReset()
    state.insertEvaluatorVerdict.mockReset()
    state.getEvaluatorVerdict.mockReset()
    state.listEvaluatorVerdictsByWallet.mockReset()
    state.countScoreHistory.mockReset()
    state.listFraudReportsByTarget.mockReset()
    state.countFraudReportsByTarget.mockReset()
    state.countDistinctReportersByTarget.mockReset()
    state.sumFraudPenaltyByTarget.mockReset()
    state.countFraudDisputesByTarget.mockReset()
    state.getFraudReasonBreakdown.mockReset()
    state.getRatingsSummaryForWallet.mockReset()
    state.getIntentSummaryByTarget.mockReset()
    state.getCreatorStakeSummary.mockReset()
    state.listFraudPatternsByNames.mockReset()

    state.getScore.mockReturnValue({
      sybil_indicators: '[]',
      gaming_indicators: '[]',
    })
    state.getRegistration.mockReturnValue(undefined)
    state.getActiveCertification.mockReturnValue(undefined)
    state.getReputationPublication.mockReturnValue(undefined)
    state.insertEvaluatorVerdict.mockImplementation(() => undefined)
    state.getEvaluatorVerdict.mockReturnValue(undefined)
    state.listEvaluatorVerdictsByWallet.mockReturnValue([])
    state.countScoreHistory.mockReturnValue(0)
    state.listFraudReportsByTarget.mockReturnValue([])
    state.countFraudReportsByTarget.mockReturnValue(0)
    state.countDistinctReportersByTarget.mockReturnValue(0)
    state.sumFraudPenaltyByTarget.mockReturnValue(0)
    state.countFraudDisputesByTarget.mockReturnValue(0)
    state.getFraudReasonBreakdown.mockReturnValue([])
    state.getRatingsSummaryForWallet.mockReturnValue({
      rating_count: 0,
      unique_raters: 0,
      average_rating: null,
      most_recent_rating_at: null,
    })
    state.getIntentSummaryByTarget.mockReturnValue({
      intent_count: 0,
      conversions: 0,
      conversion_rate: 0,
      avg_time_to_tx_ms: null,
      most_recent_query_at: null,
      most_recent_conversion_at: null,
    })
    state.getCreatorStakeSummary.mockReturnValue({
      active_stake_count: 0,
      active_staked_amount: 0,
      active_score_boost: 0,
      slashed_stake_count: 0,
      slashed_staked_amount: 0,
      most_recent_stake_at: null,
    })
    state.listFraudPatternsByNames.mockReturnValue([])

    if (ORIGINAL_ORACLE_SIGNER_PRIVATE_KEY === undefined) {
      delete process.env.ORACLE_SIGNER_PRIVATE_KEY
    } else {
      process.env.ORACLE_SIGNER_PRIVATE_KEY = ORIGINAL_ORACLE_SIGNER_PRIVATE_KEY
    }

    if (ORIGINAL_DEPLOYMENTS_PATH === undefined) {
      delete process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH
    } else {
      process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = ORIGINAL_DEPLOYMENTS_PATH
    }
  })

  afterEach(() => {
    if (ORIGINAL_ORACLE_SIGNER_PRIVATE_KEY === undefined) {
      delete process.env.ORACLE_SIGNER_PRIVATE_KEY
    } else {
      process.env.ORACLE_SIGNER_PRIVATE_KEY = ORIGINAL_ORACLE_SIGNER_PRIVATE_KEY
    }

    if (ORIGINAL_DEPLOYMENTS_PATH === undefined) {
      delete process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH
    } else {
      process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = ORIGINAL_DEPLOYMENTS_PATH
    }
  })

  it('returns a basic score response', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/basic?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.score).toBe(82)
    expect(body.dataSource).toBe('live')
    expect(body.dimensions).toBeUndefined()
  })

  it('returns 400 for an invalid wallet on basic score', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/basic?wallet=bad-wallet')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_wallet')
  })

  it('returns a full score response', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/full?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.dimensions).toBeDefined()
  })

  it('returns an ERC-8004-compatible score document', async () => {
    state.getOrCalculateScore.mockResolvedValueOnce({
      ...state.scoreResult,
      dimensions: {
        ...state.scoreResult.dimensions,
        identity: {
          ...state.scoreResult.dimensions.identity,
          data: { erc8004Registered: true },
        },
      },
    })
    state.getRegistration.mockReturnValueOnce({
      wallet: VALID_WALLET,
      name: 'DJD Agent',
      description: 'A certified x402 endpoint',
      github_url: 'https://github.com/example/djd-agent',
      website_url: 'https://agent.example.test',
      registered_at: '2026-03-10T00:00:00.000Z',
      updated_at: '2026-03-12T00:00:00.000Z',
      github_verified: 1,
      github_stars: 42,
      github_pushed_at: '2026-03-11T00:00:00.000Z',
      github_verified_at: '2026-03-11T00:00:00.000Z',
    })
    state.getActiveCertification.mockReturnValueOnce({
      id: 1,
      wallet: VALID_WALLET,
      tier: 'Trusted',
      score_at_certification: 82,
      granted_at: '2026-03-12T00:00:00.000Z',
      expires_at: '2027-03-12T00:00:00.000Z',
      is_active: 1,
      tx_hash: '0xfeedface',
      revoked_at: null,
      revocation_reason: null,
    })
    state.getReputationPublication.mockReturnValueOnce({
      wallet: VALID_WALLET,
      composite_score: 82,
      model_version: '2.0.0',
      endpoint: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
      feedback_hash: '0xabc123',
      tx_hash: '0xbead',
      published_at: '2026-03-12T01:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/erc8004?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('erc-8004-compatible')
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.agent_id).toBe(BigInt(VALID_WALLET).toString())
    expect(body.provider.model_version).toBe('2.0.0')
    expect(body.reputation.composite_score).toBe(82)
    expect(body.identity.registered).toBe(true)
    expect(body.identity.erc8004_registered).toBe(true)
    expect(body.identity.erc8004_registry_configured).toBe(false)
    expect(body.identity.erc8004_registry_contract).toBe(null)
    expect(body.identity.github_verified).toBe(true)
    expect(body.certification.active).toBe(true)
    expect(body.certification.tier).toBe('Trusted')
    expect(body.publication.published).toBe(true)
    expect(body.publication.registry).toBe('erc-8004')
    expect(body.publication.network).toBe('base')
    expect(body.publication.chain_id).toBe(8453)
    expect(body.publication.registry_contract).toBe('0x8004BAa17C55a88189AE136b182e5fdA19dE9b63')
    expect(body.publication.endpoint).toContain(`/v1/score/erc8004?wallet=${VALID_WALLET}`)
    expect(body.publication.feedback_hash).toBe('0xabc123')
    expect(body.publication.eligible_now).toBe(false)
    expect(body.publication.eligibility_reasons).toContain('score_change_below_threshold')
    expect(body.links.certification_status).toContain(`/v1/certification/${VALID_WALLET}`)
  })

  it('returns an ERC-8183 evaluator preview', async () => {
    state.getRegistration.mockReturnValueOnce({
      wallet: VALID_WALLET,
      name: 'DJD Agent',
      description: 'A certified x402 endpoint',
      github_url: 'https://github.com/example/djd-agent',
      website_url: 'https://agent.example.test',
      registered_at: '2026-03-10T00:00:00.000Z',
      updated_at: '2026-03-12T00:00:00.000Z',
      github_verified: 1,
      github_stars: 42,
      github_pushed_at: '2026-03-11T00:00:00.000Z',
      github_verified_at: '2026-03-11T00:00:00.000Z',
    })
    state.getActiveCertification.mockReturnValueOnce({
      id: 1,
      wallet: VALID_WALLET,
      tier: 'Trusted',
      score_at_certification: 82,
      granted_at: '2026-03-12T00:00:00.000Z',
      expires_at: '2027-03-12T00:00:00.000Z',
      is_active: 1,
      tx_hash: '0xfeedface',
      revoked_at: null,
      revocation_reason: null,
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/evaluator?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('erc-8183-evaluator-prototype')
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.decision).toBe('approve')
    expect(body.certification.active).toBe(true)
    expect(body.risk.risk_level).toBe('clear')
    expect(body.market_signals.active_creator_stakes).toBe(0)
    expect(
      body.checks.some(
        (check: { key: string; status: string }) => check.key === 'risk_guardrail' && check.status === 'pass',
      ),
    ).toBe(true)
    expect(body.links.standards_document).toContain(`/v1/score/erc8004?wallet=${VALID_WALLET}`)
    expect(body.links.evidence_packet).toContain(`/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`)
  })

  it('returns an ERC-8183 evaluator evidence packet', async () => {
    state.getRegistration.mockReturnValueOnce({
      wallet: VALID_WALLET,
      name: 'DJD Agent',
      description: 'A certified x402 endpoint',
      github_url: 'https://github.com/example/djd-agent',
      website_url: 'https://agent.example.test',
      registered_at: '2026-03-10T00:00:00.000Z',
      updated_at: '2026-03-12T00:00:00.000Z',
      github_verified: 1,
      github_stars: 42,
      github_pushed_at: '2026-03-11T00:00:00.000Z',
      github_verified_at: '2026-03-11T00:00:00.000Z',
    })
    state.getActiveCertification.mockReturnValueOnce({
      id: 1,
      wallet: VALID_WALLET,
      tier: 'Transactional',
      score_at_certification: 82,
      granted_at: '2026-03-12T00:00:00.000Z',
      expires_at: '2027-03-12T00:00:00.000Z',
      is_active: 1,
      tx_hash: '0xfeedface',
      revoked_at: null,
      revocation_reason: null,
    })
    state.countScoreHistory.mockReturnValueOnce(6)
    state.listFraudReportsByTarget.mockReturnValueOnce([
      {
        id: 'report-1',
        reason: 'payment_fraud',
        created_at: '2026-03-11T00:00:00.000Z',
        penalty_applied: 5,
      },
    ])

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('erc-8183-evaluator-evidence-prototype')
    expect(body.packet_id).toContain('evidence_')
    expect(body.packet_hash).toMatch(/^0x[a-f0-9]{64}$/)
    expect(body.evaluator.decision).toBe('approve')
    expect(body.baseline.profile).toBe('djd-transactional-settlement-v1')
    expect(body.evidence.forensics.score_history_entries).toBe(6)
    expect(body.evidence.forensics.recent_reports[0].report_id).toBe('report-1')
    expect(body.links.evaluator_preview).toContain(`/v1/score/evaluator?wallet=${VALID_WALLET}`)
    expect(
      body.artifacts.some(
        (artifact: { key: string; category: string }) =>
          artifact.key === 'forensics_summary' && artifact.category === 'forensics',
      ),
    ).toBe(true)
  })

  it('returns an ERC-8183 evaluator oracle verdict and persists the record', async () => {
    process.env.ORACLE_SIGNER_PRIVATE_KEY =
      '0x59c6995e998f97a5a0044966f094538c5f43e8e66b5b4bafee8a8b3eabeed4e4'
    state.getRegistration.mockReturnValueOnce({
      wallet: VALID_WALLET,
      name: 'DJD Agent',
      description: 'A certified x402 endpoint',
      github_url: 'https://github.com/example/djd-agent',
      website_url: 'https://agent.example.test',
      registered_at: '2026-03-10T00:00:00.000Z',
      updated_at: '2026-03-12T00:00:00.000Z',
      github_verified: 1,
      github_stars: 42,
      github_pushed_at: '2026-03-11T00:00:00.000Z',
      github_verified_at: '2026-03-11T00:00:00.000Z',
    })
    state.getActiveCertification.mockReturnValueOnce({
      id: 1,
      wallet: VALID_WALLET,
      tier: 'Transactional',
      score_at_certification: 82,
      granted_at: '2026-03-12T00:00:00.000Z',
      expires_at: '2027-03-12T00:00:00.000Z',
      is_active: 1,
      tx_hash: '0xfeedface',
      revoked_at: null,
      revocation_reason: null,
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(
      `/v1/score/evaluator/oracle?wallet=${VALID_WALLET}&counterparty_wallet=${SECOND_WALLET}&escrow_id=escrow-123`,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('erc-8183-evaluator-oracle-prototype')
    expect(body.verdict_id).toContain('verdict_')
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.counterparty_wallet).toBe(SECOND_WALLET)
    expect(body.escrow_id).toBe('escrow-123')
    expect(body.recommendation).toBe('release')
    expect(body.approved).toBe(true)
    expect(body.confidence).toBeGreaterThan(0)
    expect(body.attestation.status).toBe('signed')
    expect(body.attestation.scheme).toBe('eip712')
    expect(body.attestation.source).toBe('oracle_signer')
    expect(body.attestation.signer).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(body.attestation.signature).toMatch(/^0x[a-fA-F0-9]{130}$/)
    expect(body.attestation.digest).toMatch(/^0x[a-fA-F0-9]{64}$/)
    expect(body.attestation.typed_data.domain.chainId).toBe(8453)
    expect(body.attestation.typed_data.message.wallet).toBe(VALID_WALLET)
    expect(body.links.verdict_record).toContain(encodeURIComponent(body.verdict_id))
    expect(body.links.verdict_history).toContain(`/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`)
    expect(state.insertEvaluatorVerdict).toHaveBeenCalledTimes(1)
    expect(state.insertEvaluatorVerdict.mock.calls[0]?.[0]).toMatchObject({
      id: body.verdict_id,
      wallet: VALID_WALLET,
      counterparty_wallet: SECOND_WALLET,
      escrow_id: 'escrow-123',
      recommendation: 'release',
      approved: 1,
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_signer: body.attestation.signer,
    })
  })

  it('issues a Base Sepolia oracle verdict when the network is requested explicitly', async () => {
    process.env.ORACLE_SIGNER_PRIVATE_KEY = '0x' + '1'.repeat(64)

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/evaluator/oracle?wallet=${VALID_WALLET}&network=base-sepolia`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.attestation.typed_data.domain.chainId).toBe(84532)
    expect(body.attestation.typed_data.domain.name).toBe('DJD Evaluator Verdict')
    expect(state.insertEvaluatorVerdict).toHaveBeenCalledTimes(1)
    const inserted = state.insertEvaluatorVerdict.mock.calls[0]?.[0]
    expect(JSON.parse(inserted.payload_json).attestation.typed_data.domain.chainId).toBe(84532)
  })

  it('returns a stored evaluator verdict record', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_123',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_123',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-123',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 86,
        agent_score_provider: 82,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 8,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_1234567890abcdef',
        packet_hash: '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T02:00:00.000Z',
        attestation: {
          status: 'signed',
          scheme: 'eip712',
          source: 'oracle_signer',
          signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
          signature: '0x' + 'a'.repeat(130),
          digest: '0x' + 'b'.repeat(64),
          issued_at: '2026-03-12T02:00:00.000Z',
          reason: null,
          typed_data: {
            domain: { name: 'DJD Evaluator Verdict', version: '1', chainId: 8453 },
            primaryType: 'EvaluatorVerdict',
            types: {
              EvaluatorVerdict: [
                { name: 'verdictId', type: 'string' },
                { name: 'wallet', type: 'address' },
              ],
            },
            message: {
              verdictId: 'verdict_123',
              wallet: VALID_WALLET,
              counterpartyWallet: SECOND_WALLET,
              escrowId: 'escrow-123',
              decision: 'approve',
              recommendation: 'release',
              approved: true,
              confidence: 86,
              agentScoreProvider: 82,
              scoreModelVersion: '2.0.0',
              certificationValid: true,
              certificationTier: 'Transactional',
              riskLevel: 'clear',
              riskScore: 8,
              forensicTraceId: 'trace_1234567890abcdef',
              packetHash: '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
              generatedAt: '2026-03-12T02:00:00.000Z',
            },
          },
        },
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_123',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + 'b'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T02:00:00.000Z',
      created_at: '2026-03-12T02:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/verdict?id=verdict_123')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verdict_id).toBe('verdict_123')
    expect(body.recorded_at).toBe('2026-03-12T02:00:00.000Z')
    expect(body.recommendation).toBe('release')
    expect(body.attestation.status).toBe('signed')
    expect(body.attestation.signature).toMatch(/^0x[a]+$/)
    expect(body.links.verdict_history).toContain(`/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`)
  })

  it('returns contract callback calldata for a signed evaluator verdict', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_123',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_123',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-123',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 86,
        agent_score_provider: 82,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 8,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_1234567890abcdef',
        packet_hash: '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T02:00:00.000Z',
        attestation: {
          status: 'signed',
          scheme: 'eip712',
          source: 'oracle_signer',
          signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
          signature: '0x' + 'a'.repeat(130),
          digest: '0x' + 'b'.repeat(64),
          issued_at: '2026-03-12T02:00:00.000Z',
          reason: null,
          typed_data: {
            domain: { name: 'DJD Evaluator Verdict', version: '1', chainId: 8453 },
            primaryType: 'EvaluatorVerdict',
            types: { EvaluatorVerdict: [{ name: 'verdictId', type: 'string' }] },
            message: {
              verdictId: 'verdict_123',
              wallet: VALID_WALLET,
              counterpartyWallet: SECOND_WALLET,
              escrowId: 'escrow-123',
              decision: 'approve',
              recommendation: 'release',
              approved: true,
              confidence: 86,
              agentScoreProvider: 82,
              scoreModelVersion: '2.0.0',
              certificationValid: true,
              certificationTier: 'Transactional',
              riskLevel: 'clear',
              riskScore: 8,
              forensicTraceId: 'trace_1234567890abcdef',
              packetHash: '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
              generatedAt: '2026-03-12T02:00:00.000Z',
            },
          },
        },
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_123',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + 'b'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T02:00:00.000Z',
      created_at: '2026-03-12T02:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(
      `/v1/score/evaluator/callback?id=verdict_123&target_contract=${SECOND_WALLET}`,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-oracle-callback-v1')
    expect(body.ready).toBe(true)
    expect(body.interface.contract).toBe('IDJDEvaluatorOracleCallback')
    expect(body.interface.function).toBe('receiveVerdict')
    expect(body.verdict.verdict_id).toBeUndefined()
    expect(body.verdict.decision_code).toBe(0)
    expect(body.verdict.recommendation_code).toBe(0)
    expect(body.verification.status).toBe('signed')
    expect(body.callback.selector).toMatch(/^0x[a-f0-9]{8}$/)
    expect(body.callback.calldata).toMatch(/^0x[a-f0-9]+$/)
    expect(body.callback.args.provider).toBe(VALID_WALLET)
    expect(body.callback.args.counterparty).toBe(SECOND_WALLET)
    expect(body.transaction.to).toBe(SECOND_WALLET)
    expect(body.transaction.data).toBe(body.callback.calldata)
  })

  it('returns an unsigned callback envelope when a verdict lacks a signed attestation', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_456',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_456',
        wallet: VALID_WALLET,
        counterparty_wallet: null,
        escrow_id: null,
        decision: 'review',
        approved: false,
        recommendation: 'manual_review',
        confidence: 61,
        agent_score_provider: 61,
        score_model_version: '2.0.0',
        certification_valid: false,
        certification_tier: null,
        risk_level: 'elevated',
        risk_score: 44,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: false,
          certification_floor: 'Transactional',
          certification_floor_passed: false,
          risk_guardrail_passed: false,
          dispute_guardrail_passed: true,
          failed_checks: ['score_strength'],
          review_checks: ['certification'],
        },
        forensic_trace_id: 'trace_abcdef1234567890',
        packet_hash: '0xdef123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T03:00:00.000Z',
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_456',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'unsigned',
      attestation_digest: '0x' + 'd'.repeat(64),
      attestation_signature: null,
      attestation_signer: null,
      attestation_reason: 'No oracle signing key configured',
      attested_at: '2026-03-12T03:00:00.000Z',
      created_at: '2026-03-12T03:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/callback?id=verdict_456')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ready).toBe(false)
    expect(body.reason).toBe('verdict_attestation_unsigned')
    expect(body.verification.status).toBe('unsigned')
    expect(body.callback.selector).toBe(null)
    expect(body.callback.calldata).toBe(null)
    expect(body.transaction.data).toBe(null)
    expect(body.callback.args.counterparty).toBe('0x0000000000000000000000000000000000000000')
  })

  it('returns a verifier integration package for onchain consumers', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/verifier')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-verifier-package-v1')
    expect(body.network.chain_id).toBe(8453)
    expect(body.network.key).toBe('base')
    expect(body.signing.scheme).toBe('eip712')
    expect(body.signing.primary_type).toBe('EvaluatorVerdict')
    expect(body.signing.domain.chainId).toBe(8453)
    expect(body.contracts.callback_interface.contract).toBe('IDJDEvaluatorOracleCallback')
    expect(body.contracts.callback_interface.selector).toMatch(/^0x[a-f0-9]{8}$/)
    expect(body.contracts.verifier.contract).toBe('DJDEvaluatorVerdictVerifier')
    expect(body.contracts.verifier.methods.verify_verdict.selector).toMatch(/^0x[a-f0-9]{8}$/)
    expect(body.contracts.settlement_example.contract).toBe('DJDEvaluatorEscrowSettlementExample')
    expect(body.contracts.settlement_example.selector).toMatch(/^0x[a-f0-9]{8}$/)
    expect(body.contracts.sources.some((source: { path: string }) => source.path === 'contracts/IDJDEvaluatorOracleCallback.sol')).toBe(true)
    expect(
      body.contracts.sources.some(
        (source: { path: string }) => source.path === 'contracts/DJDEvaluatorEscrowSettlementExample.sol',
      ),
    ).toBe(true)
    expect(
      body.contracts.sources.some(
        (source: { source: string }) => source.source.includes('contract DJDEvaluatorVerdictVerifier'),
      ),
    ).toBe(true)
    expect(body.endpoints.callback_calldata).toContain('/v1/score/evaluator/callback?id=verdict_')
    expect(body.endpoints.deployment_registry).toContain('/v1/score/evaluator/deployments?network=base')
    expect(body.endpoints.escrow_settlement).toContain('/v1/score/evaluator/escrow?id=verdict_')
    expect(body.endpoints.deploy_plan).toContain('/v1/score/evaluator/deploy?id=verdict_')
    expect(body.endpoints.verifier_proof).toContain('network=base')
    expect(body.notes.some((note: string) => note.includes('relay helper'))).toBe(true)
  })

  it('returns a Base Sepolia verifier package and supported network catalog', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const verifierRes = await app.request('/v1/score/evaluator/verifier?network=base-sepolia')
    expect(verifierRes.status).toBe(200)
    const verifierBody = await verifierRes.json()
    expect(verifierBody.network.key).toBe('base-sepolia')
    expect(verifierBody.network.chain_id).toBe(84532)
    expect(verifierBody.signing.domain.chainId).toBe(84532)
    expect(verifierBody.endpoints.oracle_verdict).toContain('network=base-sepolia')

    const networksRes = await app.request('/v1/score/evaluator/networks')
    expect(networksRes.status).toBe(200)
    const networksBody = await networksRes.json()
    expect(networksBody.standard).toBe('djd-evaluator-network-catalog-v1')
    expect(networksBody.default_network.key).toBe('base')
    expect(networksBody.supported_networks.some((network: { key: string }) => network.key === 'base')).toBe(true)
    expect(networksBody.supported_networks.some((network: { key: string }) => network.key === 'base-sepolia')).toBe(
      true,
    )
    expect(
      networksBody.supported_networks.some(
        (network: { key: string; deployment: { deployment_registry: string } }) =>
          network.key === 'base-sepolia' &&
          network.deployment.deployment_registry.includes('/v1/score/evaluator/deployments?network=base-sepolia'),
      ),
    ).toBe(true)
  })

  it('returns the published evaluator deployment registry', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-deployments-route-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')
    process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = registryPath

    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          standard: 'djd-evaluator-deployment-registry-v1',
          updated_at: '2026-03-16T02:00:00.000Z',
          deployments: {
            'base-sepolia': {
              published_at: '2026-03-16T02:00:00.000Z',
              network: {
                key: 'base-sepolia',
                chain_id: 84532,
                chain_name: 'Base Sepolia',
                caip2: 'eip155:84532',
                environment: 'testnet',
              },
              verdict_id: 'verdict_live_stage_1',
              deployer: SECOND_WALLET,
              contracts: {
                verifier: {
                  contract: 'DJDEvaluatorVerdictVerifier',
                  address: VALID_WALLET,
                  tx_hash: '0x' + 'a'.repeat(64),
                  action: 'deploy',
                },
                escrow: {
                  contract: 'DJDEvaluatorEscrowSettlementExample',
                  address: SECOND_WALLET,
                  tx_hash: '0x' + 'b'.repeat(64),
                  action: 'deploy',
                },
              },
              verification: {
                oracle_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
                escrow_verifier: VALID_WALLET,
                escrow_provider: VALID_WALLET,
                escrow_counterparty: SECOND_WALLET,
                escrow_id_hash: '0x' + 'c'.repeat(64),
              },
              inputs: {
                network_key: 'base-sepolia',
                provider: VALID_WALLET,
                counterparty: SECOND_WALLET,
                escrow_id: 'escrow-live-123',
              },
              explorer: {
                verifier_address: `https://sepolia.basescan.org/address/${VALID_WALLET}`,
                verifier_transaction: `https://sepolia.basescan.org/tx/${'0x' + 'a'.repeat(64)}`,
                escrow_address: `https://sepolia.basescan.org/address/${SECOND_WALLET}`,
                escrow_transaction: `https://sepolia.basescan.org/tx/${'0x' + 'b'.repeat(64)}`,
              },
              links: {
                verifier_package: 'https://example.test/v1/score/evaluator/verifier?network=base-sepolia',
                verifier_proof: 'https://example.test/v1/score/evaluator/proof?id=verdict_live_stage_1&network=base-sepolia',
                escrow_settlement:
                  'https://example.test/v1/score/evaluator/escrow?id=verdict_live_stage_1&network=base-sepolia',
                artifact_package: 'https://example.test/v1/score/evaluator/artifacts',
                bundle:
                  'https://example.test/v1/score/evaluator/deploy/bundle?id=verdict_live_stage_1&network=base-sepolia',
              },
              checks: {
                preflight: true,
                verified: true,
                smoked: true,
                health: null,
                staged: true,
              },
            },
          },
        },
        null,
        2,
      ) + '\n',
    )

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/deployments?network=base-sepolia')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-deployments-v1')
    expect(body.registry.available).toBe(true)
    expect(body.registry.deployment_count).toBe(1)
    expect(body.filter.network).toBe('base-sepolia')
    expect(body.networks).toHaveLength(1)
    expect(body.networks[0].deployed).toBe(true)
    expect(body.networks[0].deployment.verdict_id).toBe('verdict_live_stage_1')
    expect(body.networks[0].deployment.contracts.verifier.address).toBe(VALID_WALLET)
    expect(body.networks[0].deployment.contracts.escrow.address).toBe(SECOND_WALLET)
    expect(body.networks[0].deployment.checks.smoked).toBe(true)
    expect(body.networks[0].deployment.links.deployment_registry).toContain(
      '/v1/score/evaluator/deployments?network=base-sepolia',
    )
  })

  it('returns a promotion bundle for the active published evaluator deployment', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-evaluator-promotion-route-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')
    process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = registryPath

    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          standard: 'djd-evaluator-deployment-registry-v1',
          updated_at: '2026-03-16T10:00:00.000Z',
          deployments: {
            'base-sepolia': {
              published_at: '2026-03-16T10:00:00.000Z',
              network: {
                key: 'base-sepolia',
                chain_id: 84532,
                chain_name: 'Base Sepolia',
                caip2: 'eip155:84532',
                environment: 'testnet',
              },
              verdict_id: 'verdict_live_promote_1',
              deployer: SECOND_WALLET,
              contracts: {
                verifier: {
                  contract: 'DJDEvaluatorVerdictVerifier',
                  address: VALID_WALLET,
                  tx_hash: '0x' + '1'.repeat(64),
                  action: 'deploy',
                },
                escrow: {
                  contract: 'DJDEvaluatorEscrowSettlementExample',
                  address: SECOND_WALLET,
                  tx_hash: '0x' + '2'.repeat(64),
                  action: 'deploy',
                },
              },
              verification: {
                oracle_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
                escrow_verifier: VALID_WALLET,
                escrow_provider: VALID_WALLET,
                escrow_counterparty: SECOND_WALLET,
                escrow_id_hash: '0x' + '3'.repeat(64),
              },
              inputs: {
                network_key: 'base-sepolia',
                provider: VALID_WALLET,
                counterparty: SECOND_WALLET,
                escrow_id: 'escrow-promote-live',
              },
              explorer: {
                verifier_address: `https://sepolia.basescan.org/address/${VALID_WALLET}`,
                verifier_transaction: `https://sepolia.basescan.org/tx/${'0x' + '1'.repeat(64)}`,
                escrow_address: `https://sepolia.basescan.org/address/${SECOND_WALLET}`,
                escrow_transaction: `https://sepolia.basescan.org/tx/${'0x' + '2'.repeat(64)}`,
              },
              links: {
                verifier_package: 'https://example.test/v1/score/evaluator/verifier?network=base-sepolia',
                verifier_proof:
                  'https://example.test/v1/score/evaluator/proof?id=verdict_live_promote_1&network=base-sepolia',
                escrow_settlement:
                  'https://example.test/v1/score/evaluator/escrow?id=verdict_live_promote_1&network=base-sepolia',
                artifact_package: 'https://example.test/v1/score/evaluator/artifacts',
                bundle:
                  'https://example.test/v1/score/evaluator/deploy/bundle?id=verdict_live_promote_1&network=base-sepolia',
              },
              checks: {
                preflight: true,
                verified: true,
                smoked: true,
                health: true,
                staged: true,
              },
            },
          },
        },
        null,
        2,
      ) + '\n',
    )

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/promotion?network=base-sepolia')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-promotion-bundle-v1')
    expect(body.ready).toBe(true)
    expect(body.source).toBe('published_registry')
    expect(body.deployment.verdict_id).toBe('verdict_live_promote_1')
    expect(body.outputs.variables.DJD_NETWORK).toBe('base-sepolia')
    expect(body.outputs.variables.DJD_VERIFIER_CONTRACT).toBe(VALID_WALLET)
    expect(body.outputs.network_scoped.DJD_BASE_SEPOLIA_ESCROW_CONTRACT).toBe(SECOND_WALLET)
    expect(body.outputs.dotenv).toContain('DJD_NETWORK=base-sepolia')
    expect(body.outputs.shell).toContain(`export DJD_ESCROW_CONTRACT='${SECOND_WALLET}'`)
    expect(body.outputs.github_output).toContain('DJD_VERDICT_ID=verdict_live_promote_1')
  })

  it('returns a not-ready promotion bundle when no published deployment exists for the network', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-evaluator-promotion-empty-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')
    process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = registryPath

    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          standard: 'djd-evaluator-deployment-registry-v1',
          updated_at: '2026-03-16T10:30:00.000Z',
          deployments: {},
        },
        null,
        2,
      ) + '\n',
    )

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/promotion?network=base')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-promotion-bundle-v1')
    expect(body.ready).toBe(false)
    expect(body.reason).toBe('deployment_not_published')
    expect(body.outputs).toBeNull()
    expect(body.deployment).toBeNull()
  })

  it('returns compiled Solidity artifacts for DJD onchain integrations', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/artifacts')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-artifact-package-v1')
    expect(body.available).toBe(true)
    expect(body.compiler.name).toBe('solc')
    expect(body.compiler.version).toContain('0.8.34')
    expect(body.compiler.via_ir).toBe(true)
    expect(body.summary.deployable).toBeGreaterThanOrEqual(2)
    expect(body.contracts.some((entry: { contract: string }) => entry.contract === 'DJDEvaluatorVerdictVerifier')).toBe(
      true,
    )
    expect(
      body.contracts.some((entry: { contract: string }) => entry.contract === 'DJDEvaluatorEscrowSettlementExample'),
    ).toBe(true)
    expect(
      body.contracts.some((entry: { contract: string; artifact_kind: string }) =>
        entry.contract === 'IDJDEvaluatorOracleCallback' && entry.artifact_kind === 'interface'),
    ).toBe(true)
    const verifierArtifact = body.contracts.find(
      (entry: { contract: string }) => entry.contract === 'DJDEvaluatorVerdictVerifier',
    )
    expect(verifierArtifact.bytecode).toMatch(/^0x[a-f0-9]+$/)
    expect(body.links.deploy_plan).toContain('/v1/score/evaluator/deploy?id=verdict_')
  })

  it('returns verifier calldata for a stored signed verdict', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_789',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_789',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-789',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 88,
        agent_score_provider: 84,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 9,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_789abcdef123456',
        packet_hash: '0x789123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T04:00:00.000Z',
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_789',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + '7'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T04:00:00.000Z',
      created_at: '2026-03-12T04:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(
      `/v1/score/evaluator/proof?id=verdict_789&target_contract=${SECOND_WALLET}`,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-verifier-proof-v1')
    expect(body.ready).toBe(true)
    expect(body.verifier.contract).toBe('DJDEvaluatorVerdictVerifier')
    expect(body.verifier.function).toBe('verifyVerdict')
    expect(body.attestation.status).toBe('signed')
    expect(body.verdict.verdictId).toBe('verdict_789')
    expect(body.verdict.counterpartyWallet).toBe(SECOND_WALLET)
    expect(body.call.selector).toMatch(/^0x[a-f0-9]{8}$/)
    expect(body.call.calldata).toMatch(/^0x[a-f0-9]+$/)
    expect(body.call.args.signature).toMatch(/^0x[a-f0-9]+$/)
    expect(body.transaction.to).toBe(SECOND_WALLET)
    expect(body.transaction.data).toBe(body.call.calldata)
    expect(body.links.verifier_package).toContain('/v1/score/evaluator/verifier')
    expect(body.resolution.source).toBe('explicit')
  })

  it('returns an unsigned verifier-proof envelope when a verdict lacks a signed attestation', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_790',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_790',
        wallet: VALID_WALLET,
        counterparty_wallet: null,
        escrow_id: null,
        decision: 'review',
        approved: false,
        recommendation: 'manual_review',
        confidence: 61,
        agent_score_provider: 61,
        score_model_version: '2.0.0',
        certification_valid: false,
        certification_tier: null,
        risk_level: 'elevated',
        risk_score: 44,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: false,
          certification_floor: 'Transactional',
          certification_floor_passed: false,
          risk_guardrail_passed: false,
          dispute_guardrail_passed: true,
          failed_checks: ['score_strength'],
          review_checks: ['certification'],
        },
        forensic_trace_id: 'trace_790abcdef123456',
        packet_hash: '0x790123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T05:00:00.000Z',
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_790',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'unsigned',
      attestation_digest: '0x' + '8'.repeat(64),
      attestation_signature: null,
      attestation_signer: null,
      attestation_reason: 'No oracle signing key configured',
      attested_at: '2026-03-12T05:00:00.000Z',
      created_at: '2026-03-12T05:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/proof?id=verdict_790')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ready).toBe(false)
    expect(body.reason).toBe('verdict_attestation_unsigned')
    expect(body.attestation.status).toBe('unsigned')
    expect(body.call.selector).toBe(null)
    expect(body.call.calldata).toBe(null)
    expect(body.transaction.data).toBe(null)
    expect(body.resolution.source).toBe('unresolved')
  })

  it('resolves the published verifier deployment when proof target_contract is omitted', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-proof-deployment-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')
    process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = registryPath
    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          standard: 'djd-evaluator-deployment-registry-v1',
          updated_at: '2026-03-16T03:00:00.000Z',
          deployments: {
            base: {
              published_at: '2026-03-16T03:00:00.000Z',
              network: {
                key: 'base',
                chain_id: 8453,
                chain_name: 'Base',
                caip2: 'eip155:8453',
                environment: 'mainnet',
              },
              verdict_id: 'verdict_live_proof_1',
              deployer: SECOND_WALLET,
              contracts: {
                verifier: {
                  contract: 'DJDEvaluatorVerdictVerifier',
                  address: SECOND_WALLET,
                  tx_hash: '0x' + '1'.repeat(64),
                  action: 'deploy',
                },
                escrow: {
                  contract: 'DJDEvaluatorEscrowSettlementExample',
                  address: VALID_WALLET,
                  tx_hash: '0x' + '2'.repeat(64),
                  action: 'deploy',
                },
              },
              verification: {
                oracle_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
                escrow_verifier: SECOND_WALLET,
                escrow_provider: VALID_WALLET,
                escrow_counterparty: SECOND_WALLET,
                escrow_id_hash: '0x' + '3'.repeat(64),
              },
              inputs: {
                provider: VALID_WALLET,
                counterparty: SECOND_WALLET,
                escrow_id: 'escrow-live-proof',
              },
              explorer: null,
              links: {
                verifier_package: 'https://example.test/v1/score/evaluator/verifier?network=base',
                verifier_proof: 'https://example.test/v1/score/evaluator/proof?id=verdict_live_proof_1&network=base',
                escrow_settlement: 'https://example.test/v1/score/evaluator/escrow?id=verdict_live_proof_1&network=base',
                bundle: 'https://example.test/v1/score/evaluator/deploy/bundle?id=verdict_live_proof_1&network=base',
              },
              checks: {
                preflight: true,
                verified: true,
                smoked: true,
                health: null,
                staged: true,
              },
            },
          },
        },
        null,
        2,
      ) + '\n',
    )

    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_789_auto',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_789_auto',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-789-auto',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 88,
        agent_score_provider: 84,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 9,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_789autoabcdef12',
        packet_hash: '0x789123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T04:30:00.000Z',
        links: {
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_789_auto',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + '7'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T04:30:00.000Z',
      created_at: '2026-03-12T04:30:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/proof?id=verdict_789_auto')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transaction.to).toBe(SECOND_WALLET)
    expect(body.resolution.source).toBe('published_registry')
    expect(body.resolution.contract_address).toBe(SECOND_WALLET)
    expect(body.resolution.registry_updated_at).toBe('2026-03-16T03:00:00.000Z')
    expect(body.links.deployment_registry).toContain('/v1/score/evaluator/deployments?network=base')
  })

  it('returns escrow settlement calldata for a stored signed verdict', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_791',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_791',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-791',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 89,
        agent_score_provider: 85,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 7,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_791abcdef123456',
        packet_hash: '0x791123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T06:00:00.000Z',
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_791',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + '9'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T06:00:00.000Z',
      created_at: '2026-03-12T06:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(
      `/v1/score/evaluator/escrow?id=verdict_791&escrow_contract=${SECOND_WALLET}`,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-escrow-settlement-v1')
    expect(body.ready).toBe(true)
    expect(body.escrow.contract).toBe('DJDEvaluatorEscrowSettlementExample')
    expect(body.escrow.function).toBe('settleWithDJDVerdict')
    expect(body.verifier.contract).toBe('DJDEvaluatorVerdictVerifier')
    expect(body.settlement.outcome).toBe('release')
    expect(body.settlement.release_authorized).toBe(true)
    expect(body.call.selector).toMatch(/^0x[a-f0-9]{8}$/)
    expect(body.call.calldata).toMatch(/^0x[a-f0-9]+$/)
    expect(body.transaction.to).toBe(SECOND_WALLET)
    expect(body.transaction.data).toBe(body.call.calldata)
    expect(body.links.verifier_proof).toContain('/v1/score/evaluator/proof?id=verdict_791')
    expect(body.resolution.source).toBe('explicit')
  })

  it('returns an unsigned escrow-settlement envelope when a verdict lacks a signed attestation', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_792',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_792',
        wallet: VALID_WALLET,
        counterparty_wallet: null,
        escrow_id: null,
        decision: 'reject',
        approved: false,
        recommendation: 'reject',
        confidence: 42,
        agent_score_provider: 42,
        score_model_version: '2.0.0',
        certification_valid: false,
        certification_tier: null,
        risk_level: 'elevated',
        risk_score: 63,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: false,
          certification_floor: 'Transactional',
          certification_floor_passed: false,
          risk_guardrail_passed: false,
          dispute_guardrail_passed: false,
          failed_checks: ['score_strength', 'risk'],
          review_checks: [],
        },
        forensic_trace_id: 'trace_792abcdef123456',
        packet_hash: '0x792123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T07:00:00.000Z',
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_792',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'unsigned',
      attestation_digest: '0x' + 'c'.repeat(64),
      attestation_signature: null,
      attestation_signer: null,
      attestation_reason: 'No oracle signing key configured',
      attested_at: '2026-03-12T07:00:00.000Z',
      created_at: '2026-03-12T07:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/escrow?id=verdict_792')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ready).toBe(false)
    expect(body.reason).toBe('verdict_attestation_unsigned')
    expect(body.attestation.status).toBe('unsigned')
    expect(body.settlement.outcome).toBe('reject')
    expect(body.call.selector).toBe(null)
    expect(body.call.calldata).toBe(null)
    expect(body.transaction.data).toBe(null)
    expect(body.resolution.source).toBe('unresolved')
  })

  it('resolves the published escrow deployment when escrow_contract is omitted', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-escrow-deployment-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')
    process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = registryPath
    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          standard: 'djd-evaluator-deployment-registry-v1',
          updated_at: '2026-03-16T03:30:00.000Z',
          deployments: {
            base: {
              published_at: '2026-03-16T03:30:00.000Z',
              network: {
                key: 'base',
                chain_id: 8453,
                chain_name: 'Base',
                caip2: 'eip155:8453',
                environment: 'mainnet',
              },
              verdict_id: 'verdict_live_escrow_1',
              deployer: SECOND_WALLET,
              contracts: {
                verifier: {
                  contract: 'DJDEvaluatorVerdictVerifier',
                  address: VALID_WALLET,
                  tx_hash: '0x' + '4'.repeat(64),
                  action: 'deploy',
                },
                escrow: {
                  contract: 'DJDEvaluatorEscrowSettlementExample',
                  address: SECOND_WALLET,
                  tx_hash: '0x' + '5'.repeat(64),
                  action: 'deploy',
                },
              },
              verification: {
                oracle_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
                escrow_verifier: VALID_WALLET,
                escrow_provider: VALID_WALLET,
                escrow_counterparty: SECOND_WALLET,
                escrow_id_hash: '0x' + '6'.repeat(64),
              },
              inputs: {
                provider: VALID_WALLET,
                counterparty: SECOND_WALLET,
                escrow_id: 'escrow-live-escrow',
              },
              explorer: null,
              links: {
                verifier_package: 'https://example.test/v1/score/evaluator/verifier?network=base',
                verifier_proof: 'https://example.test/v1/score/evaluator/proof?id=verdict_live_escrow_1&network=base',
                escrow_settlement: 'https://example.test/v1/score/evaluator/escrow?id=verdict_live_escrow_1&network=base',
                bundle: 'https://example.test/v1/score/evaluator/deploy/bundle?id=verdict_live_escrow_1&network=base',
              },
              checks: {
                preflight: true,
                verified: true,
                smoked: true,
                health: null,
                staged: true,
              },
            },
          },
        },
        null,
        2,
      ) + '\n',
    )

    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_791_auto',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_791_auto',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-791-auto',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 89,
        agent_score_provider: 85,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 7,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_791autoabcdef12',
        packet_hash: '0x791123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T06:30:00.000Z',
        links: {
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_791_auto',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + '9'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T06:30:00.000Z',
      created_at: '2026-03-12T06:30:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/escrow?id=verdict_791_auto')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transaction.to).toBe(SECOND_WALLET)
    expect(body.resolution.source).toBe('published_registry')
    expect(body.resolution.contract_address).toBe(SECOND_WALLET)
    expect(body.links.deployment_registry).toContain('/v1/score/evaluator/deployments?network=base')
  })

  it('returns a deployment plan for the verifier and escrow consumer contracts', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_793',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_793',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-793',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 90,
        agent_score_provider: 86,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 6,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_793abcdef123456',
        packet_hash: '0x793123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T08:00:00.000Z',
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_793',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + 'd'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T08:00:00.000Z',
      created_at: '2026-03-12T08:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(
      `/v1/score/evaluator/deploy?id=verdict_793&verifier_contract=${SECOND_WALLET}`,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-deploy-plan-v1')
    expect(body.network.chain_id).toBe(8453)
    expect(body.verifier.contract).toBe('DJDEvaluatorVerdictVerifier')
    expect(body.escrow.contract).toBe('DJDEvaluatorEscrowSettlementExample')
    expect(typeof body.verifier.deployment_ready).toBe('boolean')
    expect(body.escrow.deployment_ready).toBe(true)
    expect(body.escrow.constructor.verifier).toBe(SECOND_WALLET)
    expect(body.escrow.constructor.verifier_source).toBe('explicit')
    expect(body.escrow.constructor.provider).toBe(VALID_WALLET)
    expect(body.escrow.constructor.counterparty).toBe(SECOND_WALLET)
    expect(body.escrow.constructor.escrow_id).toBe('escrow-793')
    expect(body.escrow.constructor.escrow_id_hash).toMatch(/^0x[a-f0-9]{64}$/)
    expect(body.links.escrow_settlement).toContain('/v1/score/evaluator/escrow?id=verdict_793')
    expect(body.links.deployment_registry).toContain('/v1/score/evaluator/deployments?network=base')
  })

  it('reuses the published verifier deployment in the deploy plan when verifier_contract is omitted', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-plan-deployment-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')
    process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = registryPath
    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          standard: 'djd-evaluator-deployment-registry-v1',
          updated_at: '2026-03-16T04:00:00.000Z',
          deployments: {
            base: {
              published_at: '2026-03-16T04:00:00.000Z',
              network: {
                key: 'base',
                chain_id: 8453,
                chain_name: 'Base',
                caip2: 'eip155:8453',
                environment: 'mainnet',
              },
              verdict_id: 'verdict_live_plan_1',
              deployer: SECOND_WALLET,
              contracts: {
                verifier: {
                  contract: 'DJDEvaluatorVerdictVerifier',
                  address: SECOND_WALLET,
                  tx_hash: '0x' + '7'.repeat(64),
                  action: 'deploy',
                },
                escrow: {
                  contract: 'DJDEvaluatorEscrowSettlementExample',
                  address: VALID_WALLET,
                  tx_hash: '0x' + '8'.repeat(64),
                  action: 'deploy',
                },
              },
              verification: {
                oracle_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
                escrow_verifier: SECOND_WALLET,
                escrow_provider: VALID_WALLET,
                escrow_counterparty: SECOND_WALLET,
                escrow_id_hash: '0x' + '9'.repeat(64),
              },
              inputs: {
                provider: VALID_WALLET,
                counterparty: SECOND_WALLET,
                escrow_id: 'escrow-live-plan',
              },
              explorer: null,
              links: {
                verifier_package: 'https://example.test/v1/score/evaluator/verifier?network=base',
                verifier_proof: 'https://example.test/v1/score/evaluator/proof?id=verdict_live_plan_1&network=base',
                escrow_settlement: 'https://example.test/v1/score/evaluator/escrow?id=verdict_live_plan_1&network=base',
                bundle: 'https://example.test/v1/score/evaluator/deploy/bundle?id=verdict_live_plan_1&network=base',
              },
              checks: {
                preflight: true,
                verified: true,
                smoked: true,
                health: null,
                staged: true,
              },
            },
          },
        },
        null,
        2,
      ) + '\n',
    )

    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_793_auto',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_793_auto',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-793-auto',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 90,
        agent_score_provider: 86,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 6,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_793autoabcdef12',
        packet_hash: '0x793123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T08:30:00.000Z',
        links: {
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_793_auto',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + 'd'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T08:30:00.000Z',
      created_at: '2026-03-12T08:30:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/deploy?id=verdict_793_auto')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.escrow.deployment_ready).toBe(true)
    expect(body.escrow.constructor.verifier).toBe(SECOND_WALLET)
    expect(body.escrow.constructor.verifier_source).toBe('published_registry')
    expect(body.notes.some((note: string) => note.includes('published verifier deployment'))).toBe(true)
  })

  it('returns a deployment bundle with artifacts and deployment order', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_794',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_794',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-794',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 90,
        agent_score_provider: 86,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 6,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_794abcdef123456',
        packet_hash: '0x794123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T09:00:00.000Z',
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_794',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + 'e'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T09:00:00.000Z',
      created_at: '2026-03-12T09:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/deploy/bundle?id=verdict_794')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-deploy-bundle-v1')
    expect(body.artifacts.available).toBe(true)
    expect(body.deployment.order).toEqual(['verifier', 'escrow'])
    expect(body.deployment.verifier.action).toBe('deploy')
    expect(body.deployment.escrow.constructor.verifier_source).toBe('deployment_output')
    expect(body.deployment.escrow.constructor.escrow_id).toBe('escrow-794')
    expect(body.artifacts.verifier.contract).toBe('DJDEvaluatorVerdictVerifier')
    expect(body.artifacts.escrow.contract).toBe('DJDEvaluatorEscrowSettlementExample')
    expect(body.links.artifact_package).toContain('/v1/score/evaluator/artifacts')
    expect(body.links.bundle).toContain('/v1/score/evaluator/deploy/bundle?id=verdict_794')
  })

  it('rejects deploy planning when the requested network does not match the stored verdict attestation domain', async () => {
    state.getEvaluatorVerdict.mockReturnValueOnce({
      id: 'verdict_795',
      payload_json: JSON.stringify({
        standard: 'erc-8183-evaluator-oracle-prototype',
        verdict_id: 'verdict_795',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-795',
        decision: 'approve',
        approved: true,
        recommendation: 'release',
        confidence: 90,
        agent_score_provider: 86,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 6,
        sla_metrics: {
          baseline_profile: 'djd-transactional-settlement-v1',
          settlement_tier: 'Transactional',
          score_floor: 75,
          score_floor_passed: true,
          certification_floor: 'Transactional',
          certification_floor_passed: true,
          risk_guardrail_passed: true,
          dispute_guardrail_passed: true,
          failed_checks: [],
          review_checks: [],
        },
        forensic_trace_id: 'trace_795abcdef123456',
        packet_hash: '0x795123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        generated_at: '2026-03-12T09:00:00.000Z',
        attestation: {
          status: 'signed',
          scheme: 'eip712',
          source: 'oracle_signer',
          signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
          signature: '0x' + 'a'.repeat(130),
          digest: '0x' + 'f'.repeat(64),
          issued_at: '2026-03-12T09:00:00.000Z',
          reason: null,
          typed_data: {
            domain: {
              name: 'DJD Evaluator Verdict',
              version: '1',
              chainId: 8453,
            },
            primaryType: 'EvaluatorVerdict',
            types: {
              EvaluatorVerdict: [],
            },
            message: {
              verdictId: 'verdict_795',
              wallet: VALID_WALLET,
              counterpartyWallet: SECOND_WALLET,
              escrowId: 'escrow-795',
              decision: 'approve',
              recommendation: 'release',
              approved: true,
              confidence: 90,
              agentScoreProvider: 86,
              scoreModelVersion: '2.0.0',
              certificationValid: true,
              certificationTier: 'Transactional',
              riskLevel: 'clear',
              riskScore: 6,
              forensicTraceId: 'trace_795abcdef123456',
              packetHash: '0x795123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
              generatedAt: '2026-03-12T09:00:00.000Z',
            },
          },
        },
        links: {
          standards_document: `https://example.test/v1/score/erc8004?wallet=${VALID_WALLET}`,
          certification_status: `https://example.test/v1/certification/${VALID_WALLET}`,
          forensics_summary: `https://example.test/v1/forensics/summary?wallet=${VALID_WALLET}`,
          evidence_packet: `https://example.test/v1/score/evaluator/evidence?wallet=${VALID_WALLET}`,
          verdict_record: 'https://example.test/v1/score/evaluator/verdict?id=verdict_795',
          verdict_history: `https://example.test/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}`,
        },
      }),
      attestation_scheme: 'eip712',
      attestation_status: 'signed',
      attestation_digest: '0x' + 'f'.repeat(64),
      attestation_signature: '0x' + 'a'.repeat(130),
      attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      attestation_reason: null,
      attested_at: '2026-03-12T09:00:00.000Z',
      created_at: '2026-03-12T09:00:00.000Z',
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/evaluator/deploy?id=verdict_795&network=base-sepolia')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_network')
    expect(body.error.details?.verdict_network).toBe('base')
    expect(body.error.details?.requested_network).toBe('base-sepolia')
  })

  it('lists evaluator verdict history for a wallet', async () => {
    state.listEvaluatorVerdictsByWallet.mockReturnValueOnce([
      {
        id: 'verdict_123',
        wallet: VALID_WALLET,
        counterparty_wallet: SECOND_WALLET,
        escrow_id: 'escrow-123',
        baseline_profile: 'djd-transactional-settlement-v1',
        certification_floor: 'Transactional',
        current_score: 82,
        current_tier: 'Trusted',
        score_confidence: 0.92,
        risk_score: 8,
        risk_level: 'clear',
        certification_active: 1,
        certification_tier: 'Transactional',
        decision: 'approve',
        recommendation: 'release',
        approved: 1,
        confidence: 86,
        packet_hash: '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        forensic_trace_id: 'trace_1234567890abcdef',
        attestation_scheme: 'eip712',
        attestation_status: 'signed',
        attestation_digest: '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        attestation_signature: '0x' + 'a'.repeat(130),
        attestation_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        attestation_reason: null,
        attested_at: '2026-03-12T02:00:00.000Z',
        payload_json: JSON.stringify({ packet_hash: '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd' }),
        created_at: '2026-03-12T02:00:00.000Z',
      },
      {
        id: 'verdict_456',
        wallet: VALID_WALLET,
        counterparty_wallet: null,
        escrow_id: null,
        baseline_profile: 'djd-transactional-settlement-v1',
        certification_floor: 'Transactional',
        current_score: 61,
        current_tier: 'Established',
        score_confidence: 0.57,
        risk_score: 44,
        risk_level: 'elevated',
        certification_active: 0,
        certification_tier: null,
        decision: 'review',
        recommendation: 'manual_review',
        approved: 0,
        confidence: 61,
        packet_hash: '0xdef123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        forensic_trace_id: 'trace_abcdef1234567890',
        attestation_scheme: 'eip712',
        attestation_status: 'unsigned',
        attestation_digest: '0xdef123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
        attestation_signature: null,
        attestation_signer: null,
        attestation_reason: 'No oracle signing key configured',
        attested_at: '2026-03-12T03:00:00.000Z',
        payload_json: JSON.stringify({ packet_hash: '0xdef123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd' }),
        created_at: '2026-03-12T03:00:00.000Z',
      },
    ])

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/evaluator/verdicts?wallet=${VALID_WALLET}&limit=2`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.standard).toBe('djd-evaluator-verdict-history-v1')
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.total).toBe(2)
    expect(body.summary.approvals).toBe(1)
    expect(body.summary.manual_review).toBe(1)
    expect(body.items[0].verdict_id).toBe('verdict_123')
    expect(body.items[0].attestation_status).toBe('signed')
    expect(body.items[1].recommendation).toBe('manual_review')
    expect(body.items[1].attestation_status).toBe('unsigned')
  })

  it('returns a composite risk profile', async () => {
    state.getOrCalculateScore.mockResolvedValueOnce({
      ...state.scoreResult,
      score: 34,
      tier: 'Emerging',
      confidence: 0.81,
      recommendation: 'flagged_for_review',
      sybilFlag: true,
      gamingIndicators: ['rapid_score_refresh'],
    })
    state.getScore.mockReturnValueOnce({
      sybil_indicators: JSON.stringify(['tight_cluster', 'funded_by_top_partner']),
      gaming_indicators: JSON.stringify(['rapid_score_refresh']),
    })
    state.countFraudReportsByTarget.mockReturnValueOnce(3)
    state.countDistinctReportersByTarget.mockReturnValueOnce(2)
    state.sumFraudPenaltyByTarget.mockReturnValueOnce(15)
    state.countFraudDisputesByTarget.mockReturnValueOnce(1).mockReturnValueOnce(2)
    state.getFraudReasonBreakdown.mockReturnValueOnce([
      { reason: 'payment_fraud', count: 2 },
      { reason: 'impersonation', count: 1 },
    ])
    state.getRatingsSummaryForWallet.mockReturnValueOnce({
      rating_count: 4,
      unique_raters: 3,
      average_rating: 2.25,
      most_recent_rating_at: '2026-03-12T02:00:00.000Z',
    })
    state.getIntentSummaryByTarget.mockReturnValueOnce({
      intent_count: 6,
      conversions: 0,
      conversion_rate: 0,
      avg_time_to_tx_ms: null,
      most_recent_query_at: '2026-03-12T01:00:00.000Z',
      most_recent_conversion_at: null,
    })
    state.getCreatorStakeSummary.mockReturnValueOnce({
      active_stake_count: 2,
      active_staked_amount: 150,
      active_score_boost: 3,
      slashed_stake_count: 0,
      slashed_staked_amount: 0,
      most_recent_stake_at: '2026-03-12T03:00:00.000Z',
    })
    state.listFraudPatternsByNames.mockReturnValueOnce([
      {
        pattern_name: 'payment_fraud',
        risk_weight: 2.5,
        occurrences: 18,
        first_detected: '2026-02-01T00:00:00.000Z',
        last_detected: '2026-03-12T00:00:00.000Z',
      },
      {
        pattern_name: 'tight_cluster',
        risk_weight: 1.8,
        occurrences: 9,
        first_detected: '2026-02-10T00:00:00.000Z',
        last_detected: '2026-03-12T00:00:00.000Z',
      },
    ])

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/risk?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.risk_level).toBe('critical')
    expect(body.action).toBe('block')
    expect(body.summary.report_count).toBe(3)
    expect(body.summary.sybil_flagged).toBe(true)
    expect(body.summary.active_creator_stakes).toBe(2)
    expect(body.summary.active_score_boost).toBe(3)
    expect(body.factors.some((factor: { key: string }) => factor.key === 'fraud_reports')).toBe(true)
    expect(body.matched_patterns[0].pattern_name).toBe('payment_fraud')
  })

  it('returns 400 for an invalid wallet on risk score', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/risk?wallet=bad-wallet')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_wallet')
  })

  it('refreshes a score via POST', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/refresh?wallet=${VALID_WALLET}`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(state.getOrCalculateScore).toHaveBeenCalledWith(VALID_WALLET, true)
  })

  it('queues an async score job from the request body', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/compute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: VALID_WALLET }),
    })

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(body.wallet).toBe(VALID_WALLET)
    expect(state.submitJob).toHaveBeenCalledWith(VALID_WALLET)
  })

  it('returns 400 for invalid JSON on compute without a query wallet', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/compute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_json')
  })

  it('returns pending async job state', async () => {
    state.getJob.mockReturnValue({
      jobId: '123e4567-e89b-42d3-a456-426614174000',
      wallet: VALID_WALLET,
      status: 'pending',
      createdAt: Date.now(),
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/job/123e4567-e89b-42d3-a456-426614174000')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('pending')
    expect(body.wallet).toBe(VALID_WALLET)
  })

  it('returns completed async job state with a basic result payload', async () => {
    state.getJob.mockReturnValue({
      jobId: '123e4567-e89b-42d3-a456-426614174000',
      wallet: VALID_WALLET,
      status: 'complete',
      createdAt: Date.now(),
      result: { ...state.scoreResult },
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/job/123e4567-e89b-42d3-a456-426614174000')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('complete')
    expect(body.result.score).toBe(82)
    expect(body.result.dimensions).toBeUndefined()
  })

  it('returns 404 for a missing score job', async () => {
    state.getJob.mockReturnValue(undefined)

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/job/123e4567-e89b-42d3-a456-426614174000')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('job_not_found')
  })

  it('scores a batch of wallets', async () => {
    state.getOrCalculateScore
      .mockResolvedValueOnce({ ...state.scoreResult, wallet: VALID_WALLET })
      .mockResolvedValueOnce({ ...state.scoreResult, wallet: SECOND_WALLET, score: 77, tier: 'Established' })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallets: [VALID_WALLET, SECOND_WALLET] }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(2)
    expect(body.results[1].wallet).toBe(SECOND_WALLET)
    expect(body.results[1].score).toBe(77)
  })

  it('returns 400 for invalid batch input', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallets: [VALID_WALLET] }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('batch_invalid')
  })
})
