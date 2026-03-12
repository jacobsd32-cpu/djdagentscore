import { Hono } from 'hono'
import { ErrorCodes, errorResponse } from '../errors.js'
import {
  getRegistrationResponse,
  isValidHttpsUrl,
  registerAgent,
  syncGithubVerification,
} from '../services/registrationService.js'
import type { AgentRegistrationBody } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'

const register = new Hono()

// GET /v1/agent/register?wallet=0x...
register.get('/', (c) => {
  const wallet = normalizeWallet(c.req.query('wallet'))
  if (!wallet) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing wallet address'), 400)
  }

  const response = getRegistrationResponse(wallet)
  if (!response) {
    return c.json(errorResponse(ErrorCodes.WALLET_NOT_FOUND, 'Wallet not registered'), 404)
  }

  return c.json(response)
})

// POST /v1/agent/register
register.post('/', async (c) => {
  let body: AgentRegistrationBody
  try {
    body = await c.req.json<AgentRegistrationBody>()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const { wallet: rawWallet, name, description, github_url, website_url } = body

  const normalizedWallet = normalizeWallet(rawWallet)
  if (!normalizedWallet) {
    return c.json(errorResponse(ErrorCodes.INVALID_WALLET, 'Invalid or missing wallet address'), 400)
  }

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    return c.json(errorResponse(ErrorCodes.INVALID_REGISTRATION, 'name must be a non-empty string'), 400)
  }
  if (description !== undefined && typeof description !== 'string') {
    return c.json(errorResponse(ErrorCodes.INVALID_REGISTRATION, 'description must be a string'), 400)
  }
  if (github_url !== undefined && !isValidHttpsUrl(github_url)) {
    return c.json(errorResponse(ErrorCodes.INVALID_REGISTRATION, 'github_url must be a valid HTTPS URL'), 400)
  }
  if (website_url !== undefined && !isValidHttpsUrl(website_url)) {
    return c.json(errorResponse(ErrorCodes.INVALID_REGISTRATION, 'website_url must be a valid HTTPS URL'), 400)
  }

  const result = registerAgent({
    wallet: normalizedWallet,
    name,
    description,
    github_url,
    website_url,
  })

  if (result.githubUrlToVerify) {
    syncGithubVerification(normalizedWallet, result.githubUrlToVerify).catch(() => {
      /* ignore */
    })
  }

  return c.json(result.response, result.httpStatus)
})

export default register
