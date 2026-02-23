/**
 * Scoring engine — orchestrates sybil detection, gaming checks, blockchain data
 * fetching, dimension scoring, cap/penalty application, confidence, recommendation,
 * and data availability assessment.
 */

import {
  getWalletUSDCData,
  getCurrentBlock,
  estimateWalletAgeDays,
  getTransactionCount,
  getETHBalance,
  hasBasename,
} from '../blockchain.js'
import {
  calcReliability,
  calcViability,
  calcIdentity,
  calcCapability,
} from './dimensions.js'
import { calcBehavior } from './behavior.js'
import { detectSybil } from './sybil.js'
import { detectGaming, getAvgBalance24h } from './gaming.js'
import { calcConfidence } from './confidence.js'
import { determineRecommendation } from './recommendation.js'
import { buildDataAvailability, buildImprovementPath } from './dataAvailability.js'
import { log } from '../logger.js'
import {
  db,
  upsertScore,
  getScore,
  getScoreHistory,
  scoreToTier,
  countReportsByTarget,
  countReportsAfterDate,
  countUniquePartners,
  countRatingsReceived,
  countPriorQueries,
  getRegistration,
  getWalletX402Stats,
  getWalletIndexFirstSeen,
  getTransferTimestamps,
} from '../db.js'
import type {
  Address,
  BasicScoreResponse,
  FullScoreResponse,
  ScoreDimensions,
  ScoreHistoryRow,
  DataAvailability,
  ScoreRow,
} from '../types.js'

export const MODEL_VERSION = '2.0.0'

// Max time to wait for RPC computation before falling back to identity-only score.
// On-demand user requests use this timeout so they never hang for 90-150s.
// Pass 0 to disable (used by background refresh jobs).
const SCORE_COMPUTE_TIMEOUT_MS = 75_000

// Track which wallets have a background stale-serve refresh in flight.
// Per-wallet tracking allows concurrent refreshes for DIFFERENT wallets
// while still deduplicating multiple requests for the SAME stale wallet.
// Cap the Set size to prevent unbounded memory growth if something goes wrong.
const _bgRefreshingWallets = new Set<string>()
const MAX_CONCURRENT_BG_REFRESHES = 5

/** Linear decay from 1.0 (just computed) → 0.0 (at cache expiry).
 *  Consumers can multiply their trust by this factor. */
function calcFreshness(computedAt: string, expiresAt: string): number {
  const computed = new Date(computedAt).getTime()
  const expires = new Date(expiresAt).getTime()
  const now = Date.now()
  if (expires <= computed) return 1 // degenerate — treat as fresh
  const freshness = (expires - now) / (expires - computed)
  return Math.max(0, Math.min(1, Math.round(freshness * 100) / 100))
}

// ---------- Integrity multiplier (P4) ----------

const SYBIL_FACTORS: Record<string, number> = {
  wash_trading: 0.50,
  self_funding_loop: 0.60,
  coordinated_creation: 0.65,
  single_source_funding: 0.75,
  zero_organic_activity: 0.70,
  velocity_anomaly: 0.80,
  fan_out_funding: 0.60,
  // Existing sybil.ts indicators mapped to closest factor:
  closed_loop_trading: 0.55,
  symmetric_transactions: 0.60,
  single_partner: 0.75,
  volume_without_diversity: 0.80,
  funded_by_top_partner: 0.60,
  tight_cluster: 0.55,
}

const GAMING_FACTORS: Record<string, number> = {
  balance_window_dressing: 0.85,
  burst_and_stop: 0.80,
  nonce_inflation: 0.75,
  artificial_partner_diversity: 0.70,
  revenue_recycling: 0.80,
  // Existing gaming.ts indicators mapped to closest factor:
  velocity_spike: 0.80,
  deposit_and_score: 0.85,
  wash_trading: 0.50,
}

export function computeIntegrityMultiplier(
  sybilIndicators: string[],
  gamingIndicators: string[],
  fraudReportCount: number,
): number {
  let multiplier = 1.0

  for (const ind of sybilIndicators) {
    multiplier *= SYBIL_FACTORS[ind] ?? 0.80
  }

  for (const ind of gamingIndicators) {
    multiplier *= GAMING_FACTORS[ind] ?? 0.85
  }

  if (fraudReportCount > 0) {
    multiplier *= Math.pow(0.90, fraudReportCount)
  }

  return Math.max(0.10, Math.round(multiplier * 1000) / 1000)
}

// ---------- Core calculation ----------

async function computeScore(wallet: Address): Promise<{
  composite: number
  reliability: number
  viability: number
  identity: number
  capability: number
  behavior: number
  dimensions: ScoreDimensions
  rawData: object
  confidence: number
  recommendation: string
  sybilFlag: boolean
  sybilIndicators: string[]
  gamingIndicators: string[]
  dataAvailability: DataAvailability
  improvementPath: string[]
  integrityMultiplier: number
}> {
  // ── STEP 1: Sybil detection (DB only, fast) ───────────────────────────────
  const sybil = detectSybil(wallet, db)

  // ── STEP 2: Fetch blockchain data (RPC) ───────────────────────────────────
  const [usdcData, blockNow, nonce, ethBalanceWei, basename] = await Promise.all([
    getWalletUSDCData(wallet),
    getCurrentBlock(),
    getTransactionCount(wallet),
    getETHBalance(wallet),
    hasBasename(wallet),
  ])

  const walletAgeDaysRaw = await estimateWalletAgeDays(wallet, blockNow, usdcData.firstBlockSeen)
  const currentBalanceUsdc = Number(usdcData.balance) / 1_000_000

  // ── STEP 3: Gaming checks (DB + current balance) ──────────────────────────
  const gaming = detectGaming(wallet, currentBalanceUsdc, db)

  // Effective balance for viability: use 24hr avg if window-dressing detected.
  // Computed here (before dimension calculations) so calcViability uses it.
  const effectiveBalance = gaming.overrides.useAvgBalance
    ? (getAvgBalance24h(wallet, db) ?? currentBalanceUsdc)
    : currentBalanceUsdc
  const effectiveBalanceRaw = BigInt(Math.round(effectiveBalance * 1_000_000))

  // Override balance in usdcData so calcViability scores the adjusted amount
  const usdcDataForViability = gaming.overrides.useAvgBalance
    ? { ...usdcData, balance: effectiveBalanceRaw }
    : usdcData

  // ── STEP 4: Calculate 4 dimensions ────────────────────────────────────────
  const reg = getRegistration(wallet.toLowerCase())
  const x402Stats = getWalletX402Stats(wallet)

  // Use the earliest known date across: RPC scan + x402 indexer + wallet_index
  // This extends age beyond the 90-day RPC window if the indexer has older data.
  const x402FirstSeen = x402Stats.x402FirstSeen
  const walletIndexFirstSeen = getWalletIndexFirstSeen(wallet)

  // Pick the earliest date among all sources
  const candidates = [x402FirstSeen, walletIndexFirstSeen].filter(Boolean) as string[]
  let walletAgeDays = walletAgeDaysRaw ?? 0
  if (candidates.length > 0) {
    const earliestMs = Math.min(...candidates.map(d => new Date(d).getTime()))
    const fromIndexDays = (Date.now() - earliestMs) / 86_400_000
    walletAgeDays = Math.max(walletAgeDays, Math.round(fromIndexDays))
  }

  const [rel, via, cap] = await Promise.all([
    Promise.resolve(calcReliability(usdcData, blockNow, nonce)),
    Promise.resolve(calcViability(usdcDataForViability, walletAgeDays, ethBalanceWei)),
    Promise.resolve(calcCapability(usdcData, x402Stats)),
  ])
  const idn = await calcIdentity(
    wallet,
    walletAgeDays,
    null,
    !!reg,
    reg?.github_verified === 1,
    reg?.github_stars ?? null,
    reg?.github_pushed_at ?? null,
    basename,
  )

  // ── STEP 4b: Behavior dimension (DB-only, no RPC) ────────────────────────
  const behaviorTimestamps = getTransferTimestamps(wallet)
  const behaviorResult = calcBehavior(behaviorTimestamps)

  // ── STEP 5: Dimension scores — apply sybil caps + gaming penalties ────────
  // Sybil caps are surgical: they limit individual dimensions that are likely
  // inflated by sybil activity (e.g., symmetric_transactions → cap Reliability at 30).
  // Gaming penalties are subtractive: they reduce specific dimensions based on
  // detected gaming patterns (e.g., burst_and_stop → -8 Reliability).
  // The integrity multiplier (Step 7) is a separate, blunt instrument applied
  // to the composite score for overall trust reduction.
  let relScore = rel.score
  let viaScore = via.score
  let idnScore = idn.score
  const capScore = cap.score
  const behScore = behaviorResult.score

  // Apply sybil caps — clamp dimensions to ceilings when sybil patterns detected
  if (sybil.caps.reliability !== undefined) {
    relScore = Math.min(relScore, sybil.caps.reliability)
  }
  if (sybil.caps.identity !== undefined) {
    idnScore = Math.min(idnScore, sybil.caps.identity)
  }

  // Apply gaming penalties — subtract per-dimension deductions
  relScore = Math.max(0, relScore - gaming.penalties.reliability)
  viaScore = Math.max(0, viaScore - gaming.penalties.viability)

  // ── STEP 6: Calculate raw composite ─────────────────────────────────────
  const rawComposite = Math.round(
    relScore * 0.30 + viaScore * 0.25 + idnScore * 0.20 + behScore * 0.15 + capScore * 0.10,
  )

  // ── STEP 7: P4 — Multiplicative integrity modifier ──────────────────────
  const reportCount = countReportsByTarget(wallet)
  const integrityMultiplier = computeIntegrityMultiplier(
    sybil.indicators,
    gaming.indicators,
    reportCount,
  )
  const composite = Math.round(rawComposite * integrityMultiplier)

  // ── STEP 9: Calculate confidence ──────────────────────────────────────────
  const uniquePartners = countUniquePartners(wallet)
  const ratingCount = countRatingsReceived(wallet)
  const priorQueryCount = countPriorQueries(wallet)

  const confidence = calcConfidence({
    txCount: usdcData.transferCount,
    walletAgeDays,
    uniquePartners,
    ratingCount,
    priorQueryCount,
  })

  // ── STEP 10: Determine recommendation ─────────────────────────────────────
  const recommendation = determineRecommendation({
    score: composite,
    confidence,
    sybilFlag: sybil.sybilFlag,
    gamingDetected: gaming.gamingDetected,
  })

  // ── STEP 11: Build data availability + improvement path ───────────────────
  const dataAvailability = buildDataAvailability({
    txCount: usdcData.transferCount,
    walletAgeDays,
    usdcBalance: effectiveBalance,
    ratingCount,
    uniquePartners,
  })

  const improvementPath = buildImprovementPath({
    txCount: usdcData.transferCount,
    walletAgeDays,
    uniquePartners,
    hasBasename: idn.hasBasename,
    githubVerified: !!reg?.github_verified,
    confidence,
  })

  // ── Assemble dimensions object with cap/penalty-adjusted scores ──────────
  const dimensions: ScoreDimensions = {
    reliability: {
      score: relScore,
      data: {
        txCount: rel.txCount,
        nonce: rel.nonce,
        successRate: rel.successRate,
        lastTxTimestamp: rel.lastTxTimestamp,
        failedTxCount: rel.failedTxCount,
        uptimeEstimate: rel.uptimeEstimate,
      },
    },
    viability: {
      score: viaScore,
      data: {
        usdcBalance: via.usdcBalance,
        ethBalance: via.ethBalance,
        inflows30d: via.inflows30d,
        outflows30d: via.outflows30d,
        inflows7d: via.inflows7d,
        outflows7d: via.outflows7d,
        totalInflows: via.totalInflows,
        walletAgedays: via.walletAgedays,
        everZeroBalance: via.everZeroBalance,
      },
    },
    identity: {
      score: idnScore,
      data: {
        erc8004Registered: idn.erc8004Registered,
        hasBasename: idn.hasBasename,
        walletAgeDays: idn.walletAgeDays,
        creatorScore: idn.creatorScore,
        generationDepth: idn.generationDepth,
        constitutionHashVerified: idn.constitutionHashVerified,
      },
    },
    capability: {
      score: capScore,
      data: {
        activeX402Services: cap.activeX402Services,
        totalRevenue: cap.totalRevenue,
        domainsOwned: cap.domainsOwned,
        successfulReplications: cap.successfulReplications,
      },
    },
    behavior: {
      score: behScore,
      data: behaviorResult.data,
    },
  }

  // ── P5: Explainability breakdown ──────────────────────────────────────
  const breakdown: Record<string, Record<string, number>> = {
    reliability: rel.signals,
    viability: via.signals,
    identity: idn.signals,
    capability: cap.signals,
    behavior: behaviorResult.signals,
  }

  const halfWidth = Math.round((1 - confidence) * 15)
  const scoreRange = {
    low: Math.max(0, composite - halfWidth),
    high: Math.min(100, composite + halfWidth),
  }

  const allSignals: { name: string; points: number }[] = []
  for (const [dim, signals] of Object.entries(breakdown)) {
    for (const [signal, points] of Object.entries(signals)) {
      allSignals.push({ name: `${dim}.${signal}`, points })
    }
  }
  const sorted = allSignals.sort((a, b) => b.points - a.points)
  const topContributors = sorted.slice(0, 5).map((s) => `${s.name} (${s.points} pts)`)
  const topDetractors = sorted
    .filter((s) => s.points === 0)
    .slice(0, 5)
    .map((s) => `${s.name} (0 pts)`)

  return {
    composite,
    reliability: relScore,
    viability: viaScore,
    identity: idnScore,
    capability: capScore,
    behavior: behScore,
    dimensions,
    breakdown,
    scoreRange,
    topContributors,
    topDetractors,
    rawData: {
      usdcData: {
        balance:       String(usdcData.balance),
        inflows30d:    String(usdcData.inflows30d),
        outflows30d:   String(usdcData.outflows30d),
        inflows7d:     String(usdcData.inflows7d),
        outflows7d:    String(usdcData.outflows7d),
        totalInflows:  String(usdcData.totalInflows),
        totalOutflows: String(usdcData.totalOutflows),
        transferCount: usdcData.transferCount,
        firstBlockSeen: usdcData.firstBlockSeen !== null ? String(usdcData.firstBlockSeen) : null,
        lastBlockSeen:  usdcData.lastBlockSeen  !== null ? String(usdcData.lastBlockSeen)  : null,
      },
      walletAgeDays,
      nonce,
      ethBalanceWei: String(ethBalanceWei),
      basename,
    },
    confidence,
    recommendation,
    sybilFlag: sybil.sybilFlag,
    sybilIndicators: sybil.indicators,
    gamingIndicators: gaming.indicators,
    dataAvailability,
    improvementPath,
    integrityMultiplier,
  }
}

// ---------- Public API ----------

/**
 * Fetch score from cache if fresh, otherwise recalculate and cache.
 * Returns { stale: true } when falling back to an expired cache entry due to RPC failure.
 *
 * @param timeoutMs - max ms to wait for the RPC scan before falling back to identity-only.
 *                    Pass 0 to disable (background refresh jobs should pass 0).
 */
export async function getOrCalculateScore(
  wallet: Address,
  forceRefresh = false,
  timeoutMs = SCORE_COMPUTE_TIMEOUT_MS,
): Promise<FullScoreResponse & { stale?: boolean }> {
  const cached = getScore(wallet)
  const now = new Date()

  if (!forceRefresh && cached && new Date(cached.expires_at) > now) {
    const history = getScoreHistory(wallet)
    const result = buildFullResponseFromCache(wallet, cached, history)
    // Apply fraud-report dampening ONLY for reports filed AFTER this score was cached.
    // The cached composite_score already includes the integrity multiplier (sybil + gaming
    // + reports) from compute time — reapplying all factors would double-penalize.
    const newReports = countReportsAfterDate(wallet, cached.calculated_at)
    if (newReports > 0) {
      const fraudMult = Math.pow(0.90, newReports)
      result.score = Math.round(result.score * fraudMult)
      result.tier = scoreToTier(result.score) as FullScoreResponse['tier']
    }
    return result
  }

  // If there's a stale cached score, return it immediately and refresh in background.
  // This prevents fly.io's 30s proxy timeout from firing on first-time-seen wallets.
  if (!forceRefresh && cached) {
    const history = getScoreHistory(wallet)
    const staleResult = buildFullResponseFromCache(wallet, cached, history)
    // Apply fraud-report dampening ONLY for reports filed AFTER this score was cached.
    const newReports = countReportsAfterDate(wallet, cached.calculated_at)
    if (newReports > 0) {
      const fraudMult = Math.pow(0.90, newReports)
      staleResult.score = Math.round(staleResult.score * fraudMult)
      staleResult.tier = scoreToTier(staleResult.score) as FullScoreResponse['tier']
    }
    // Fire-and-forget background refresh — deduplicated per wallet, capped globally.
    // Without this guard, 25 simultaneous requests for stale wallets would fire 25
    // concurrent computeScore calls (each doing 120+ getLogs), OOM-ing the machine.
    const wKey = wallet.toLowerCase()
    if (!_bgRefreshingWallets.has(wKey) && _bgRefreshingWallets.size < MAX_CONCURRENT_BG_REFRESHES) {
      _bgRefreshingWallets.add(wKey)
      computeScore(wallet).then(result => {
        upsertScore(wallet, result.composite, result.reliability, result.viability, result.identity, result.capability, result.behavior, result.rawData, {
          confidence: result.confidence,
          recommendation: result.recommendation,
          modelVersion: MODEL_VERSION,
          sybilFlag: result.sybilFlag,
        })
      }).catch(() => { /* ignore background refresh errors */ }).finally(() => {
        _bgRefreshingWallets.delete(wKey)
      })
    }
    return { ...staleResult, stale: true }
  }

  try {
    const scorePromise = computeScore(wallet)
    const result = await (timeoutMs > 0
      ? Promise.race([
          scorePromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('rpc_timeout')), timeoutMs),
          ),
        ])
      : scorePromise)
    // Integrity multiplier already applied inside computeScore — just persist
    const tier = scoreToTier(result.composite)

    upsertScore(
      wallet,
      result.composite,
      result.reliability,
      result.viability,
      result.identity,
      result.capability,
      result.behavior,
      result.rawData,
      {
        confidence: result.confidence,
        recommendation: result.recommendation,
        modelVersion: MODEL_VERSION,
        sybilFlag: result.sybilFlag,
        sybilIndicators: result.sybilIndicators,
        gamingIndicators: result.gamingIndicators,
      },
    )

    const history = getScoreHistory(wallet)
    const calculatedAt = new Date().toISOString()
    return buildFullResponseFromDimensions(
      wallet,
      result.composite,
      tier,
      calculatedAt,
      result.dimensions,
      history,
      {
        confidence: result.confidence,
        recommendation: result.recommendation,
        sybilFlag: result.sybilFlag,
        gamingIndicators: result.gamingIndicators,
        dataAvailability: result.dataAvailability,
        improvementPath: result.improvementPath,
        integrityMultiplier: result.integrityMultiplier,
        breakdown: result.breakdown,
        scoreRange: result.scoreRange,
        topContributors: result.topContributors,
        topDetractors: result.topDetractors,
      },
    )
  } catch (err) {
    log.error('engine', `RPC error for ${wallet}`, err)

    if (cached) {
      const history = getScoreHistory(wallet)
      return {
        ...buildFullResponseFromCache(wallet, cached, history),
        stale: true,
      }
    }

    // RPC unavailable — still compute identity from DB (no RPC required)
    let idnScore = 0
    try {
      const reg = getRegistration(wallet.toLowerCase())
      const idn = await calcIdentity(
        wallet, 0, null,
        !!reg,
        reg?.github_verified === 1,
        reg?.github_stars ?? null,
        reg?.github_pushed_at ?? null,
      )
      idnScore = idn.score
    } catch (_) { /* ignore — best effort */ }

    // Composite is identity-only; other dimensions require RPC
    const partial = Math.round(idnScore * 0.20)
    const calculatedAt = new Date().toISOString()

    // Only cache if there's a meaningful partial score — don't cache hard zeros,
    // so the next request retries the full RPC scan rather than serving 0.
    if (partial > 0) {
      try {
        upsertScore(wallet, partial, 0, 0, idnScore, 0, null, {}, { recommendation: 'rpc_unavailable', confidence: 0 })
      } catch (_) { /* ignore */ }
    }

    // Return the identity-only partial score rather than a hard zero so the
    // caller sees a meaningful (if incomplete) score when the RPC is down.
    if (partial > 0) {
      const tier = scoreToTier(partial)
      return {
        wallet,
        score: partial,
        tier: tier as FullScoreResponse['tier'],
        confidence: 0,
        recommendation: 'rpc_unavailable',
        modelVersion: MODEL_VERSION,
        sybilFlag: false,
        gamingIndicators: [],
        lastUpdated: calculatedAt,
        computedAt: calculatedAt,
        scoreFreshness: 1.0,
        dimensions: {
          reliability: { score: 0, data: { txCount: 0, nonce: 0, successRate: 0, lastTxTimestamp: null, failedTxCount: 0, uptimeEstimate: 0 } },
          viability:   { score: 0, data: { usdcBalance: '0', ethBalance: '0', inflows30d: '0', outflows30d: '0', inflows7d: '0', outflows7d: '0', totalInflows: '0', walletAgedays: 0, everZeroBalance: false } },
          identity:    { score: idnScore, data: { erc8004Registered: false, hasBasename: false, walletAgeDays: 0, creatorScore: null, generationDepth: 0, constitutionHashVerified: false } },
          capability:  { score: 0, data: { activeX402Services: 0, totalRevenue: '0', domainsOwned: 0, successfulReplications: 0 } },
        },
        dataAvailability: {
          transactionHistory: 'none (rpc unavailable)',
          walletAge: 'unknown',
          economicData: 'none',
          identityData: 'partial',
          communityData: 'none',
        },
        improvementPath: ['Retry later — blockchain data scan timed out; identity signals computed successfully'],
        scoreHistory: [],
      }
    }

    return buildZeroScore(wallet, calculatedAt)
  }
}

// ---------- Private builders ----------

function buildFullResponseFromDimensions(
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

function buildFullResponseFromCache(
  wallet: Address,
  cached: ScoreRow,
  history: ScoreHistoryRow[],
): FullScoreResponse {
  // Re-hydrate raw_data so dimension detail fields contain real values instead of zeros.
  interface StoredUsdcData {
    balance?: string; inflows30d?: string; outflows30d?: string
    inflows7d?: string; outflows7d?: string; totalInflows?: string
    transferCount?: number; walletAgedays?: number
  }
  interface StoredRaw { usdcData?: StoredUsdcData; walletAgeDays?: number }
  let raw: StoredRaw = {}
  try { raw = JSON.parse(cached.raw_data ?? '{}') as StoredRaw } catch { /* ignore */ }
  const ud = raw.usdcData ?? {}
  const walletAgeDays = raw.walletAgeDays ?? 0
  const txCount = ud.transferCount ?? 0
  const bal = ud.balance ?? '0'
  const balUsd = Number(bal) / 1_000_000
  const everZeroBalance = balUsd === 0 && Number(ud.totalInflows ?? '0') > 0
  const fmt = (v?: string) => ((Number(v ?? '0') / 1_000_000).toFixed(6))

  interface StoredRawExt extends StoredRaw { nonce?: number; ethBalanceWei?: string; basename?: boolean }
  const rawExt = raw as StoredRawExt

  const zeroDimensions: ScoreDimensions = {
    reliability: {
      score: cached.reliability_score,
      data: { txCount, nonce: rawExt.nonce ?? 0, successRate: txCount > 0 ? 1 : 0, lastTxTimestamp: null, failedTxCount: 0, uptimeEstimate: 0 },
    },
    viability: {
      score: cached.viability_score,
      data: {
        usdcBalance: fmt(bal),
        ethBalance: rawExt.ethBalanceWei ? (Number(rawExt.ethBalanceWei) / 1e18).toFixed(6) : '0.000000',
        inflows30d:  fmt(ud.inflows30d),
        outflows30d: fmt(ud.outflows30d),
        inflows7d:   fmt(ud.inflows7d),
        outflows7d:  fmt(ud.outflows7d),
        totalInflows: fmt(ud.totalInflows),
        walletAgedays: walletAgeDays,
        everZeroBalance,
      },
    },
    identity: {
      score: cached.identity_score,
      data: { erc8004Registered: false, hasBasename: rawExt.basename ?? false, walletAgeDays, creatorScore: null, generationDepth: 0, constitutionHashVerified: false },
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

function buildZeroScore(wallet: Address, calculatedAt: string): FullScoreResponse {
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
      data: { erc8004Registered: false, hasBasename: false, walletAgeDays: 0, creatorScore: null, generationDepth: 0, constitutionHashVerified: false },
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

// Re-export for convenience (used by freeTier middleware)
export type { BasicScoreResponse }
