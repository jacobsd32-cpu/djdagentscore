/**
 * Scoring dimensions — each function returns an integer 0-100.
 *
 * AgentScore = (Reliability × 0.35) + (Viability × 0.30)
 *            + (Identity × 0.20)    + (Capability × 0.15)
 */

import {
  usdcToFloat,
  checkERC8004Registration,
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

export function calcReliability(data: WalletUSDCData, blockNow: bigint): ReliabilityData & { score: number } {
  let pts = 0

  // --- Payment success rate (up to 30 pts) ---
  // On-chain we only see confirmed transfers; we treat presence of transactions
  // as an approximation of success rate.
  const txCount = data.transferCount
  const successRatePts = txCount === 0 ? 0 : Math.min(30, 15 + (txCount > 5 ? 10 : 0) + (txCount > 20 ? 5 : 0))
  pts += successRatePts

  // --- Total completed transactions log-scale (up to 25 pts) ---
  // Breakpoints: 0→0, 10→5, 100→15, 1000→25
  const txPts = txCount === 0
    ? 0
    : piecewiseLog(txCount, [[0, 0], [10, 5], [100, 15], [1000, 25]])
  pts += txPts

  // --- Service uptime proxy (up to 25 pts) ---
  // Estimate by how consistently transactions appear over the window.
  // Simple heuristic: spread of first→last block relative to window size.
  let uptimeEstimate = 0
  if (data.firstBlockSeen !== null && data.lastBlockSeen !== null) {
    const spanBlocks = Number(data.lastBlockSeen - data.firstBlockSeen)
    const windowBlocks = 90 * 43_200 // 90 days in blocks
    const ratio = Math.min(1, spanBlocks / windowBlocks)
    uptimeEstimate = ratio
    pts += Math.round(ratio * 25)
  }

  // --- Failed tx penalty (up to -20 pts) ---
  // Without trace data, approximate: if outflows are disproportionately large vs inflows
  const failedTxCount = 0 // not detectable from Transfer events alone
  pts += 0 // penalty placeholder

  // --- Recency (up to 20 pts) ---
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

  return {
    score: clampScore(pts),
    txCount,
    successRate: txCount === 0 ? 0 : successRatePts / 30,
    lastTxTimestamp,
    failedTxCount,
    uptimeEstimate,
  }
}

// ---------- Dimension 2: Economic Viability (30%) ----------

export function calcViability(data: WalletUSDCData, walletAgeDays: number | null): ViabilityData & { score: number } {
  let pts = 0

  const balanceUsd = usdcToFloat(data.balance)
  const inflows30 = usdcToFloat(data.inflows30d)
  const outflows30 = usdcToFloat(data.outflows30d)
  const inflows7 = usdcToFloat(data.inflows7d)
  const outflows7 = usdcToFloat(data.outflows7d)
  const totalInflowsUsd = usdcToFloat(data.totalInflows)

  // --- USDC balance (up to 25 pts) ---
  let balPts = 0
  if (balanceUsd > 100) balPts = 25
  else if (balanceUsd > 50) balPts = 20
  else if (balanceUsd > 10) balPts = 15
  else if (balanceUsd > 1) balPts = 5
  pts += balPts

  // --- Income vs burn ratio (up to 30 pts) ---
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
  // Breakpoints: 1→5, 7→15, 30→25, 90→30
  let agePts = 0
  if (walletAgeDays !== null && walletAgeDays > 0) {
    agePts = Math.round(piecewiseLog(walletAgeDays, [[0, 0], [1, 5], [7, 15], [30, 25], [90, 30]]))
  }
  pts += agePts

  // --- Ever had zero balance (-15 pts if yes) ---
  // Heuristic: if balance is 0 and there have been outflows, assume it hit zero
  const everZeroBalance = balanceUsd === 0 && data.totalOutflows > 0n
  if (everZeroBalance) pts -= 15

  // --- 7-day balance trend (up to 15 pts) ---
  let trendPts = 0
  const net7 = inflows7 - outflows7
  const net30 = inflows30 - outflows30
  if (net7 > 0 && net7 >= net30 * 0.5) trendPts = 15       // rising
  else if (Math.abs(net7) < 1) trendPts = 10               // stable
  else if (net7 < 0 && net7 > -50) trendPts = 5            // declining
  else trendPts = 0                                         // freefall
  pts += trendPts

  return {
    score: clampScore(pts),
    usdcBalance: usdcToFloat(data.balance).toFixed(6),
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

export async function calcIdentity(
  wallet: `0x${string}`,
  walletAgeDays: number | null,
  creatorScore: number | null = null,
  isRegistered = false,
): Promise<IdentityData & { score: number }> {
  let pts = 0

  // --- Agent self-registration (up to 15 pts) ---
  // Operators register their wallet + metadata via POST /v1/agent/register.
  // Combined with ERC-8004 this is 45 pts max, still clamped to 100.
  if (isRegistered) pts += 15

  // --- ERC-8004 registry (up to 30 pts) ---
  const erc8004Registered = await checkERC8004Registration(wallet)
  if (erc8004Registered) pts += 30

  // --- Wallet age (up to 25 pts) ---
  let agePts = 0
  const ageDays = walletAgeDays ?? 0
  if (ageDays > 90) agePts = 25
  else if (ageDays > 30) agePts = 20
  else if (ageDays > 7) agePts = 10
  else agePts = 5
  pts += agePts

  // --- Creator wallet score — inherit 20% (up to 20 pts) ---
  let creatorPts = 0
  if (creatorScore !== null) {
    creatorPts = Math.round(creatorScore * 0.2)
  }
  pts += creatorPts

  // --- Generation depth (up to 15 pts) ---
  // Without registry data we assume gen0 (native wallet, not spawned by another agent)
  const generationDepth = 0
  const genPts = [15, 12, 8, 5][Math.min(generationDepth, 3)]
  pts += genPts

  // --- Constitution hash verified (10 pts) ---
  // Without registry data this is unknown — default to false
  const constitutionHashVerified = false
  if (constitutionHashVerified) pts += 10

  return {
    score: clampScore(pts),
    erc8004Registered,
    walletAgeDays: ageDays,
    creatorScore,
    generationDepth,
    constitutionHashVerified,
  }
}

// ---------- Dimension 4: Capability Signal (15%) ----------

export function calcCapability(data: WalletUSDCData): CapabilityData & { score: number } {
  let pts = 0

  // --- Active x402 services (up to 30 pts) ---
  // Not directly detectable on-chain; proxy: if wallet is consistently receiving small
  // payments it's likely running x402 services.
  const avgInflow = data.transferCount > 0
    ? usdcToFloat(data.totalInflows) / data.transferCount
    : 0
  let x402ServicesPts = 0
  let activeX402Services = 0
  if (avgInflow < 5 && data.transferCount > 10) {
    // Many small inflows → likely a multi-service agent
    activeX402Services = Math.min(4, Math.floor(data.transferCount / 20))
  } else if (data.transferCount > 0) {
    activeX402Services = 1
  }
  if (activeX402Services === 0) x402ServicesPts = 0
  else if (activeX402Services === 1) x402ServicesPts = 15
  else if (activeX402Services <= 3) x402ServicesPts = 25
  else x402ServicesPts = 30
  pts += x402ServicesPts

  // --- Total revenue earned (up to 30 pts) ---
  const totalRevenue = usdcToFloat(data.totalInflows)
  let revPts = 0
  if (totalRevenue > 500) revPts = 30
  else if (totalRevenue > 50) revPts = 20
  else if (totalRevenue > 1) revPts = 10
  else revPts = 0
  pts += revPts

  // --- Domains owned (up to 20 pts) ---
  // Without ENS / Basenames query, default to 0
  const domainsOwned: number = 0
  if (domainsOwned >= 2) pts += 20
  else if (domainsOwned === 1) pts += 10

  // --- Successful replications (up to 20 pts) ---
  // Without registry data, default to 0
  const successfulReplications: number = 0
  if (successfulReplications >= 2) pts += 20
  else if (successfulReplications === 1) pts += 10

  return {
    score: clampScore(pts),
    activeX402Services,
    totalRevenue: totalRevenue.toFixed(6),
    domainsOwned,
    successfulReplications,
  }
}
