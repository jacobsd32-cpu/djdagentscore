import { encodeFunctionData, parseAbi, toFunctionSelector } from 'viem'

export const DJD_EVALUATOR_VERDICT_PRIMARY_TYPE = 'EvaluatorVerdict'
export const DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT = 'DJDEvaluatorVerdictVerifier'
export const DJD_EVALUATOR_VERDICT_VERIFIER_FUNCTION = 'verifyVerdict'
export const DJD_EVALUATOR_VERDICT_VERIFIER_ABI = parseAbi([
  'constructor(address initialSigner)',
  'function owner() view returns (address)',
  'function oracleSigner() view returns (address)',
  'function domainSeparator() view returns (bytes32)',
  'function setOracleSigner(address newSigner)',
  'function transferOwnership(address newOwner)',
  'function hashVerdict((string verdictId,address wallet,address counterpartyWallet,string escrowId,string decision,string recommendation,bool approved,uint16 confidence,uint16 agentScoreProvider,string scoreModelVersion,bool certificationValid,string certificationTier,string riskLevel,uint16 riskScore,string forensicTraceId,bytes32 packetHash,string generatedAt) verdict) view returns (bytes32)',
  'function verifyVerdict((string verdictId,address wallet,address counterpartyWallet,string escrowId,string decision,string recommendation,bool approved,uint16 confidence,uint16 agentScoreProvider,string scoreModelVersion,bool certificationValid,string certificationTier,string riskLevel,uint16 riskScore,string forensicTraceId,bytes32 packetHash,string generatedAt) verdict,bytes signature) view returns (bool)',
  'function verifyDigest(bytes32 digest,bytes signature) view returns (bool)',
  'event OracleSignerUpdated(address indexed previousSigner,address indexed newSigner)',
  'event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)',
])

export const EVALUATOR_VERDICT_TUPLE_SIGNATURE =
  '(string verdictId,address wallet,address counterpartyWallet,string escrowId,string decision,string recommendation,bool approved,uint16 confidence,uint16 agentScoreProvider,string scoreModelVersion,bool certificationValid,string certificationTier,string riskLevel,uint16 riskScore,string forensicTraceId,bytes32 packetHash,string generatedAt)'

export const DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES = {
  hashVerdict: `hashVerdict(${EVALUATOR_VERDICT_TUPLE_SIGNATURE})`,
  verifyVerdict: `verifyVerdict(${EVALUATOR_VERDICT_TUPLE_SIGNATURE},bytes)`,
  verifyDigest: 'verifyDigest(bytes32,bytes)',
  setOracleSigner: 'setOracleSigner(address)',
  transferOwnership: 'transferOwnership(address)',
} as const

export const DJD_EVALUATOR_VERDICT_VERIFIER_SELECTORS = {
  hashVerdict: toFunctionSelector(DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.hashVerdict),
  verifyVerdict: toFunctionSelector(DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.verifyVerdict),
  verifyDigest: toFunctionSelector(DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.verifyDigest),
  setOracleSigner: toFunctionSelector(DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.setOracleSigner),
  transferOwnership: toFunctionSelector(DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.transferOwnership),
} as const

export interface EvaluatorVerdictVerifierInput {
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

export function encodeEvaluatorVerdictVerification(params: {
  verdict: EvaluatorVerdictVerifierInput
  signature: `0x${string}`
}): `0x${string}` {
  return encodeFunctionData({
    abi: DJD_EVALUATOR_VERDICT_VERIFIER_ABI,
    functionName: DJD_EVALUATOR_VERDICT_VERIFIER_FUNCTION,
    args: [params.verdict, params.signature],
  })
}
