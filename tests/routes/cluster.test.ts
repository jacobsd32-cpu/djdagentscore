import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getRiskScore: vi.fn(),
  getRelationshipGraphSummary: vi.fn(),
  listRelationshipCounterparties: vi.fn(),
  upsertClusterAssignment: vi.fn(),
  listClusterMembers: vi.fn(),
  countClusterMembers: vi.fn(),
}))

const VALID_WALLET = '0x1234567890abcdef1234567890abcdef12345678'

vi.mock('../../src/services/riskService.js', () => ({
  getRiskScore: (...args: unknown[]) => state.getRiskScore(...args),
}))

vi.mock('../../src/db.js', () => ({
  getRelationshipGraphSummary: (...args: unknown[]) => state.getRelationshipGraphSummary(...args),
  listRelationshipCounterparties: (...args: unknown[]) => state.listRelationshipCounterparties(...args),
  upsertClusterAssignment: (...args: unknown[]) => state.upsertClusterAssignment(...args),
  listClusterMembers: (...args: unknown[]) => state.listClusterMembers(...args),
  countClusterMembers: (...args: unknown[]) => state.countClusterMembers(...args),
}))

describe('GET /v1/cluster', () => {
  beforeEach(() => {
    state.getRiskScore.mockReset()
    state.getRelationshipGraphSummary.mockReset()
    state.listRelationshipCounterparties.mockReset()
    state.upsertClusterAssignment.mockReset()
    state.listClusterMembers.mockReset()
    state.countClusterMembers.mockReset()

    state.getRiskScore.mockResolvedValue({
      ok: true,
      data: {
        wallet: VALID_WALLET,
        risk_score: 54,
        risk_level: 'elevated',
        risk_confidence: 0.78,
        action: 'review',
        current_score: 44,
        current_tier: 'Emerging',
        score_confidence: 0.81,
        score_recommendation: 'flagged_for_review',
        score_model_version: '2.0.0',
        last_scored_at: '2026-03-13T00:00:00.000Z',
        summary: {
          report_count: 2,
          unique_reporters: 2,
          total_penalty_applied: 10,
          open_disputes: 0,
          resolved_disputes: 1,
          sybil_flagged: false,
          sybil_indicators: [],
          gaming_indicators: [],
          rating_count: 3,
          average_rating: 2.7,
          unique_raters: 3,
          intent_count: 6,
          conversions: 1,
          conversion_rate: 16.7,
          reason_breakdown: [{ reason: 'payment_fraud', count: 2 }],
        },
        factors: [],
        matched_patterns: [],
      },
    })
    state.getRelationshipGraphSummary.mockReturnValue({
      counterparty_count: 5,
      outbound_tx_count: 9,
      inbound_tx_count: 5,
      total_tx_count: 14,
      volume_outbound: 800,
      volume_inbound: 400,
      total_volume: 1200,
      first_interaction: '2026-01-01T00:00:00.000Z',
      last_interaction: '2026-03-13T00:00:00.000Z',
    })
    state.listRelationshipCounterparties.mockReturnValue([
      {
        counterparty_wallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        tx_count_outbound: 6,
        tx_count_inbound: 3,
        total_tx_count: 9,
        volume_outbound: 600,
        volume_inbound: 200,
        total_volume: 800,
        first_interaction: '2026-01-10T00:00:00.000Z',
        last_interaction: '2026-03-13T00:00:00.000Z',
      },
      {
        counterparty_wallet: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        tx_count_outbound: 3,
        tx_count_inbound: 2,
        total_tx_count: 5,
        volume_outbound: 200,
        volume_inbound: 200,
        total_volume: 400,
        first_interaction: '2026-02-10T00:00:00.000Z',
        last_interaction: '2026-03-10T00:00:00.000Z',
      },
    ])
    state.listClusterMembers.mockReturnValue([
      {
        wallet: '0x9999999999999999999999999999999999999999',
        cluster_name: 'fraud_hotspot',
        confidence: 0.73,
        assigned_at: '2026-03-12T00:00:00.000Z',
        current_score: 37,
        current_tier: 'Emerging',
      },
    ])
    state.countClusterMembers.mockReturnValue(2)
  })

  it('returns a fraud-hotspot cluster view', async () => {
    const { Hono } = await import('hono')
    const { default: clusterRoute } = await import('../../src/routes/cluster.js')

    const app = new Hono()
    app.route('/v1/cluster', clusterRoute)

    const res = await app.request(`/v1/cluster?wallet=${VALID_WALLET}&limit=5`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.cluster_name).toBe('fraud_hotspot')
    expect(body.cluster_id).toBe('fraud_hotspot:payment_fraud:0xaaaaaaaaaaaaaaaa')
    expect(body.member_count).toBe(2)
    expect(body.members[0].wallet).toBe('0x9999999999999999999999999999999999999999')
    expect(body.linked_wallets[0].relationship_strength).toBe('primary')
    expect(state.upsertClusterAssignment).toHaveBeenCalled()
  })

  it('returns 400 for an invalid wallet', async () => {
    const { Hono } = await import('hono')
    const { default: clusterRoute } = await import('../../src/routes/cluster.js')

    const app = new Hono()
    app.route('/v1/cluster', clusterRoute)

    const res = await app.request('/v1/cluster?wallet=bad-wallet')
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('invalid_wallet')
  })
})
