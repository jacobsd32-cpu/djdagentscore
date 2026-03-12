import type { CreatorStakeRow } from '../types.js'
import { db } from './connection.js'
import { scoreToTier } from './reputationQueries.js'

export interface IndexedUsdcTransferRow {
  tx_hash: string
  from_wallet: string
  to_wallet: string
  amount_usdc: number
  timestamp: string
}

export interface CreatorStakeSummaryRow {
  active_stake_count: number
  active_staked_amount: number
  active_score_boost: number
  slashed_stake_count: number
  slashed_staked_amount: number
  most_recent_stake_at: string | null
}

export interface CreatorStakeChangeSummary {
  stake_count: number
  total_stake_amount: number
  total_score_boost: number
}

const stmtGetIndexedUsdcTransferByHash = db.prepare<[string, string], IndexedUsdcTransferRow>(`
  SELECT tx_hash, from_wallet, to_wallet, amount_usdc, timestamp
  FROM (
    SELECT tx_hash, from_wallet, to_wallet, amount_usdc, timestamp, 0 as source_rank
    FROM usdc_transfers
    WHERE LOWER(tx_hash) = LOWER(?)

    UNION ALL

    SELECT tx_hash, from_wallet, to_wallet, amount_usdc, timestamp, 1 as source_rank
    FROM raw_transactions
    WHERE LOWER(tx_hash) = LOWER(?)
  )
  ORDER BY source_rank ASC
  LIMIT 1
`)

const stmtGetActiveCreatorStakeByPair = db.prepare<[string, string], CreatorStakeRow>(`
  SELECT
    id,
    creator_wallet,
    agent_wallet,
    stake_amount,
    fee_amount,
    stake_tx_hash,
    fee_tx_hash,
    status,
    score_boost,
    staked_at,
    return_eligible,
    slashed_at,
    slash_report_id
  FROM creator_stakes
  WHERE creator_wallet = ? AND agent_wallet = ? AND status = 'active'
  LIMIT 1
`)

const stmtInsertCreatorStake = db.prepare(`
  INSERT INTO creator_stakes (
    id,
    creator_wallet,
    agent_wallet,
    stake_amount,
    fee_amount,
    stake_tx_hash,
    fee_tx_hash,
    status,
    score_boost,
    staked_at,
    return_eligible,
    slashed_at,
    slash_report_id
  ) VALUES (
    @id,
    @creator_wallet,
    @agent_wallet,
    @stake_amount,
    @fee_amount,
    @stake_tx_hash,
    @fee_tx_hash,
    @status,
    @score_boost,
    @staked_at,
    @return_eligible,
    NULL,
    NULL
  )
`)

const stmtGetCreatorStakeSummary = db.prepare<[string], CreatorStakeSummaryRow>(`
  SELECT
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_stake_count,
    COALESCE(SUM(CASE WHEN status = 'active' THEN stake_amount ELSE 0 END), 0) as active_staked_amount,
    COALESCE(SUM(CASE WHEN status = 'active' THEN score_boost ELSE 0 END), 0) as active_score_boost,
    SUM(CASE WHEN status = 'slashed' THEN 1 ELSE 0 END) as slashed_stake_count,
    COALESCE(SUM(CASE WHEN status = 'slashed' THEN stake_amount ELSE 0 END), 0) as slashed_staked_amount,
    MAX(staked_at) as most_recent_stake_at
  FROM creator_stakes
  WHERE agent_wallet = ?
`)

const stmtGetScoreForAdjustment = db.prepare<[string], { composite_score: number }>(`
  SELECT composite_score FROM scores WHERE wallet = ?
`)

const stmtSetAdjustedScore = db.prepare(`
  UPDATE scores
  SET composite_score = ?,
      tier = ?,
      calculated_at = datetime('now')
  WHERE wallet = ?
`)

const stmtGetActiveStakeSlashSummary = db.prepare<[string], CreatorStakeChangeSummary>(`
  SELECT
    COUNT(*) as stake_count,
    COALESCE(SUM(stake_amount), 0) as total_stake_amount,
    COALESCE(SUM(score_boost), 0) as total_score_boost
  FROM creator_stakes
  WHERE agent_wallet = ? AND status = 'active'
`)

const stmtSlashActiveCreatorStakes = db.prepare(`
  UPDATE creator_stakes
  SET status = 'slashed',
      return_eligible = 0,
      slashed_at = ?,
      slash_report_id = ?
  WHERE agent_wallet = ? AND status = 'active'
`)

const stmtGetSlashedStakeRestoreSummary = db.prepare<[string], CreatorStakeChangeSummary>(`
  SELECT
    COUNT(*) as stake_count,
    COALESCE(SUM(stake_amount), 0) as total_stake_amount,
    COALESCE(SUM(score_boost), 0) as total_score_boost
  FROM creator_stakes
  WHERE agent_wallet = ? AND status = 'slashed'
`)

const stmtRestoreSlashedCreatorStakes = db.prepare(`
  UPDATE creator_stakes
  SET status = 'active',
      return_eligible = 1,
      slashed_at = NULL,
      slash_report_id = NULL
  WHERE agent_wallet = ? AND status = 'slashed'
`)

const slashActiveCreatorStakesTx = db.transaction((agentWallet: string, slashReportId: string, slashedAt: string) => {
  const summary = stmtGetActiveStakeSlashSummary.get(agentWallet) ?? {
    stake_count: 0,
    total_stake_amount: 0,
    total_score_boost: 0,
  }
  if (summary.stake_count > 0) {
    stmtSlashActiveCreatorStakes.run(slashedAt, slashReportId, agentWallet)
  }
  return summary
})

const restoreSlashedCreatorStakesTx = db.transaction((agentWallet: string) => {
  const summary = stmtGetSlashedStakeRestoreSummary.get(agentWallet) ?? {
    stake_count: 0,
    total_stake_amount: 0,
    total_score_boost: 0,
  }
  if (summary.stake_count > 0) {
    stmtRestoreSlashedCreatorStakes.run(agentWallet)
  }
  return summary
})

export function getIndexedUsdcTransferByHash(txHash: string): IndexedUsdcTransferRow | undefined {
  return stmtGetIndexedUsdcTransferByHash.get(txHash, txHash)
}

export function getActiveCreatorStakeByPair(
  creatorWallet: string,
  agentWallet: string,
): CreatorStakeRow | undefined {
  return stmtGetActiveCreatorStakeByPair.get(creatorWallet, agentWallet)
}

export function insertCreatorStake(input: {
  id: string
  creator_wallet: string
  agent_wallet: string
  stake_amount: number
  fee_amount: number
  stake_tx_hash: string
  fee_tx_hash: string
  status: 'active'
  score_boost: number
  staked_at: string
  return_eligible: number
}): void {
  stmtInsertCreatorStake.run(input)
}

export function getCreatorStakeSummary(agentWallet: string): CreatorStakeSummaryRow {
  return (
    stmtGetCreatorStakeSummary.get(agentWallet) ?? {
      active_stake_count: 0,
      active_staked_amount: 0,
      active_score_boost: 0,
      slashed_stake_count: 0,
      slashed_staked_amount: 0,
      most_recent_stake_at: null,
    }
  )
}

export function adjustScoreByStakeBoost(wallet: string, boostDelta: number): number {
  if (boostDelta === 0) return 0

  const row = stmtGetScoreForAdjustment.get(wallet)
  if (!row) return 0

  const adjustedScore = Math.max(0, Math.min(100, row.composite_score + boostDelta))
  stmtSetAdjustedScore.run(adjustedScore, scoreToTier(adjustedScore), wallet)
  return adjustedScore
}

export function slashActiveCreatorStakesForAgent(agentWallet: string, slashReportId: string): CreatorStakeChangeSummary {
  return (
    slashActiveCreatorStakesTx(agentWallet, slashReportId, new Date().toISOString()) ?? {
      stake_count: 0,
      total_stake_amount: 0,
      total_score_boost: 0,
    }
  )
}

export function restoreSlashedCreatorStakesForAgent(agentWallet: string): CreatorStakeChangeSummary {
  return (
    restoreSlashedCreatorStakesTx(agentWallet) ?? {
      stake_count: 0,
      total_stake_amount: 0,
      total_score_boost: 0,
    }
  )
}
