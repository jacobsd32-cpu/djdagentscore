import { describe, it, expect } from 'vitest'
import {
  formatBasicScore,
  formatFullScore,
  formatHistory,
  formatLeaderboard,
  formatEconomyMetrics,
  formatBatchScore,
} from '../src/format.js'
import type { BasicScoreResponse, FullScoreResponse, LeaderboardResponse, EconomyMetrics } from 'djd-agent-score-client'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASIC_SCORE: BasicScoreResponse = {
  wallet: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
  score: 82,
  tier: 'Trusted',
  confidence: 0.91,
  recommendation: 'Safe to transact',
  modelVersion: '2.5.0',
  lastUpdated: '2026-02-28T12:00:00Z',
  computedAt: '2026-02-28T12:00:00Z',
  scoreFreshness: 0.95,
  dataSource: 'live',
}

const FULL_SCORE: FullScoreResponse = {
  ...BASIC_SCORE,
  sybilFlag: false,
  gamingIndicators: [],
  dimensions: {
    reliability: { score: 85, data: {} },
    viability: { score: 78, data: {} },
    identity: { score: 90, data: {} },
    capability: { score: 75, data: {} },
  },
  dataAvailability: {
    transactionHistory: 'full',
    walletAge: 'full',
    economicData: 'full',
    identityData: 'partial',
    communityData: 'none',
  },
  scoreHistory: [{ score: 80, calculatedAt: '2026-02-27T12:00:00Z' }],
  improvementPath: ['Increase transaction volume', 'Verify GitHub'],
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('formatBasicScore', () => {
  it('includes wallet, score, tier, and confidence', () => {
    const text = formatBasicScore(BASIC_SCORE)
    expect(text).toContain('0x1234')
    expect(text).toContain('82/100')
    expect(text).toContain('Trusted')
    expect(text).toContain('91%')
  })

  it('shows stale warning when stale', () => {
    const text = formatBasicScore({ ...BASIC_SCORE, stale: true })
    expect(text).toContain('stale')
  })

  it('shows free tier info', () => {
    const text = formatBasicScore({ ...BASIC_SCORE, freeTier: true, freeQueriesRemainingToday: 7 })
    expect(text).toContain('7 queries remaining')
  })

  it('shows data source', () => {
    const text = formatBasicScore(BASIC_SCORE)
    expect(text).toContain('live')
  })
})

describe('formatFullScore', () => {
  it('includes dimension scores', () => {
    const text = formatFullScore(FULL_SCORE)
    expect(text).toContain('reliability: 85')
    expect(text).toContain('viability: 78')
    expect(text).toContain('identity: 90')
    expect(text).toContain('capability: 75')
  })

  it('shows sybil flag when set', () => {
    const text = formatFullScore({ ...FULL_SCORE, sybilFlag: true })
    expect(text).toContain('SYBIL FLAG')
  })

  it('shows gaming indicators', () => {
    const text = formatFullScore({ ...FULL_SCORE, gamingIndicators: ['wash_trading', 'round_tripping'] })
    expect(text).toContain('wash_trading')
    expect(text).toContain('round_tripping')
  })

  it('shows improvement path', () => {
    const text = formatFullScore(FULL_SCORE)
    expect(text).toContain('Increase transaction volume')
    expect(text).toContain('Verify GitHub')
  })
})

describe('formatHistory', () => {
  it('formats history entries', () => {
    const text = formatHistory({
      wallet: '0xabc',
      history: [
        { score: 82, confidence: 0.9, model_version: '2.5.0', calculated_at: '2026-02-28T12:00:00Z' },
        { score: 80, confidence: 0.88, model_version: '2.5.0', calculated_at: '2026-02-27T12:00:00Z' },
      ],
      count: 2,
      returned: 2,
      period: { from: '2026-02-27T12:00:00Z', to: '2026-02-28T12:00:00Z' },
      trend: { direction: 'improving', change_pct: 2.5, avg_score: 81, min_score: 80, max_score: 82 },
    })
    expect(text).toContain('0xabc')
    expect(text).toContain('2 of 2')
    expect(text).toContain('improving')
    expect(text).toContain('82')
  })

  it('shows trajectory data when present', () => {
    const text = formatHistory({
      wallet: '0xabc',
      history: [],
      count: 0,
      returned: 0,
      period: { from: null, to: null },
      trajectory: { velocity: 1.5, momentum: 0.8, direction: 'rising', volatility: 0.3, modifier: 3, dataPoints: 10, spanDays: 30 },
    })
    expect(text).toContain('Velocity: 1.50')
    expect(text).toContain('rising')
    expect(text).toContain('30 days')
  })
})

describe('formatLeaderboard', () => {
  it('formats leaderboard entries', () => {
    const data: LeaderboardResponse = {
      leaderboard: [
        { rank: 1, wallet: '0xaaa', score: 95, tier: 'Elite', daysAlive: 365, isRegistered: true, githubVerified: true },
        { rank: 2, wallet: '0xbbb', score: 88, tier: 'Trusted', daysAlive: 200, isRegistered: true, githubVerified: false },
      ],
      totalAgentsScored: 500,
      totalAgentsRegistered: 120,
      lastUpdated: '2026-02-28T12:00:00Z',
    }
    const text = formatLeaderboard(data)
    expect(text).toContain('#1')
    expect(text).toContain('0xaaa')
    expect(text).toContain('Elite')
    expect(text).toContain('✓gh')
    expect(text).toContain('500')
  })
})

describe('formatEconomyMetrics', () => {
  it('formats economy metrics', () => {
    const data: EconomyMetrics = {
      period: 'daily',
      limit: 30,
      count: 2,
      metrics: [
        { date: '2026-02-28', scores_computed: 45, agents_registered: 3 },
        { date: '2026-02-27', scores_computed: 38, agents_registered: 1 },
      ],
    }
    const text = formatEconomyMetrics(data)
    expect(text).toContain('daily')
    expect(text).toContain('scores_computed')
  })

  it('handles empty metrics', () => {
    const text = formatEconomyMetrics({ period: 'weekly', limit: 10, count: 0, metrics: [] })
    expect(text).toContain('No metrics available')
  })
})

describe('formatBatchScore', () => {
  it('formats batch results', () => {
    const text = formatBatchScore({
      results: [
        { ...BASIC_SCORE, wallet: '0xaaa' as `0x${string}`, score: 90, tier: 'Elite' },
        { ...BASIC_SCORE, wallet: '0xbbb' as `0x${string}`, score: 60, tier: 'Emerging' },
      ],
      count: 2,
    })
    expect(text).toContain('2 wallets')
    expect(text).toContain('0xaaa')
    expect(text).toContain('90/100')
    expect(text).toContain('0xbbb')
    expect(text).toContain('Emerging')
  })
})
