import { encodeFunctionData, keccak256, parseAbi, stringToHex, toFunctionSelector } from 'viem'

export const DJD_EVALUATOR_ORACLE_CALLBACK_ABI = parseAbi([
  'function receiveVerdict(bytes32 escrowIdHash,address provider,address counterparty,uint8 decisionCode,uint8 recommendationCode,bool approved,uint16 confidence,uint16 agentScoreProvider,bool certificationValid,uint16 riskScore,bytes32 packetHash,bytes32 attestationDigest,bytes attestationSignature)',
])

export const DJD_EVALUATOR_ORACLE_CALLBACK_FUNCTION = 'receiveVerdict'
export const DJD_EVALUATOR_ORACLE_CALLBACK_INTERFACE = 'IDJDEvaluatorOracleCallback'
export const DJD_EVALUATOR_ORACLE_CALLBACK_SIGNATURE =
  'receiveVerdict(bytes32,address,address,uint8,uint8,bool,uint16,uint16,bool,uint16,bytes32,bytes32,bytes)'
export const DJD_EVALUATOR_ORACLE_CALLBACK_SELECTOR = toFunctionSelector(DJD_EVALUATOR_ORACLE_CALLBACK_SIGNATURE)
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
export const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const

export const DJD_DECISION_CODES = {
  approve: 0,
  review: 1,
  reject: 2,
} as const

export const DJD_RECOMMENDATION_CODES = {
  release: 0,
  manual_review: 1,
  dispute: 2,
  reject: 3,
} as const

export function buildEscrowIdHash(escrowId: string | null): `0x${string}` {
  if (!escrowId) return ZERO_BYTES32
  return keccak256(stringToHex(escrowId))
}

export function encodeEvaluatorOracleCallback(params: {
  provider: `0x${string}`
  counterparty: `0x${string}` | null
  decisionCode: number
  recommendationCode: number
  approved: boolean
  confidence: number
  agentScoreProvider: number
  certificationValid: boolean
  riskScore: number
  packetHash: `0x${string}`
  attestationDigest: `0x${string}`
  attestationSignature: `0x${string}`
  escrowId: string | null
}): `0x${string}` {
  return encodeFunctionData({
    abi: DJD_EVALUATOR_ORACLE_CALLBACK_ABI,
    functionName: DJD_EVALUATOR_ORACLE_CALLBACK_FUNCTION,
    args: [
      buildEscrowIdHash(params.escrowId),
      params.provider,
      params.counterparty ?? ZERO_ADDRESS,
      params.decisionCode,
      params.recommendationCode,
      params.approved,
      params.confidence,
      params.agentScoreProvider,
      params.certificationValid,
      params.riskScore,
      params.packetHash,
      params.attestationDigest,
      params.attestationSignature,
    ],
  })
}
