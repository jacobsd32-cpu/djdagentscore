import { hashTypedData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getDefaultEvaluatorNetwork } from './evaluatorNetworkService.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export const EVALUATOR_VERDICT_PRIMARY_TYPE = 'EvaluatorVerdict' as const

export const EVALUATOR_VERDICT_TYPES = {
  EvaluatorVerdict: [
    { name: 'verdictId', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'counterpartyWallet', type: 'address' },
    { name: 'escrowId', type: 'string' },
    { name: 'decision', type: 'string' },
    { name: 'recommendation', type: 'string' },
    { name: 'approved', type: 'bool' },
    { name: 'confidence', type: 'uint16' },
    { name: 'agentScoreProvider', type: 'uint16' },
    { name: 'scoreModelVersion', type: 'string' },
    { name: 'certificationValid', type: 'bool' },
    { name: 'certificationTier', type: 'string' },
    { name: 'riskLevel', type: 'string' },
    { name: 'riskScore', type: 'uint16' },
    { name: 'forensicTraceId', type: 'string' },
    { name: 'packetHash', type: 'bytes32' },
    { name: 'generatedAt', type: 'string' },
  ],
} as const

export function buildEvaluatorVerdictDomain(chainId = getDefaultEvaluatorNetwork().chainId) {
  return {
    name: 'DJD Evaluator Verdict',
    version: '1',
    chainId,
  } as const
}

export const EVALUATOR_VERDICT_DOMAIN = buildEvaluatorVerdictDomain()

type AttestationSource = 'oracle_signer' | 'publisher_fallback' | 'unconfigured' | 'invalid_key'
type AttestationStatus = 'signed' | 'unsigned'

export interface EvaluatorVerdictAttestationView {
  status: AttestationStatus
  scheme: 'eip712'
  source: AttestationSource
  signer: string | null
  signature: string | null
  digest: string
  issued_at: string
  reason: string | null
  typed_data: {
    domain: ReturnType<typeof buildEvaluatorVerdictDomain>
    primaryType: typeof EVALUATOR_VERDICT_PRIMARY_TYPE
    types: typeof EVALUATOR_VERDICT_TYPES
    message: {
      verdictId: string
      wallet: `0x${string}`
      counterpartyWallet: `0x${string}`
      escrowId: string
      decision: string
      recommendation: string
      approved: boolean
      confidence: number
      agentScoreProvider: number
      scoreModelVersion: string
      certificationValid: boolean
      certificationTier: string
      riskLevel: string
      riskScore: number
      forensicTraceId: string
      packetHash: `0x${string}`
      generatedAt: string
    }
  }
}

export interface EvaluatorVerdictAttestationInput {
  verdict_id: string
  wallet: `0x${string}`
  counterparty_wallet: `0x${string}` | null
  escrow_id: string | null
  decision: string
  recommendation: string
  approved: boolean
  confidence: number
  agent_score_provider: number
  score_model_version: string
  certification_valid: boolean
  certification_tier: string | null
  risk_level: string
  risk_score: number
  forensic_trace_id: string
  packet_hash: `0x${string}`
  generated_at: string
}

export function buildEvaluatorVerdictTypedData(
  input: EvaluatorVerdictAttestationInput,
  options?: {
    chainId?: number
  },
): {
  digest: string
  typed_data: EvaluatorVerdictAttestationView['typed_data']
} {
  const typed_data = {
    domain: buildEvaluatorVerdictDomain(options?.chainId),
    types: EVALUATOR_VERDICT_TYPES,
    primaryType: EVALUATOR_VERDICT_PRIMARY_TYPE,
    message: {
      verdictId: input.verdict_id,
      wallet: input.wallet,
      counterpartyWallet: input.counterparty_wallet ?? ZERO_ADDRESS,
      escrowId: input.escrow_id ?? '',
      decision: input.decision,
      recommendation: input.recommendation,
      approved: input.approved,
      confidence: input.confidence,
      agentScoreProvider: input.agent_score_provider,
      scoreModelVersion: input.score_model_version,
      certificationValid: input.certification_valid,
      certificationTier: input.certification_tier ?? '',
      riskLevel: input.risk_level,
      riskScore: input.risk_score,
      forensicTraceId: input.forensic_trace_id,
      packetHash: input.packet_hash,
      generatedAt: input.generated_at,
    },
  }

  return {
    digest: hashTypedData(typed_data),
    typed_data,
  }
}

function resolveSignerConfig(): {
  source: Exclude<AttestationSource, 'unconfigured' | 'invalid_key'>
  key: `0x${string}`
} | null {
  const oracleKey = process.env.ORACLE_SIGNER_PRIVATE_KEY
  if (/^0x[a-fA-F0-9]{64}$/.test(oracleKey ?? '')) {
    return { source: 'oracle_signer', key: oracleKey!.toLowerCase() as `0x${string}` }
  }

  const publisherKey = process.env.PUBLISHER_PRIVATE_KEY
  if (/^0x[a-fA-F0-9]{64}$/.test(publisherKey ?? '')) {
    return { source: 'publisher_fallback', key: publisherKey!.toLowerCase() as `0x${string}` }
  }

  return null
}

function getInvalidKeyReason(): string | null {
  const oracleKey = process.env.ORACLE_SIGNER_PRIVATE_KEY
  if (oracleKey && !/^0x[a-fA-F0-9]{64}$/.test(oracleKey)) {
    return 'ORACLE_SIGNER_PRIVATE_KEY is invalid'
  }

  const publisherKey = process.env.PUBLISHER_PRIVATE_KEY
  if (publisherKey && !/^0x[a-fA-F0-9]{64}$/.test(publisherKey)) {
    return 'PUBLISHER_PRIVATE_KEY is invalid'
  }

  return null
}

export function getEvaluatorAttestationSignerStatus(): {
  configured: boolean
  source: AttestationSource
  address: string | null
  reason: string | null
} {
  const signerConfig = resolveSignerConfig()
  const invalidKeyReason = getInvalidKeyReason()

  if (!signerConfig) {
    return {
      configured: false,
      source: invalidKeyReason ? 'invalid_key' : 'unconfigured',
      address: null,
      reason: invalidKeyReason ?? 'No oracle signing key configured',
    }
  }

  const account = privateKeyToAccount(signerConfig.key)
  return {
    configured: true,
    source: signerConfig.source,
    address: account.address,
    reason: null,
  }
}

export async function buildEvaluatorVerdictAttestation(
  input: EvaluatorVerdictAttestationInput,
  options?: {
    chainId?: number
  },
): Promise<EvaluatorVerdictAttestationView> {
  const { digest, typed_data } = buildEvaluatorVerdictTypedData(input, options)
  const issuedAt = new Date().toISOString()
  const signerConfig = resolveSignerConfig()
  const invalidKeyReason = getInvalidKeyReason()

  if (!signerConfig) {
    return {
      status: 'unsigned',
      scheme: 'eip712',
      source: invalidKeyReason ? 'invalid_key' : 'unconfigured',
      signer: null,
      signature: null,
      digest,
      issued_at: issuedAt,
      reason: invalidKeyReason ?? 'No oracle signing key configured',
      typed_data,
    }
  }

  const account = privateKeyToAccount(signerConfig.key)
  const signature = await account.signTypedData(typed_data)

  return {
    status: 'signed',
    scheme: 'eip712',
    source: signerConfig.source,
    signer: account.address,
    signature,
    digest,
    issued_at: issuedAt,
    reason: null,
    typed_data,
  }
}
