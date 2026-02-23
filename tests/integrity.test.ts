import { describe, it, expect, vi } from 'vitest'

// Mock modules that trigger side-effects (real SQLite open) on import.
// computeIntegrityMultiplier is a pure function and doesn't use any of these.
vi.mock('../src/db.js', () => ({
  db: { prepare: () => ({ get: () => null, all: () => [], run: () => {} }), exec: () => {}, pragma: () => {}, transaction: (fn: Function) => fn },
  upsertScore: vi.fn(),
  getScore: vi.fn(),
  getScoreHistory: vi.fn(() => []),
  scoreToTier: (s: number) => s >= 90 ? 'Elite' : s >= 75 ? 'Trusted' : s >= 50 ? 'Established' : s >= 25 ? 'Emerging' : 'Unverified',
  countReportsByTarget: vi.fn(() => 0),
  countUniquePartners: vi.fn(() => 0),
  countRatingsReceived: vi.fn(() => 0),
  countPriorQueries: vi.fn(() => 0),
  getRegistration: vi.fn(),
  getWalletX402Stats: vi.fn(() => ({ x402TxCount: 0, x402InflowsUsd: 0, x402OutflowsUsd: 0, x402FirstSeen: null })),
  getWalletIndexFirstSeen: vi.fn(() => null),
  getTransferTimestamps: vi.fn(() => []),
}))
vi.mock('../src/blockchain.js', () => ({
  getWalletUSDCData: vi.fn(),
  getCurrentBlock: vi.fn(() => 0n),
  estimateWalletAgeDays: vi.fn(() => 0),
  getTransactionCount: vi.fn(() => 0),
  getETHBalance: vi.fn(() => 0n),
  hasBasename: vi.fn(() => null),
}))
vi.mock('../src/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { computeIntegrityMultiplier } from '../src/scoring/engine.js'

describe('computeIntegrityMultiplier', () => {
  it('returns 1.0 with no indicators', () => {
    const result = computeIntegrityMultiplier([], [], 0)
    expect(result).toBe(1.0)
  })

  it('applies sybil factors', () => {
    const result = computeIntegrityMultiplier(['coordinated_creation'], [], 0)
    expect(result).toBeCloseTo(0.65)
  })

  it('applies gaming factors', () => {
    const result = computeIntegrityMultiplier([], ['balance_window_dressing'], 0)
    expect(result).toBeCloseTo(0.85)
  })

  it('multiplies multiple factors together', () => {
    const result = computeIntegrityMultiplier(
      ['coordinated_creation', 'single_source_funding'],
      ['burst_and_stop'],
      0,
    )
    // 0.65 * 0.75 * 0.80 = 0.39
    expect(result).toBeCloseTo(0.39, 1)
  })

  it('applies fraud report dampening', () => {
    const result = computeIntegrityMultiplier([], [], 3)
    // pow(0.90, 3) = 0.729
    expect(result).toBeCloseTo(0.729)
  })

  it('floors at 0.10', () => {
    const result = computeIntegrityMultiplier(
      ['wash_trading', 'self_funding_loop', 'coordinated_creation', 'zero_organic_activity'],
      ['nonce_inflation', 'artificial_partner_diversity'],
      5,
    )
    expect(result).toBeGreaterThanOrEqual(0.10)
  })
})
