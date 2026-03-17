import { REPUTATION_PUBLISHER_CONFIG } from '../config/constants.js'
import { buildPublicUrl } from '../config/public.js'
import { getActiveCertification, getRegistration, getReputationPublication } from '../db.js'
import { ErrorCodes } from '../errors.js'
import { getOrCalculateScore } from '../scoring/engine.js'
import { getERC8004RegistryStatus } from '../blockchain.js'
import type { Address, Tier } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'

interface StandardsServiceError {
  ok: false
  code: string
  message: string
  status: 400
  details?: Record<string, unknown>
}

interface StandardsServiceSuccess<T> {
  ok: true
  data: T
}

export type StandardsServiceResult<T> = StandardsServiceError | StandardsServiceSuccess<T>

export interface Erc8004CompatibleScoreView {
  standard: 'erc-8004-compatible'
  wallet: Address
  agent_id: string
  provider: {
    name: 'DJD Agent Score'
    reputation_tag: 'djd-composite'
    model_version: string
    document_url: string
  }
  reputation: {
    composite_score: number
    tier: Tier
    confidence: number
    recommendation: string
    computed_at: string
    last_updated: string
    score_freshness: number
    data_source?: 'live' | 'cached' | 'unavailable'
  }
  identity: {
    registered: boolean
    erc8004_registered: boolean
    erc8004_registry_configured: boolean
    erc8004_registry_contract: string | null
    name: string | null
    description: string | null
    github_url: string | null
    website_url: string | null
    github_verified: boolean
    registered_at: string | null
    updated_at: string | null
  }
  certification: {
    active: boolean
    tier: string | null
    score_at_certification: number | null
    granted_at: string | null
    expires_at: string | null
    tx_hash: string | null
  }
  publication: {
    published: boolean
    registry: 'erc-8004'
    network: 'base'
    chain_id: number
    registry_contract: string
    endpoint: string
    tx_hash: string | null
    feedback_hash: string | null
    published_at: string | null
    score_at_publication: number | null
    model_version: string | null
    eligible_now: boolean
    eligibility_reasons: string[]
  }
  links: {
    basic_score: string
    full_score: string
    certification_status: string
    certification_badge: string
    score_badge: string
    agent_profile: string
  }
}

function invalidWalletError(): StandardsServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_WALLET,
    message: 'Invalid or missing wallet address',
    status: 400,
  }
}

function walletToAgentId(wallet: Address): string {
  return BigInt(wallet).toString(10)
}

export async function getErc8004CompatibleScoreView(
  rawWallet: string | undefined,
): Promise<StandardsServiceResult<Erc8004CompatibleScoreView>> {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError()
  }

  const score = await getOrCalculateScore(wallet)
  const registration = getRegistration(wallet)
  const certification = getActiveCertification(wallet)
  const publication = getReputationPublication(wallet)
  const registryStatus = getERC8004RegistryStatus()
  const currentDocumentUrl = buildPublicUrl(`/v1/score/erc8004?wallet=${wallet}`)
  const erc8004Registered = score.dimensions.identity.data?.erc8004Registered === true
  const publicationDelta = publication ? Math.abs(score.score - publication.composite_score) : null
  const eligibilityReasons: string[] = []
  let eligibleNow = true

  if (score.confidence < REPUTATION_PUBLISHER_CONFIG.MIN_CONFIDENCE) {
    eligibleNow = false
    eligibilityReasons.push('confidence_below_threshold')
  }

  if (publication && publicationDelta !== null && publicationDelta < REPUTATION_PUBLISHER_CONFIG.SCORE_DELTA) {
    eligibleNow = false
    eligibilityReasons.push('score_change_below_threshold')
  }

  if (eligibleNow) {
    eligibilityReasons.push(publication ? 'republish_ready' : 'first_publication_ready')
  }

  return {
    ok: true,
    data: {
      standard: 'erc-8004-compatible',
      wallet,
      agent_id: walletToAgentId(wallet),
      provider: {
        name: 'DJD Agent Score',
        reputation_tag: 'djd-composite',
        model_version: score.modelVersion,
        document_url: buildPublicUrl(`/v1/score/erc8004?wallet=${wallet}`),
      },
      reputation: {
        composite_score: score.score,
        tier: score.tier,
        confidence: score.confidence,
        recommendation: score.recommendation,
        computed_at: score.computedAt,
        last_updated: score.lastUpdated,
        score_freshness: score.scoreFreshness,
        ...(score.dataSource ? { data_source: score.dataSource } : {}),
      },
      identity: {
        registered: registration !== undefined,
        erc8004_registered: erc8004Registered,
        erc8004_registry_configured: registryStatus.identity_registry_configured,
        erc8004_registry_contract: registryStatus.identity_registry,
        name: registration?.name ?? null,
        description: registration?.description ?? null,
        github_url: registration?.github_url ?? null,
        website_url: registration?.website_url ?? null,
        github_verified: registration?.github_verified === 1,
        registered_at: registration?.registered_at ?? null,
        updated_at: registration?.updated_at ?? null,
      },
      certification: {
        active: certification !== undefined,
        tier: certification?.tier ?? null,
        score_at_certification: certification?.score_at_certification ?? null,
        granted_at: certification?.granted_at ?? null,
        expires_at: certification?.expires_at ?? null,
        tx_hash: certification?.tx_hash ?? null,
      },
      publication: {
        published: publication !== undefined,
        registry: 'erc-8004',
        network: registryStatus.network,
        chain_id: registryStatus.chain_id,
        registry_contract: registryStatus.reputation_registry,
        endpoint: publication?.endpoint ?? currentDocumentUrl,
        tx_hash: publication?.tx_hash ?? null,
        feedback_hash: publication?.feedback_hash ?? null,
        published_at: publication?.published_at ?? null,
        score_at_publication: publication?.composite_score ?? null,
        model_version: publication?.model_version ?? null,
        eligible_now: eligibleNow,
        eligibility_reasons: eligibilityReasons,
      },
      links: {
        basic_score: buildPublicUrl(`/v1/score/basic?wallet=${wallet}`),
        full_score: buildPublicUrl(`/v1/score/full?wallet=${wallet}`),
        certification_status: buildPublicUrl(`/v1/certification/${wallet}`),
        certification_badge: buildPublicUrl(`/v1/certification/badge/${wallet}`),
        score_badge: buildPublicUrl(`/v1/badge/${wallet}.svg`),
        agent_profile: buildPublicUrl(`/agent/${wallet}`),
      },
    },
  }
}
