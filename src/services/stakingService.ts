import { v4 as uuidv4 } from 'uuid'

import { STAKING_CONFIG } from '../config/constants.js'
import {
  adjustScoreByStakeBoost,
  countFraudReportsByTarget,
  getActiveCreatorStakeByPair,
  getCreatorStakeSummary,
  getIndexedUsdcTransferByHash,
  insertCreatorStake,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import type { Address, StakeBody, StakeResponse } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'

const VALID_TX_HASH = /^0x[0-9a-fA-F]{64}$/

interface StakingServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 409
  details?: Record<string, unknown>
}

interface StakingServiceSuccess<T> {
  ok: true
  data: T
  status?: 201
}

type StakingServiceResult<T> = StakingServiceError | StakingServiceSuccess<T>

function invalidStakeError(message: string, details?: Record<string, unknown>): StakingServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_STAKE,
    message,
    status: 400,
    ...(details ? { details } : {}),
  }
}

function duplicateStakeError(message: string): StakingServiceError {
  return {
    ok: false,
    code: ErrorCodes.DUPLICATE_STAKE,
    message,
    status: 409,
  }
}

function stakeNotAllowedError(message: string, details?: Record<string, unknown>): StakingServiceError {
  return {
    ok: false,
    code: ErrorCodes.STAKE_NOT_ALLOWED,
    message,
    status: 409,
    ...(details ? { details } : {}),
  }
}

function roundUsdc(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function getStakeScoreBoost(stakeAmount: number): number {
  for (const breakpoint of STAKING_CONFIG.BOOST_BREAKPOINTS) {
    if (stakeAmount >= breakpoint.minAmount) return breakpoint.boost
  }
  return 0
}

function getPayToWallet(): Address | null {
  return normalizeWallet(process.env.PAY_TO)
}

export function submitCreatorStake(
  body: StakeBody | unknown,
  creatorWalletInput: string | null | undefined,
): StakingServiceResult<StakeResponse> {
  if (typeof body !== 'object' || body === null) {
    return invalidStakeError('agent_wallet, stake_tx_hash, and fee_tx_hash are required')
  }

  const input = body as Record<string, unknown>
  const agentWallet = normalizeWallet(typeof input.agent_wallet === 'string' ? input.agent_wallet : undefined)
  if (!agentWallet) {
    return invalidStakeError('Valid agent_wallet required')
  }

  if (typeof input.stake_tx_hash !== 'string' || !VALID_TX_HASH.test(input.stake_tx_hash)) {
    return invalidStakeError('Valid stake_tx_hash required')
  }
  if (typeof input.fee_tx_hash !== 'string' || !VALID_TX_HASH.test(input.fee_tx_hash)) {
    return invalidStakeError('Valid fee_tx_hash required')
  }

  const stakeTxHash = input.stake_tx_hash.toLowerCase()
  const feeTxHash = input.fee_tx_hash.toLowerCase()
  if (stakeTxHash === feeTxHash) {
    return invalidStakeError('stake_tx_hash and fee_tx_hash must reference different transfers')
  }

  const payToWallet = getPayToWallet()
  if (!payToWallet) {
    return invalidStakeError('PAY_TO wallet is not configured')
  }

  if (countFraudReportsByTarget(agentWallet) > 0) {
    return stakeNotAllowedError('Agents with active fraud reports cannot receive new creator stakes', {
      agent_wallet: agentWallet,
    })
  }

  const stakeTransfer = getIndexedUsdcTransferByHash(stakeTxHash)
  if (!stakeTransfer) {
    return invalidStakeError('stake_tx_hash must reference an indexed USDC transfer')
  }

  if (normalizeWallet(stakeTransfer.to_wallet) !== agentWallet) {
    return invalidStakeError('stake_tx_hash must transfer USDC to agent_wallet')
  }

  const derivedCreatorWallet = normalizeWallet(stakeTransfer.from_wallet)
  if (!derivedCreatorWallet) {
    return invalidStakeError('stake_tx_hash must originate from a valid creator wallet')
  }

  const requestedCreatorWallet = normalizeWallet(creatorWalletInput)
  if (requestedCreatorWallet && requestedCreatorWallet !== derivedCreatorWallet) {
    return invalidStakeError('Request wallet does not match the creator wallet that funded the stake', {
      expected_creator_wallet: derivedCreatorWallet,
      request_wallet: requestedCreatorWallet,
    })
  }

  if (derivedCreatorWallet === agentWallet) {
    return invalidStakeError('Creators cannot stake directly on the same wallet they are boosting')
  }

  const feeTransfer = getIndexedUsdcTransferByHash(feeTxHash)
  if (!feeTransfer) {
    return invalidStakeError('fee_tx_hash must reference an indexed USDC transfer')
  }

  if (normalizeWallet(feeTransfer.from_wallet) !== derivedCreatorWallet || normalizeWallet(feeTransfer.to_wallet) !== payToWallet) {
    return invalidStakeError('fee_tx_hash must be a creator-to-DJD fee transfer sent to PAY_TO', {
      expected_creator_wallet: derivedCreatorWallet,
      expected_pay_to: payToWallet,
    })
  }

  if (stakeTransfer.amount_usdc < STAKING_CONFIG.MIN_STAKE_AMOUNT_USDC) {
    return invalidStakeError(`stake amount must be at least ${STAKING_CONFIG.MIN_STAKE_AMOUNT_USDC} USDC`, {
      minimum_stake_amount_usdc: STAKING_CONFIG.MIN_STAKE_AMOUNT_USDC,
      stake_amount_usdc: roundUsdc(stakeTransfer.amount_usdc),
    })
  }

  const expectedFee = roundUsdc(stakeTransfer.amount_usdc * STAKING_CONFIG.PLATFORM_FEE_RATE)
  if (feeTransfer.amount_usdc + STAKING_CONFIG.FEE_EPSILON_USDC < expectedFee) {
    return invalidStakeError('fee_tx_hash must cover the 1% DJD protocol fee', {
      expected_fee_usdc: expectedFee,
      observed_fee_usdc: roundUsdc(feeTransfer.amount_usdc),
    })
  }

  if (getActiveCreatorStakeByPair(derivedCreatorWallet, agentWallet)) {
    return duplicateStakeError('An active creator stake already exists for this creator and agent wallet')
  }

  const previousSummary = getCreatorStakeSummary(agentWallet)
  const scoreBoost = getStakeScoreBoost(stakeTransfer.amount_usdc)
  const stakeId = uuidv4()

  try {
    insertCreatorStake({
      id: stakeId,
      creator_wallet: derivedCreatorWallet,
      agent_wallet: agentWallet,
      stake_amount: roundUsdc(stakeTransfer.amount_usdc),
      fee_amount: roundUsdc(feeTransfer.amount_usdc),
      stake_tx_hash: stakeTxHash,
      fee_tx_hash: feeTxHash,
      status: 'active',
      score_boost: scoreBoost,
      staked_at: stakeTransfer.timestamp,
      return_eligible: 1,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return duplicateStakeError('This stake or fee transfer has already been registered')
    }
    throw error
  }

  const currentSummary = getCreatorStakeSummary(agentWallet)
  const boostDelta = currentSummary.active_score_boost - previousSummary.active_score_boost
  adjustScoreByStakeBoost(agentWallet, boostDelta)

  return {
    ok: true,
    status: 201,
    data: {
      stakeId,
      status: 'active',
      creatorWallet: derivedCreatorWallet,
      agentWallet,
      stakeTxHash,
      feeTxHash,
      stakeAmount: roundUsdc(stakeTransfer.amount_usdc),
      feeAmount: roundUsdc(feeTransfer.amount_usdc),
      scoreBoost,
      activeStakeCount: currentSummary.active_stake_count,
      activeStakedAmount: roundUsdc(currentSummary.active_staked_amount),
      activeScoreBoost: currentSummary.active_score_boost,
    },
  }
}
