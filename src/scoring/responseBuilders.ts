/**
 * Response builders — assemble FullScoreResponse objects from various sources
 * (fresh computation, cache, or zero fallback).
 *
 * Extracted from engine.ts so the orchestrator (computeScore / getOrCalculateScore)
 * stays focused on data fetching and scoring logic, not JSON serialization.
 */

import type {
  Address,
  DataAvailability,
  FullScoreResponse,
  ScoreDimensions,
  ScoreHistoryRow,
  ScoreRow,
} from '../types.js'

export const MODEL_VERSION = '2.1.0'

/** Linear decay from 1.0 (just computed) → 0.0 (at cache expiry).
 *  Consumers can multiply their trust by this factor. */
export function calcFreshness(computedAt: string, expiresAt: string): number {
  const computed = new Date(computedAt).getTime()
  const expires = new Date(expiresAt).getTime()
  const now = Date.now()
  if (expires <= computed) return 1 // degenerate — treat as fresh
  const freshness = (expires - now) / (expires - computed)
  return Math.max(0, Math.min(1, Math.round(freshness * 100) / 100))
}

export function buildFullResponseFromDimensions(
  wallet: Address,
  score: number,
  tier: string,
  calculatedAt: string,
  dimensions: ScoreDimensions,
  history: ScoreHistoryRow[],
  opts: {
    confidence: number
    recommendation: string
    sybilFlag: boolean
    gamingIndicators: string[]
    dataAvailability: DataAvailability
    improvementPath: string[]
    integrityMultiplier?: number
    breakdown?: Record<string, Record<string, number>>
    scoreRange?: { low: number; high: number }
    topContributors?: string[]
    topDetractors?: string[]
  },
): FullScoreResponse {
  return {
    wallet,
    score,
    tier: tier as FullScoreResponse['tier'],
    confidence: opts.confidence,
    recommendation: opts.recommendation,
    modelVersion: MODEL_VERSION,
    sybilFlag: opts.sybilFlag,
    gamingIndicators: opts.gamingIndicators,
    lastUpdated: calculatedAt,
    computedAt: calculatedAt,
    scoreFreshness: 1.0, // just computed
    dimensions,
    dataAvailability: opts.dataAvailability,
    improvementPath: opts.improvementPath.length > 0 ? opts.improvementPath : undefined,
    integrityMultiplier: opts.integrityMultiplier,
    breakdown: opts.breakdown,
    scoreRange: opts.scoreRange,
    topContributors: opts.topContributors,
    topDetractors: opts.topDetractors,
    scoreHistory: history.map((h) => ({
      score: h.score,
      calculatedAt: h.calculated_at,
      modelVersion: h.model_version,
    })),
  }
}

export function buildFullResponseFromCache(
  wallet: Address,
  cached: ScoreRow,
  history: ScoreHistoryRow[],
): FullScoreResponse {
  // Re-hydrate raw_data so dimension detail fields contain real values instead of zeros.
  interface StoredUsdcData {
    balance?: string
    inflows30d?: string
    outflows30d?: string
    inflows7d?: string
    outflows7d?: string
    totalInflows?: string
    transferCount?: number
    walletAgedays?: number
  }
  interface StoredRaw {
    usdcData?: StoredUsdcData
    walletAgeDays?: number
  }
  let raw: StoredRaw = {}
  try {
    raw = JSON.parse(cached.raw_data ?? '{}') as StoredRaw
  } catch {
    /* ignore */
  }
  const ud = raw.usdcData ?? {}
  const walletAgeDays = raw.walletAgeDays ?? 0
  const txCount = ud.transferCount ?? 0
  const bal = ud.balance ?? '0'
  const balUsd = Number(bal) / 1_000_000
  const everZeroBalance = balUsd === 0 && Number(ud.totalInflows ?? '0') > 0
  const fmt = (v?: string) => (Number(v ?? '0') / 1_000_000).toFixed(6)

  interface StoredRawExt extends StoredRaw {
    nonce?: number
    ethBalanceWei?: string
    basename?: boolean
  }
  const rawExt = raw as StoredRawExt

  const zeroDimensions: ScoreDimensions = {
    reliability: {
      score: cached.reliability_score,
      data: {
        txCount,
        nonce: rawExt.nonce ?? 0,
        successRate: txCount > 0 ? 1 : 0,
        lastTxTimestamp: null,
        failedTxCount: 0,
        uptimeEstimate: 0,
      },
    },
    viability: {
      score: cached.viability_score,
      data: {
        usdcBalance: fmt(bal),
        ethBalance: rawExt.ethBalanceWei ? (Number(rawExt.ethBalanceWei) / 1e18).toFixed(6) : '0.000000',
        inflows30d: fmt(ud.inflows30d),
        outflows30d: fmt(ud.outflows30d),
        inflows7d: fmt(ud.inflows7d),
        outflows7d: fmt(ud.outflows7d),
        totalInflows: fmt(ud.totalInflows),
        walletAgedays: walletAgeDays,
        everZeroBalance,
      },
    },
    identity: {
      score: cached.identity_score,
      data: {
        erc8004Registered: false,
        hasBasename: rawExt.basename ?? false,
        walletAgeDays,
        creatorScore: null,
        generationDepth: 0,
        constitutionHashVerified: false,
      },
    },
    capability: {
      score: cached.capability_score,
      data: { activeX402Services: 0, totalRevenue: fmt(ud.totalInflows), domainsOwned: 0, successfulReplications: 0 },
    },
  }

  const unknownAvailability: DataAvailability = {
    transactionHistory: 'cached',
    walletAge: 'cached',
    economicData: 'cached',
    identityData: 'cached',
    communityData: 'cached',
  }

  return {
    wallet,
    score: cached.composite_score,
    tier: cached.tier as FullScoreResponse['tier'],
    confidence: cached.confidence ?? 0,
    recommendation: cached.recommendation ?? 'insufficient_history',
    modelVersion: cached.model_version ?? MODEL_VERSION,
    sybilFlag: (cached.sybil_flag ?? 0) === 1,
    gamingIndicators: JSON.parse(cached.gaming_indicators ?? '[]') as string[],
    lastUpdated: cached.calculated_at,
    computedAt: cached.calculated_at,
    scoreFreshness: calcFreshness(cached.calculated_at, cached.expires_at),
    dimensions: zeroDimensions,
    dataAvailability: unknownAvailability,
    scoreHistory: history.map((h) => ({
      score: h.score,
      calculatedAt: h.calculated_at,
      modelVersion: h.model_version,
    })),
  }
}

export function buildZeroScore(wallet: Address, calculatedAt: string): FullScoreResponse {
  const zeroDimensions: ScoreDimensions = {
    reliability: {
      score: 0,
      data: { txCount: 0, nonce: 0, successRate: 0, lastTxTimestamp: null, failedTxCount: 0, uptimeEstimate: 0 },
    },
    viability: {
      score: 0,
      data: {
        usdcBalance: '0',
        ethBalance: '0',
        inflows30d: '0',
        outflows30d: '0',
        inflows7d: '0',
        outflows7d: '0',
        totalInflows: '0',
        walletAgedays: 0,
        everZeroBalance: false,
      },
    },
    identity: {
      score: 0,
      data: {
        erc8004Registered: false,
        hasBasename: false,
        walletAgeDays: 0,
        creatorScore: null,
        generationDepth: 0,
        constitutionHashVerified: false,
      },
    },
    capability: {
      score: 0,
      data: { activeX402Services: 0, totalRevenue: '0', domainsOwned: 0, successfulReplications: 0 },
    },
  }

  return {
    wallet,
    score: 0,
    tier: 'Unverified',
    confidence: 0,
    recommendation: 'insufficient_history',
    modelVersion: MODEL_VERSION,
    sybilFlag: false,
    gamingIndicators: [],
    lastUpdated: calculatedAt,
    computedAt: calculatedAt,
    scoreFreshness: 1.0,
    dimensions: zeroDimensions,
    dataAvailability: {
      transactionHistory: 'none (0 transactions)',
      walletAge: 'unknown',
      economicData: 'none',
      identityData: 'none',
      communityData: 'none',
    },
    improvementPath: [
      'Complete 10+ transactions to improve reliability data',
      'Maintain wallet activity for 7+ days',
      'Transact with 3+ unique partners',
      'Register a Basename (*.base.eth) or verify a GitHub repo to strengthen identity',
    ],
    scoreHistory: [],
  }
}
