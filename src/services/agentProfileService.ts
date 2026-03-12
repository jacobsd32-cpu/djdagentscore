import { getRegistration, getScore, getScoreHistory } from '../db.js'
import { ErrorCodes } from '../errors.js'
import { log } from '../logger.js'
import { getOrCalculateScore } from '../scoring/engine.js'
import { renderAgentPage } from '../templates/agentProfile.js'
import type { Address } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'

interface AgentProfileServiceError {
  ok: false
  code: string
  message: string
  status: 400
}

interface AgentProfileServiceSuccess {
  ok: true
  data: {
    html: string
  }
}

export type AgentProfileServiceResult = AgentProfileServiceError | AgentProfileServiceSuccess

export async function getAgentProfilePage(rawWallet: string, origin: string): Promise<AgentProfileServiceResult> {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_WALLET,
      message: 'Invalid wallet address',
      status: 400,
    }
  }

  let score = getScore(wallet)
  if (!score) {
    try {
      await getOrCalculateScore(wallet as Address, false)
      score = getScore(wallet)
    } catch (err) {
      log.warn('agent', `Score computation failed for ${wallet} — rendering unscored state`, err)
    }
  }

  const history = getScoreHistory(wallet)
  const registration = getRegistration(wallet)

  return {
    ok: true,
    data: {
      html: renderAgentPage(wallet, score, history, registration, origin),
    },
  }
}
