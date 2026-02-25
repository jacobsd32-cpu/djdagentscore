/**
 * Scoring dimensions — each function returns an integer 0-100.
 *
 * AgentScore = (Reliability × 0.30) + (Viability × 0.25)
 *            + (Identity × 0.20)    + (Behavior × 0.15)
 *            + (Capability × 0.10)
 *
 * ── Point budget design rationale ──
 *
 * Each dimension targets 100 points max, allocated across sub-signals so that
 * a "healthy, active agent" lands at ~70-80 without gaming. Thresholds are
 * calibrated against real Base mainnet activity patterns observed Dec 2024–Feb 2026.
 *
 * ── v2.1 Calibration Notes (Feb 2026) ──
 *
 * Score compression was observed: all 34 scored wallets fell in the 2-59 range
 * with median 24. Root cause: breakpoints calibrated for a mature ecosystem
 * (1000+ tx, $100+ balances, $500+ revenue) but actual ecosystem is early-stage.
 * Changes: lowered tx/nonce/balance/revenue thresholds, added wallet age granularity,
 * switched nonce and revenue to piecewiseLog for smoother scaling.
 *
 * Transaction counts: 5 tx = first real usage, 25 = active, 100 = established, 500+ = high-volume.
 *   Breakpoints lowered in v2.1 to match early-stage x402 ecosystem reality.
 *
 * USDC balances: $0.10 = first micropayment dust, $5 = funded agent, $25+ = operating capital.
 *   Thresholds reflect observed x402 micropayment economics ($0.01-$1 per call).
 *   Most active agents hold $1-$50, not $100+.
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

import { usdcToFloat } from '../blockchain.js'
import type { CapabilityData, IdentityData, ReliabilityData, ViabilityData, WalletUSDCData } from '../types.js'

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
  if (value >= breakpoints[breakpoints.length - 1][0]) return breakpoints[breakpoints.length - 1][1]

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

export function calcReliability(
  data: WalletUSDCData,
  blockNow: bigint,
  nonce: number,
): ReliabilityData & { score: number; signals: Record<string, number> } {
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
  // v2.1 recalibration: lowered thresholds to match early-stage x402 ecosystem.
  // Breakpoints: 0→0, 5→4, 25→10, 100→18, 500→23, 1000→25
  // Previously [10→5, 100→15, 1000→25] — too aggressive for ecosystem where
  // most active agents have 10-50 USDC transfers.
  const txPts =
    txCount === 0
      ? 0
      : piecewiseLog(txCount, [
          [0, 0],
          [5, 4],
          [25, 10],
          [100, 18],
          [500, 23],
          [1000, 25],
        ])
  pts += txPts

  // --- Nonce (total txs ever sent): up to 20 pts ---
  // The nonce is the authoritative count of all transactions originating from this wallet,
  // not just USDC transfers. A high nonce = actively operated over a long period.
  // v2.1 recalibration: switched to piecewiseLog for smoother scaling.
  // Breakpoints: 0→0, 1→3, 10→8, 50→14, 200→18, 1000→20
  // Previously cliff-based (1→3, 10→8, 100→15, 1000→20) which left big gaps.
  const noncePts = nonce === 0
    ? 0
    : Math.round(piecewiseLog(nonce, [
        [0, 0],
        [1, 3],
        [10, 8],
        [50, 14],
        [200, 18],
        [1000, 20],
      ]))
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
    const windowBlocks = 14 * 43_200 // 14 days in blocks
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

  const lastTxTimestamp =
    data.lastBlockSeen !== null
      ? Date.now() - Number(blockNow - data.lastBlockSeen) * 2_000 // ~2s per block
      : null

  const signals: Record<string, number> = {
    txSuccessRate: successRatePts,
    txCountLog: Math.round(txPts),
    nonceAlignment: noncePts,
    uptimeEstimate: data.firstBlockSeen !== null && data.lastBlockSeen !== null ? Math.round(uptimeEstimate * 25) : 0,
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

export function calcViability(
  data: WalletUSDCData,
  walletAgeDays: number | null,
  ethBalanceWei: bigint,
): ViabilityData & { score: number; signals: Record<string, number> } {
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
  // v2.1 recalibration: added more granularity for micropayment-level balances.
  // $0.10 = first x402 payment dust (2 pts), $1 = seed money (5), $5 = funded (10),
  // $25 = operating reserve (18), $50 = healthy (22), $100+ = well-capitalised (25).
  // Previously jumped from 5pts ($1) to 15pts ($10) — too steep for early agents.
  let balPts = 0
  if (balanceUsd > 100) balPts = 25
  else if (balanceUsd > 50) balPts = 22
  else if (balanceUsd > 25) balPts = 18
  else if (balanceUsd > 10) balPts = 15
  else if (balanceUsd > 5) balPts = 10
  else if (balanceUsd > 1) balPts = 5
  else if (balanceUsd > 0.1) balPts = 2
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
    agePts = Math.round(
      piecewiseLog(walletAgeDays, [
        [0, 0],
        [1, 5],
        [7, 15],
        [30, 25],
        [90, 30],
      ]),
    )
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
  if (net7 > 0 && net7 >= net30 * 0.5)
    trendPts = 15 // rising
  else if (Math.abs(net7) < 1)
    trendPts = 10 // stable
  else if (net7 < 0 && net7 > -50)
    trendPts = 5 // declining
  else trendPts = 0 // freefall
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
  // v2.1 recalibration: added granularity in the 7-90 day range.
  // Previously jumped from 8 (7d) to 15 (30d) to 20 (90d) — too coarse for
  // an ecosystem where most wallets are 2-60 days old.
  const ageDays = walletAgeDays ?? 0
  if (ageDays > 180) return 30
  if (ageDays > 90) return 25
  if (ageDays > 60) return 22
  if (ageDays > 30) return 18
  if (ageDays > 14) return 13
  if (ageDays > 7) return 8
  if (ageDays > 3) return 5
  return 2
}

export async function calcIdentity(
  _wallet: `0x${string}`,
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
  // v2.1: smoother ramp with more steps in the 7-90 day range where
  // most real wallets currently fall. 3d (5pts) = survived initial testing,
  // 14d (13) = two-week milestone, 30d (18) = monthly, 60d (22) = seasoned,
  // 90d (25) = established, 180d+ (30) = long-running operator.
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
  x402Stats?: { x402TxCount: number; x402InflowsUsd: number; x402OutflowsUsd: number },
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
    const avgInflow = data.transferCount > 0 ? usdcToFloat(data.totalInflows) / data.transferCount : 0
    if (avgInflow < 5 && data.transferCount > 5) {
      // Smooth ramp: 5 tx = 1, 15 = 1, 20 = 2, 40 = 2, 50 = 3, 80+ = 4
      activeX402Services = Math.min(4, Math.max(1, Math.floor(data.transferCount / 20) + 1))
    } else if (data.transferCount > 0) {
      activeX402Services = 1
    }
    // Smooth point curve instead of cliff jumps
    x402ServicesPts =
      activeX402Services >= 4
        ? 50
        : activeX402Services === 3
          ? 40
          : activeX402Services === 2
            ? 30
            : activeX402Services === 1
              ? 15
              : 0
  }
  pts += x402ServicesPts

  // --- Total revenue earned (up to 50 pts) — prefer x402-specific revenue if available ---
  // v2.1 recalibration: switched to piecewiseLog for smooth scaling from micropayment
  // dust ($0.10) up to proven revenue ($500+). Previously cliff-based with huge gaps
  // ($1→15, $50→30, $500→50) leaving most early agents at 0 or 15.
  // $0.10 = first micropayment (5 pts), $1 = has real users (12), $10 = sustaining (22),
  // $50 = viable business (32), $200 = established (42), $500+ = proven (50).
  // Falls back to total USDC inflows when x402-specific indexer data isn't available.
  const totalRevenue = hasX402Data ? x402Revenue : usdcToFloat(data.totalInflows)
  let revPts = 0
  if (totalRevenue > 0) {
    revPts = Math.round(piecewiseLog(totalRevenue, [
      [0, 0],
      [0.1, 5],
      [1, 12],
      [10, 22],
      [50, 32],
      [200, 42],
      [500, 50],
    ]))
  }
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
    domainsOwned: 0, // not yet implemented
    successfulReplications: 0, // not yet implemented
  }
}
