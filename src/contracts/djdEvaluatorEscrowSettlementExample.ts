import { encodeFunctionData, parseAbi, toFunctionSelector } from 'viem'
import { EVALUATOR_VERDICT_TUPLE_SIGNATURE, type EvaluatorVerdictVerifierInput } from './djdEvaluatorVerdictVerifier.js'

export const DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT = 'DJDEvaluatorEscrowSettlementExample'
export const DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_FUNCTION = 'settleWithDJDVerdict'
export const DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SIGNATURE = `settleWithDJDVerdict(${EVALUATOR_VERDICT_TUPLE_SIGNATURE},bytes)`
export const DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SELECTOR = toFunctionSelector(
  DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SIGNATURE,
)

export const DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_ABI = parseAbi([
  'constructor(address verifier,address provider,address counterparty,bytes32 escrowIdHash)',
  'function verifier() view returns (address)',
  'function provider() view returns (address)',
  'function counterparty() view returns (address)',
  'function escrowIdHash() view returns (bytes32)',
  'function settled() view returns (bool)',
  'function outcome() view returns (uint8)',
  'function lastVerdictDigest() view returns (bytes32)',
  'function lastPacketHash() view returns (bytes32)',
  'function releaseAuthorized() view returns (bool)',
  `function settleWithDJDVerdict(${EVALUATOR_VERDICT_TUPLE_SIGNATURE} verdict,bytes signature) returns (uint8)`,
  'event VerdictSettled(bytes32 indexed verdictDigest,bytes32 indexed packetHash,uint8 outcome,bool approved,address provider,address counterparty)',
])

export function encodeEvaluatorEscrowSettlement(params: {
  verdict: EvaluatorVerdictVerifierInput
  signature: `0x${string}`
}): `0x${string}` {
  return encodeFunctionData({
    abi: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_ABI,
    functionName: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_FUNCTION,
    args: [params.verdict, params.signature],
  })
}
