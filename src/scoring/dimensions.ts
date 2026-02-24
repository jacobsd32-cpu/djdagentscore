/**
 * Scoring dimensions — each function returns an integer 0-100.
 *
 * AgentScore = (Reliability × 0.35) + (Viability × 0.30)
 *            + (Identity × 0.20)    + (Capability × 0.15)
 *
 * ── Point budget design rationale ──
 *
 * Each dimension targets 100 points max, allocated across sub-signals so that
 * a "healthy, active agent" lands at ~70-80 without gaming. Thresholds are
 * calibrated against real Base mainnet activity patterns observed Dec 2024-Jan 2025.
 *
 * Transaction counts: 10 tx = hobbyist, 100 = active service, 1000+ = high-volume.
 *   These map to piecewiseLog breakpoints for diminishing returns.
 *
 * USDC balances: $1 = dust, $10 = funded, $50+ = operating capital, $100+ = serious.
 *   Agent wallets typically hold less than DeFi whales; thresholds reflect x402
 *   micropayment economics ($0.01-$1 per API call).
 *
 * Time windows: 7d = recent trend, 30d = medium-term health, 90d = established.
 *   Blocks-per-day on Base ≈ 43,200 (1 block / 2 seconds).
 *
 * ETH balance: Agents need gas to transact. 0.001 ETH ≈ ~100 L2 txs,
 *   0.01 ETH ≈ ~1000, 0.1 ETH = very well funded for gas.
 *
 * Identity points: On-chain identity signals are scarce. Basenames and GitHub
 *   verification are weighted heavily because they require deliberate, paid,
 *   or reputation-linked action — much harder to Sybil than raw tx counts.
 */

import {
  usdcToFloat,
  estimateWalletAgeDays,
} from '../blockchain.js'
import type {
  WalletUSDCData,
  ReliabilityData,
  ViabilityData,
  IdentityData,
  CapabilityData,
} from '../types.js'

// ---------- helpers ----------

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

/** Piecewise log-linear interpolation between known breakpoints */
function piecewiseLog(
  value: number,
  breakpoints: Array<[number, number]>, // [input, output] sorted ascending
): number {
  if (value <= breakpoints[0][0]) return breakpoints[0][1]
  if (value >= breakpoints[breakpoints.length - 1][0])
    return breakpoints[breakpoints.length - 1][1]

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [x0, y0] = breakpoints[i]
    const [x1, y1] = breakpoints[i + 1]
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return 0
}

// ---------- Dimension 1: Transaction Reliability (35%) ----------

export function calcReliability(data: WalletUSDCData, blockNow: bigint, nonce: number): ReliabilityData & { score: number; signals: Record<string, number> } {
  let pts = 0

  // --- Payment success rate (up to 30 pts) ---
  // On-chain we only see confirmed transfers; we treat presence of transactions
  // as an approximation of success rate.
  // Breakpoints: 1+ tx = 15 (baseline exists), 5+ = 25 (repeat usage), 20+ = 30 (proven).
  // 5 tx chosen as "repeat usage" — one-off tests typically produce 1-3 txs.
  // 20 tx chosen as "proven" — indicates sustained real usage, not just testing.
  const txCount = data.transferCount
  const successRatePts = txCount === 0 ? 0 : Math.min(30, 15 + (txCount > 5 ? 10 : 0) + (txCount > 20 ? 5 : 0))
  pts += successRatePts

  // --- Total completed transactions log-scale (up to 25 pts) ---
  // Breakpoints: 0→0, 10→5, 100→15, 1000→25
  const txPts = txCount === 0
    ? 0
    : piecewiseLog(txCount, [[0, 0], [10, 5], [100, 15], [1000, 25]])
  pts += txPts

  // --- Nonce (total txs ever sent): up to 20 pts ---
  // The nonce is the authoritative count of all transactions originating from this wallet,
  // not just USDC transfers. A high nonce = actively operated over a long period.
  // 1 tx = minimal (3 pts), 10 = light use (8), 100 = moderate (15), 1000+ = power user (20).
  // Log-scale steps because nonce growth follows a power law distribution.
  let noncePts = 0
  if (nonce >= 1000) noncePts = 20
  else if (nonce >= 100) noncePts = 15
  else if (nonce >= 10) noncePts = 8
  else if (nonce >= 1) noncePts = 3
  pts += noncePts

  // --- Service uptime proxy (up to 25 pts) ---
  // Estimate by how consistently transactions appear over the window.
  // Simple heuristic: spread of first→last block relative to window size.
  // A ratio of 1.0 means activity spans the entire 90-day window.
  // 90 days × 43,200 blocks/day = 3,888,000 blocks window.
  // This penalises wallets that had a brief flurry then went dormant.
  let uptimeEstimate = 0
  if (data.firstBlockSeen !== null && data.lastBlockSeen !== null) {
    const spanBlocks = Number(data.lastBlockSeen - data.firstBlockSeen)
    const windowBlocks = 90 * 43_200 // 90 days in blocks
    const ratio = Math.min(1, spanBlocks / windowBlocks)
    uptimeEstimate = ratio
    pts += Math.round(ratio * 25)
  }

  // --- Failed tx penalty: not yet implemented ---
  // Requires trace-level RPC data (debug_traceTransaction) to detect reverted calls.
  // Transfer events alone don't expose failed txs. Reserved for future improvement.

  // --- Recency (up to 20 pts) ---
  // How recently the wallet transacted. Rewards continuously active agents.
  // <24h = full (20), <7d = recent (15), <30d = stale (5), >30d = dormant (0).
  // 1,800 blocks/hr = 43,200/day on Base (2s block time).
  let recencyPts = 0
  if (data.lastBlockSeen !== null) {
    const blocksAgo = Number(blockNow - data.lastBlockSeen)
    const BLOCKS_PER_HOUR = 1_800
    if (blocksAgo <= BLOCKS_PER_HOUR * 24) recencyPts = 20
    else if (blocksAgo <= BLOCKS_PER_HOUR * 24 * 7) recencyPts = 15
    else if (blocksAgo <= BLOCKS_PER_HOUR * 24 * 30) recencyPts = 5
    else recencyPts = 0
  }
  pts += recencyPts

  const lastTxTimestamp = data.lastBlockSeen !== null
    ? Date.now() - Number(blockNow - data.lastBlockSeen) * 2_000 // ~2s per block
    : null

  const signals: Record<string, number> = {
    txSuccessRate: successRatePts,
    txCountLog: Math.round(txPts),
    nonceAlignment: noncePts,
    uptimeEstimate: data.firstBlockSeen !== null && data.lastBlockSeen !== null
      ? Math.round(uptimeEstimate * 25)
      : 0,
    recencyBonus: recencyPts,
  }

  return {
    score: clampScore(pts),
    signals,
    txCount,
    nonce,
    successRate: txCount === 0 ? 0 : successRatePts / 30,
    lastTxTimestamp,
    failedTxCount: 0, // not yet detectable — see comment above
    uptimeEstimate,
  }
}

// ---------- Dimension 2: Economic Viability (30%) ----------

export function calcViability(data: WalletUSDCData, walletAgeDays: number | null, ethBalanceWei: bigint): ViabilityData & { score: number; signals: Record<string, number> } {
  let pts = 0

  const balanceUsd = usdcToFloat(data.balance)
  const inflows30 = usdcToFloat(data.inflows30d)
  const outflows30 = usdcToFloat(data.outflows30d)
  const inflows7 = usdcToFloat(data.inflows7d)
  const outflows7 = usdcToFloat(data.outflows7d)
  const totalInflowsUsd = usdcToFloat(data.totalInflows)

  // --- ETH balance (up to 15 pts) ---
  // Having ETH for gas means the wallet is actively operated and can transact.
  // 0.001 ETH ≈ $2-3, enough for ~100 L2 txs at ~$0.01-0.03 each.
  // 0.01 ETH ≈ $25, enough for ~1000 L2 txs — serious operational wallet.
  // 0.1 ETH ≈ $250, very well funded for an agent's gas needs.
  const ethBalanceEth = Number(ethBalanceWei) / 1e18
  let ethBalPts = 0
  if (ethBalanceEth >= 0.1) ethBalPts = 15
  else if (ethBalanceEth >= 0.01) ethBalPts = 10
  else if (ethBalanceEth >= 0.001) ethBalPts = 5
  else if (ethBalanceEth > 0) ethBalPts = 2
  pts += ethBalPts

  // --- USDC balance (up to 25 pts) ---
  // x402 agents earn/spend small amounts: $1 = has some funds, $10 = can
  // sustain operations, $50 = healthy reserve, $100+ = well-capitalised.
  // Thresholds are low compared to DeFi because agent micropayments are tiny.
  let balPts = 0
  if (balanceUsd > 100) balPts = 25
  else if (balanceUsd > 50) balPts = 20
  else if (balanceUsd > 10) balPts = 15
  else if (balanceUsd > 1) balPts = 5
  pts += balPts

  // --- Income vs burn ratio (up to 30 pts) ---
  // Measures economic sustainability: is the agent earning more than spending?
  // >2x = very profitable (30), >1.5x = healthy (25), >1x = breaking even (15),
  // <1x = burning reserves (5). Pure income with 0 outflows = perfect (30).
  let ratioPts = 0
  if (outflows30 > 0) {
    const ratio = inflows30 / outflows30
    if (ratio > 2) ratioPts = 30
    else if (ratio > 1.5) ratioPts = 25
    else if (ratio > 1) ratioPts = 15
    else ratioPts = 5
  } else if (inflows30 > 0) {
    ratioPts = 30 // pure income, no burn
  }
  pts += ratioPts

  // --- Days since first transaction (up to 30 pts) ---
  // Breakpoints: 1d→5, 7d→15, 30d→25, 90d→30.
  // Wallet age is a Sybil resistance signal: older wallets are more expensive to create
  // en masse. 90 days is the "established" threshold matching the scoring window.
  let agePts = 0
  if (walletAgeDays !== null && walletAgeDays > 0) {
    agePts = Math.round(piecewiseLog(walletAgeDays, [[0, 0], [1, 5], [7, 15], [30, 25], [90, 30]]))
  }
  pts += agePts

  // --- Ever had zero balance (-15 pts if yes) ---
  // A wallet that drained to 0 USDC had a period where it couldn't honour
  // x402 payments. This is a strong negative viability signal. -15 pts is
  // significant but not fatal — a wallet can recover by rebuilding balance.
  const everZeroBalance = balanceUsd === 0 && data.totalOutflows > 0n
  if (everZeroBalance) pts -= 15

  // --- 7-day balance trend (up to 15 pts) ---
  // Compares 7-day net flows to 30-day net flows to detect trajectory.
  // Rising = net positive 7d ≥ 50% of 30d net (15 pts).
  // Stable = net 7d near zero ±$1 (10 pts).
  // Declining = net negative but >-$50 (5 pts) — still potentially viable.
  // Freefall = net negative <-$50 (0 pts) — significant capital flight.
  // $50 threshold chosen because it represents ~500 typical x402 API calls.
  let trendPts = 0
  const net7 = inflows7 - outflows7
  const net30 = inflows30 - outflows30
  if (net7 > 0 && net7 >= net30 * 0.5) trendPts = 15       // rising
  else if (Math.abs(net7) < 1) trendPts = 10               // stable
  else if (net7 < 0 && net7 > -50) trendPts = 5            // declining
  else trendPts = 0                                         // freefall
  pts += trendPts

  const signals: Record<string, number> = {
    ethBalance: ethBalPts,
    usdcBalance: balPts,
    incomeRatio: ratioPts,
    walletAge: agePts,
    zeroBalancePenalty: everZeroBalance ? -15 : 0,
    balanceTrend: trendPts,
  }

  return {
    score: clampScore(pts),
    signals,
    usdcBalance: usdcToFloat(data.balance).toFixed(6),
    ethBalance: ethBalanceEth.toFixed(6),
    inflows30d: inflows30.toFixed(6),
    outflows30d: outflows30.toFixed(6),
    inflows7d: inflows7.toFixed(6),
    outflows7d: outflows7.toFixed(6),
    totalInflows: totalInflowsUsd.toFixed(6),
    walletAgedays: walletAgeDays ?? 0,
    everZeroBalance,
  }
}

// ---------- Dimension 3: Identity & Lineage (20%) ----------

function calcGithubActivityPts(
  githubVerified: boolean,
  githubStars: number | null | undefined,
  githubPushedAt: string | null | undefined,
): number {
  if (!githubVerified) return 0
  let pts = 0
  if ((githubStars ?? 0) >= 5) pts += 5
  else if ((githubStars ?? 0) >= 1) pts += 3
  if (githubPushedAt) {
    const daysSincePush = (Date.now() - new Date(githubPushedAt).getTime()) / 86_400_000
    if (daysSincePush <= 30) pts += 10
    else if (daysSincePush <= 90) pts += 5
  }
  return pts
}

function calcWalletAgePts(walletAgeDays: number | null | undefined): number {
  const ageDays = walletAgeDays ?? 0
  if (ageDays > 180) return 30
  if (ageDays > 90) return 20
  if (ageDays > 30) return 15
  if (ageDays > 7) return 8
  return 2
}

export async function calcIdentity(
  wallet: `0x${string}`,
  walletAgeDays: number | null,
  creatorScore: number | null = null,
  isRegistered = false,
  githubVerified = false,
  githubStars: number | null = null,
  githubPushedAt: string | null = null,
  basename = false,
): Promise<IdentityData & { score: number; signals: Record<string, number> }> {
  let pts = 0

  // --- Agent self-registration (10 pts) ---
  // Baseline: the operator has intentionally claimed this wallet via our API.
  // Worth less than Basename/GitHub because registration is free and unsecured
  // (no ownership proof beyond knowing the address). Still valuable as intent signal.
  if (isRegistered) pts += 10

  // --- Basename (20 pts) ---
  // Owning a *.base.eth name is a deliberate, paid, on-chain identity commitment.
  // Costs ~$5-10 to register, cannot be freely spoofed. Worth more than
  // self-registration because it requires real economic commitment on Base.
  // (Increased from 15→20 after removing phantom ERC-8004 points.)
  if (basename) pts += 20

  // --- Verified GitHub repo (25 pts) ---
  // Operator linked a real, public GitHub repo — strongest currently available
  // identity signal. Ties the agent to a reputational identity (GitHub account)
  // that is hard to mass-produce.
  // (Increased from 20→25 after removing phantom ERC-8004 points.)
  if (githubVerified) pts += 25

  // --- GitHub activity bonuses (up to 15 pts) ---
  pts += calcGithubActivityPts(githubVerified, githubStars, githubPushedAt)

  // --- ERC-8004 registry: NOT YET DEPLOYED ---
  // The ERC-8004 agent registry standard has no deployed contract on Base mainnet.
  // Previously allocated 20 pts here, but since checkERC8004Registration() always
  // returned false (zero address), those points were phantom — unachievable.
  // The 20 pts have been redistributed: +5 Basename, +5 GitHub verified, +5 wallet age.
  // When/if ERC-8004 deploys, re-add scoring here and adjust point budget.
  const erc8004Registered = false

  // --- Wallet age (up to 30 pts) ---
  // Older wallets are harder to spin up cheaply for Sybil attacks.
  // 7d (8pts) = past initial testing, 30d (15) = survived a month,
  // 90d (20) = established quarter, 180d+ (30) = long-running operator.
  // Even brand-new wallets get 2 pts as a baseline — don't zero out entirely.
  // (Increased from 25→30 after removing phantom ERC-8004 points.)
  const ageDays = walletAgeDays ?? 0
  pts += calcWalletAgePts(walletAgeDays)

  // Fields kept for API compatibility (not actively scored until ERC-8004 deploys)
  const generationDepth = 0
  const constitutionHashVerified = false

  // --- Compute individual signal contributions for explainability ---
  const registrationPts = isRegistered ? 10 : 0
  const basenamePts = basename ? 20 : 0
  const githubVerifiedPts = githubVerified ? 25 : 0
  const githubActivityPts = calcGithubActivityPts(githubVerified, githubStars, githubPushedAt)
  const walletAgePts = calcWalletAgePts(walletAgeDays)

  const signals: Record<string, number> = {
    registration: registrationPts,
    basename: basenamePts,
    githubVerified: githubVerifiedPts,
    githubActivity: githubActivityPts,
    walletAge: walletAgePts,
  }

  return {
    score: clampScore(pts),
    signals,
    erc8004Registered,
    hasBasename: basename,
    walletAgeDays: ageDays,
    creatorScore,
    generationDepth,
    constitutionHashVerified,
  }
}

// ---------- Dimension 4: Capability Signal (15%) ----------

export function calcCapability(
  data: WalletUSDCData,
  x402Stats?: { x402TxCount: number; x402InflowsUsd: number; x402OutflowsUsd: number }
): CapabilityData & { score: number; signals: Record<string, number> } {
  let pts = 0

  // If we have x402-specific data from the indexer, use it; else fall back to heuristic
  const hasX402Data = x402Stats !== undefined && x402Stats.x402TxCount > 0
  const x402TxCount = x402Stats?.x402TxCount ?? 0
  const x402Revenue = x402Stats?.x402InflowsUsd ?? 0

  // --- Active x402 services (up to 50 pts) ---
  // Weight increased from 30→50 to compensate for unimplemented features (domains,
  // replications) so agents can reach 100. Will be rebalanced when those ship.
  // Estimates how many distinct x402 endpoints this agent operates or consumes.
  // With real indexer data: 5 tx = 2 services (minimum real usage), 20 = 3 (active),
  //   50+ = 4 (multi-service operator). Single-digit tx count is likely one service testing.
  // Heuristic fallback: uses avg inflow size <$5 as x402 micropayment fingerprint
  //   (typical x402 calls cost $0.01–$1). If avg inflow is higher, it's probably
  //   a regular USDC transfer, not x402 revenue — count as 1 service max.
  //   20 tx per service estimate: a service typically handles 20+ calls before going idle.
  let x402ServicesPts = 0
  let activeX402Services = 0
  if (hasX402Data) {
    activeX402Services = x402TxCount >= 50 ? 4 : x402TxCount >= 20 ? 3 : x402TxCount >= 5 ? 2 : 1
    x402ServicesPts = activeX402Services >= 4 ? 50 : activeX402Services === 3 ? 40 : activeX402Services === 2 ? 25 : 12
  } else {
    const avgInflow = data.transferCount > 0
      ? usdcToFloat(data.totalInflows) / data.transferCount
      : 0
    if (avgInflow < 5 && data.transferCount > 5) {
      // Smooth ramp: 5 tx = 1, 15 = 1, 20 = 2, 40 = 2, 50 = 3, 80+ = 4
      activeX402Services = Math.min(4, Math.max(1, Math.floor(data.transferCount / 20) + 1))
    } else if (data.transferCount > 0) {
      activeX402Services = 1
    }
    // Smooth point curve instead of cliff jumps
    x402ServicesPts = activeX402Services >= 4 ? 50
      : activeX402Services === 3 ? 40
      : activeX402Services === 2 ? 30
      : activeX402Services === 1 ? 15
      : 0
  }
  pts += x402ServicesPts

  // --- Total revenue earned (up to 50 pts) — prefer x402-specific revenue if available ---
  // Weight increased from 30→50 to compensate for unimplemented features.
  // $1 = has earned anything (15 pts), $50 = viable business (30), $500+ = proven revenue (50).
  // $50 ≈ 500 API calls at $0.10 each — a real product with real users.
  // $500 ≈ 5000 calls — a successful x402 service generating meaningful income.
  // Falls back to total USDC inflows when x402-specific indexer data isn't available.
  const totalRevenue = hasX402Data ? x402Revenue : usdcToFloat(data.totalInflows)
  let revPts = 0
  if (totalRevenue > 500) revPts = 50
  else if (totalRevenue > 50) revPts = 30
  else if (totalRevenue > 1) revPts = 15
  else revPts = 0
  pts += revPts

  // --- Domains owned — NOT YET IMPLEMENTED (0 pts) ---
  // When implemented, rebalance services (50→30) and revenue (50→30) to make room.
  // Design: 1 domain = 10 pts, 2+ = 20 pts (operational maturity signal).

  // --- Successful replications — NOT YET IMPLEMENTED (0 pts) ---
  // When implemented, rebalance services (50→30) and revenue (50→30) to make room.
  // Design: 1 replication = 10 pts, 2+ = 20 pts (proven value signal).

  const signals: Record<string, number> = {
    x402Services: x402ServicesPts,
    revenue: revPts,
  }

  return {
    score: clampScore(pts),
    signals,
    activeX402Services,
    totalRevenue: totalRevenue.toFixed(6),
    domainsOwned: 0,            // not yet implemented
    successfulReplications: 0,   // not yet implemented
  }
}
