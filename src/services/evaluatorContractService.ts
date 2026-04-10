import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPublicUrl } from '../config/public.js'
import {
  DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_ABI,
  DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT,
  DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_FUNCTION,
  DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SELECTOR,
  DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SIGNATURE,
  encodeEvaluatorEscrowSettlement,
} from '../contracts/djdEvaluatorEscrowSettlementExample.js'
import {
  buildEscrowIdHash,
  DJD_EVALUATOR_ORACLE_CALLBACK_ABI,
  DJD_EVALUATOR_ORACLE_CALLBACK_FUNCTION,
  DJD_EVALUATOR_ORACLE_CALLBACK_INTERFACE,
  DJD_EVALUATOR_ORACLE_CALLBACK_SELECTOR,
  DJD_EVALUATOR_ORACLE_CALLBACK_SIGNATURE,
  ZERO_ADDRESS,
} from '../contracts/djdEvaluatorOracleCallback.js'
import {
  DJD_EVALUATOR_VERDICT_VERIFIER_ABI,
  DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT,
  DJD_EVALUATOR_VERDICT_VERIFIER_FUNCTION,
  DJD_EVALUATOR_VERDICT_VERIFIER_SELECTORS,
  DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES,
  encodeEvaluatorVerdictVerification,
} from '../contracts/djdEvaluatorVerdictVerifier.js'
import { normalizeWallet } from '../utils/walletUtils.js'
import {
  type EvaluatorArtifactPackageView,
  getEvaluatorArtifactContractEntry,
  getEvaluatorArtifactPackageView,
} from './contractArtifactService.js'
import {
  buildEvaluatorVerdictDomain,
  EVALUATOR_VERDICT_PRIMARY_TYPE,
  EVALUATOR_VERDICT_TYPES,
  getEvaluatorAttestationSignerStatus,
} from './evaluatorAttestationService.js'
import {
  getPublishedEvaluatorDeployment,
  type PublishedEvaluatorDeployment,
} from './evaluatorDeploymentRegistryService.js'
import {
  type EvaluatorNetworkConfig,
  findEvaluatorNetworkByChainId,
  getDefaultEvaluatorNetwork,
  getEvaluatorVerdictChainId,
  listEvaluatorNetworks,
  resolveEvaluatorNetwork,
} from './evaluatorNetworkService.js'
import {
  type EvaluatorServiceResult,
  type EvaluatorStoredVerdictView,
  getEvaluatorVerdictRecord,
} from './evaluatorService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTRACTS_DIR = join(__dirname, '..', '..', 'contracts')

function readContractSource(fileName: string, contract: string) {
  const source = readFileSync(join(CONTRACTS_DIR, fileName), 'utf8')
  return {
    contract,
    path: `contracts/${fileName}`,
    license: 'MIT' as const,
    sha256: createHash('sha256').update(source).digest('hex'),
    source,
  }
}

const CONTRACT_SOURCES = [
  readContractSource('IDJDEvaluatorOracleCallback.sol', DJD_EVALUATOR_ORACLE_CALLBACK_INTERFACE),
  readContractSource('DJDEvaluatorVerdictVerifier.sol', DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT),
  readContractSource('DJDEvaluatorEscrowSettlementExample.sol', DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT),
]

function toJsonAbi(abi: unknown): unknown[] {
  return JSON.parse(JSON.stringify(abi)) as unknown[]
}

function toNetworkView(network: EvaluatorNetworkConfig) {
  return {
    key: network.key,
    chain_id: network.chainId,
    chain_name: network.chainName,
    caip2: network.caip2,
    environment: network.environment,
  }
}

function invalidNetworkResult<T>(rawNetwork: string | undefined): EvaluatorServiceResult<T> {
  return {
    ok: false,
    code: 'invalid_network',
    message: 'Invalid or unsupported network',
    status: 400,
    details: {
      network: rawNetwork ?? null,
      supported_networks: listEvaluatorNetworks().map((network) => network.key),
    },
  }
}

function resolveVerifierPackageNetwork(rawNetwork: string | undefined): EvaluatorServiceResult<EvaluatorNetworkConfig> {
  const network = resolveEvaluatorNetwork(rawNetwork)
  if (!network) {
    return invalidNetworkResult(rawNetwork)
  }

  return {
    ok: true,
    data: network,
  }
}

function resolveStoredVerdictNetwork(
  verdict: Pick<EvaluatorStoredVerdictView, 'attestation' | 'verdict_id'>,
  rawNetwork: string | undefined,
): EvaluatorServiceResult<EvaluatorNetworkConfig> {
  const verdictChainId = getEvaluatorVerdictChainId(verdict.attestation)
  const verdictNetwork = findEvaluatorNetworkByChainId(verdictChainId) ?? getDefaultEvaluatorNetwork()

  if (rawNetwork === undefined || rawNetwork.trim() === '') {
    return {
      ok: true,
      data: verdictNetwork,
    }
  }

  const requestedNetwork = resolveEvaluatorNetwork(rawNetwork)
  if (!requestedNetwork) {
    return invalidNetworkResult(rawNetwork)
  }

  if (requestedNetwork.chainId !== verdictChainId) {
    return {
      ok: false,
      code: 'invalid_network',
      message: 'Stored evaluator verdict was issued for a different network',
      status: 400,
      details: {
        verdict_id: verdict.verdict_id,
        verdict_network: verdictNetwork.key,
        verdict_chain_id: verdictChainId,
        requested_network: requestedNetwork.key,
        requested_chain_id: requestedNetwork.chainId,
        suggestion: `Request a fresh evaluator oracle verdict with network=${requestedNetwork.key} before generating onchain calldata.`,
      },
    }
  }

  return {
    ok: true,
    data: requestedNetwork,
  }
}

function resolvePublishedDeployment(network: EvaluatorNetworkConfig): {
  registry_updated_at: string | null
  deployment: PublishedEvaluatorDeployment | null
} {
  const published = getPublishedEvaluatorDeployment(network)
  return {
    registry_updated_at: published.registry.updated_at,
    deployment: published.deployment,
  }
}

function resolveProofTargetContract(
  network: EvaluatorNetworkConfig,
  explicitTargetContract: string | null,
): {
  source: 'explicit' | 'published_registry' | 'unresolved'
  contract_address: string | null
  registry_updated_at: string | null
  published_deployment: PublishedEvaluatorDeployment | null
} {
  const published = resolvePublishedDeployment(network)
  if (explicitTargetContract) {
    return {
      source: 'explicit',
      contract_address: explicitTargetContract,
      registry_updated_at: published.registry_updated_at,
      published_deployment: published.deployment,
    }
  }

  const publishedVerifier = published.deployment?.contracts.verifier.address ?? null
  if (publishedVerifier) {
    return {
      source: 'published_registry',
      contract_address: publishedVerifier,
      registry_updated_at: published.registry_updated_at,
      published_deployment: published.deployment,
    }
  }

  return {
    source: 'unresolved',
    contract_address: null,
    registry_updated_at: published.registry_updated_at,
    published_deployment: published.deployment,
  }
}

function resolveEscrowTargetContract(
  network: EvaluatorNetworkConfig,
  explicitEscrowContract: string | null,
): {
  source: 'explicit' | 'published_registry' | 'unresolved'
  contract_address: string | null
  registry_updated_at: string | null
  published_deployment: PublishedEvaluatorDeployment | null
} {
  const published = resolvePublishedDeployment(network)
  if (explicitEscrowContract) {
    return {
      source: 'explicit',
      contract_address: explicitEscrowContract,
      registry_updated_at: published.registry_updated_at,
      published_deployment: published.deployment,
    }
  }

  const publishedEscrow = published.deployment?.contracts.escrow.address ?? null
  if (publishedEscrow) {
    return {
      source: 'published_registry',
      contract_address: publishedEscrow,
      registry_updated_at: published.registry_updated_at,
      published_deployment: published.deployment,
    }
  }

  return {
    source: 'unresolved',
    contract_address: null,
    registry_updated_at: published.registry_updated_at,
    published_deployment: published.deployment,
  }
}

export interface EvaluatorVerifierPackageView {
  standard: 'djd-evaluator-verifier-package-v1'
  network: ReturnType<typeof toNetworkView>
  signing: {
    scheme: 'eip712'
    primary_type: typeof EVALUATOR_VERDICT_PRIMARY_TYPE
    domain: ReturnType<typeof buildEvaluatorVerdictDomain>
    types: typeof EVALUATOR_VERDICT_TYPES
    active_signer: ReturnType<typeof getEvaluatorAttestationSignerStatus>
  }
  contracts: {
    callback_interface: {
      contract: typeof DJD_EVALUATOR_ORACLE_CALLBACK_INTERFACE
      function: typeof DJD_EVALUATOR_ORACLE_CALLBACK_FUNCTION
      signature: typeof DJD_EVALUATOR_ORACLE_CALLBACK_SIGNATURE
      selector: typeof DJD_EVALUATOR_ORACLE_CALLBACK_SELECTOR
      abi: unknown[]
    }
    verifier: {
      contract: typeof DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT
      constructor: {
        initial_signer: string | null
      }
      methods: {
        hash_verdict: {
          signature: string
          selector: string
        }
        verify_verdict: {
          signature: string
          selector: string
        }
        verify_digest: {
          signature: string
          selector: string
        }
        set_oracle_signer: {
          signature: string
          selector: string
        }
        transfer_ownership: {
          signature: string
          selector: string
        }
      }
      abi: unknown[]
    }
    settlement_example: {
      contract: typeof DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT
      function: typeof DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_FUNCTION
      signature: typeof DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SIGNATURE
      selector: typeof DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SELECTOR
      constructor: {
        verifier: string | null
        provider: 'wallet_from_verdict'
        counterparty: 'counterparty_wallet_from_verdict_or_zero'
        escrow_id: 'escrow_id_from_verdict'
        escrow_id_hash: 'keccak256(escrow_id)'
      }
      abi: unknown[]
    }
    sources: typeof CONTRACT_SOURCES
  }
  endpoints: {
    oracle_verdict: string
    verdict_record: string
    callback_calldata: string
    deployment_registry: string
    artifact_package: string
    verifier_proof: string
    escrow_settlement: string
    deploy_plan: string
    docs: string
  }
  notes: string[]
}

export interface EvaluatorVerifierProofView {
  standard: 'djd-evaluator-verifier-proof-v1'
  ready: boolean
  reason: string | null
  verdict_id: string
  verifier: {
    contract: typeof DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT
    function: typeof DJD_EVALUATOR_VERDICT_VERIFIER_FUNCTION
    selector: string
    chain_id: number
  }
  attestation: {
    status: 'signed' | 'unsigned'
    signer: string | null
    digest: string
    signature: string | null
    scheme: 'eip712'
  }
  verdict: EvaluatorStoredVerdictView['attestation']['typed_data']['message']
  call: {
    selector: string | null
    calldata: string | null
    args: {
      verdict: EvaluatorStoredVerdictView['attestation']['typed_data']['message']
      signature: string | null
    }
  }
  transaction: {
    to: string | null
    data: string | null
    value: '0'
  }
  resolution: {
    source: 'explicit' | 'published_registry' | 'unresolved'
    contract_address: string | null
    registry_updated_at: string | null
    published_deployment: PublishedEvaluatorDeployment | null
  }
  links: {
    verdict_record: string
    verifier_package: string
    deployment_registry: string
  }
}

export interface EvaluatorEscrowSettlementView {
  standard: 'djd-evaluator-escrow-settlement-v1'
  ready: boolean
  reason: string | null
  verdict_id: string
  escrow: {
    contract: typeof DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT
    function: typeof DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_FUNCTION
    selector: string
    chain_id: number
  }
  verifier: {
    contract: typeof DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT
    function: typeof DJD_EVALUATOR_VERDICT_VERIFIER_FUNCTION
  }
  attestation: {
    status: 'signed' | 'unsigned'
    signer: string | null
    digest: string
    signature: string | null
    scheme: 'eip712'
  }
  settlement: {
    recommendation: string
    approved: boolean
    outcome: 'release' | 'manual_review' | 'dispute' | 'reject'
    release_authorized: boolean
  }
  verdict: EvaluatorStoredVerdictView['attestation']['typed_data']['message']
  call: {
    selector: string | null
    calldata: string | null
    args: {
      verdict: EvaluatorStoredVerdictView['attestation']['typed_data']['message']
      signature: string | null
    }
  }
  transaction: {
    to: string | null
    data: string | null
    value: '0'
  }
  resolution: {
    source: 'explicit' | 'published_registry' | 'unresolved'
    contract_address: string | null
    registry_updated_at: string | null
    published_deployment: PublishedEvaluatorDeployment | null
  }
  links: {
    verdict_record: string
    verifier_package: string
    verifier_proof: string
    deployment_registry: string
  }
}

export interface EvaluatorDeploymentPlanView {
  standard: 'djd-evaluator-deploy-plan-v1'
  network: ReturnType<typeof toNetworkView>
  verdict_id: string
  verifier: {
    contract: typeof DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT
    constructor: {
      initial_signer: string | null
    }
    deployment_ready: boolean
    reason: string | null
  }
  escrow: {
    contract: typeof DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT
    constructor: {
      verifier: string | null
      verifier_source: 'explicit' | 'published_registry' | 'manual_required'
      provider: string
      counterparty: string
      escrow_id: string | null
      escrow_id_hash: string
    }
    deployment_ready: boolean
    reason: string | null
  }
  links: {
    verifier_package: string
    verifier_proof: string
    escrow_settlement: string
    deployment_registry: string
  }
  notes: string[]
}

export interface EvaluatorDeploymentBundleView {
  standard: 'djd-evaluator-deploy-bundle-v1'
  network: EvaluatorDeploymentPlanView['network']
  verdict_id: string
  artifacts: {
    available: boolean
    compiler: EvaluatorArtifactPackageView['compiler']
    verifier: EvaluatorArtifactPackageView['contracts'][number] | null
    escrow: EvaluatorArtifactPackageView['contracts'][number] | null
  }
  deployment: {
    order: Array<'verifier' | 'escrow'>
    verifier: {
      action: 'deploy' | 'use_existing'
      contract: typeof DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT
      current_address: string | null
      constructor: EvaluatorDeploymentPlanView['verifier']['constructor']
      deployment_ready: boolean
      reason: string | null
    }
    escrow: {
      action: 'deploy'
      contract: typeof DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT
      constructor: {
        verifier: string | null
        verifier_source: 'existing' | 'deployment_output'
        provider: string
        counterparty: string
        escrow_id: string | null
        escrow_id_hash: string
      }
      deployment_ready: boolean
      reason: string | null
    }
  }
  links: EvaluatorDeploymentPlanView['links'] & {
    artifact_package: string
    bundle: string
  }
  notes: string[]
}

export interface EvaluatorNetworkCatalogView {
  standard: 'djd-evaluator-network-catalog-v1'
  default_network: EvaluatorVerifierPackageView['network']
  supported_networks: Array<
    EvaluatorVerifierPackageView['network'] & {
      explorer: {
        name: string
        base_url: string
      }
      deployment: {
        rpc_env_var: string
        bundle_param: string
        verifier_package: string
        deployment_registry: string
      }
    }
  >
  signing: {
    active_signer: ReturnType<typeof getEvaluatorAttestationSignerStatus>
  }
  artifacts: {
    available: boolean
  }
}

export function getEvaluatorVerifierPackageView(
  network: EvaluatorNetworkConfig = getDefaultEvaluatorNetwork(),
): EvaluatorVerifierPackageView {
  const signerStatus = getEvaluatorAttestationSignerStatus()

  return {
    standard: 'djd-evaluator-verifier-package-v1',
    network: toNetworkView(network),
    signing: {
      scheme: 'eip712',
      primary_type: EVALUATOR_VERDICT_PRIMARY_TYPE,
      domain: buildEvaluatorVerdictDomain(network.chainId),
      types: EVALUATOR_VERDICT_TYPES,
      active_signer: signerStatus,
    },
    contracts: {
      callback_interface: {
        contract: DJD_EVALUATOR_ORACLE_CALLBACK_INTERFACE,
        function: DJD_EVALUATOR_ORACLE_CALLBACK_FUNCTION,
        signature: DJD_EVALUATOR_ORACLE_CALLBACK_SIGNATURE,
        selector: DJD_EVALUATOR_ORACLE_CALLBACK_SELECTOR,
        abi: toJsonAbi(DJD_EVALUATOR_ORACLE_CALLBACK_ABI),
      },
      verifier: {
        contract: DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT,
        constructor: {
          initial_signer: signerStatus.address,
        },
        methods: {
          hash_verdict: {
            signature: DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.hashVerdict,
            selector: DJD_EVALUATOR_VERDICT_VERIFIER_SELECTORS.hashVerdict,
          },
          verify_verdict: {
            signature: DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.verifyVerdict,
            selector: DJD_EVALUATOR_VERDICT_VERIFIER_SELECTORS.verifyVerdict,
          },
          verify_digest: {
            signature: DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.verifyDigest,
            selector: DJD_EVALUATOR_VERDICT_VERIFIER_SELECTORS.verifyDigest,
          },
          set_oracle_signer: {
            signature: DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.setOracleSigner,
            selector: DJD_EVALUATOR_VERDICT_VERIFIER_SELECTORS.setOracleSigner,
          },
          transfer_ownership: {
            signature: DJD_EVALUATOR_VERDICT_VERIFIER_SIGNATURES.transferOwnership,
            selector: DJD_EVALUATOR_VERDICT_VERIFIER_SELECTORS.transferOwnership,
          },
        },
        abi: toJsonAbi(DJD_EVALUATOR_VERDICT_VERIFIER_ABI),
      },
      settlement_example: {
        contract: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT,
        function: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_FUNCTION,
        signature: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SIGNATURE,
        selector: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SELECTOR,
        constructor: {
          verifier: signerStatus.address,
          provider: 'wallet_from_verdict',
          counterparty: 'counterparty_wallet_from_verdict_or_zero',
          escrow_id: 'escrow_id_from_verdict',
          escrow_id_hash: 'keccak256(escrow_id)',
        },
        abi: toJsonAbi(DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_ABI),
      },
      sources: CONTRACT_SOURCES,
    },
    endpoints: {
      oracle_verdict: buildPublicUrl(`/v1/score/evaluator/oracle?wallet=0x...&network=${network.key}`),
      verdict_record: buildPublicUrl('/v1/score/evaluator/verdict?id=verdict_...'),
      callback_calldata: buildPublicUrl(`/v1/score/evaluator/callback?id=verdict_...&network=${network.key}`),
      deployment_registry: buildPublicUrl(`/v1/score/evaluator/deployments?network=${network.key}`),
      artifact_package: buildPublicUrl('/v1/score/evaluator/artifacts'),
      verifier_proof: buildPublicUrl(`/v1/score/evaluator/proof?id=verdict_...&network=${network.key}`),
      escrow_settlement: buildPublicUrl(`/v1/score/evaluator/escrow?id=verdict_...&network=${network.key}`),
      deploy_plan: buildPublicUrl(`/v1/score/evaluator/deploy?id=verdict_...&network=${network.key}`),
      docs: buildPublicUrl('/docs'),
    },
    notes: [
      `Deploy DJDEvaluatorVerdictVerifier on ${network.chainName} with the active DJD oracle signer address as the constructor argument.`,
      'Use /v1/score/evaluator/oracle or /v1/score/evaluator/verdict to fetch the full typed verdict before calling verifyVerdict onchain.',
      'Use DJDEvaluatorEscrowSettlementExample as a reference consumer that verifies the signed verdict before recording release, review, dispute, or reject state.',
      'Use /v1/score/evaluator/callback as a relay helper only; it carries compact settlement fields and the attestation digest, not the full EIP-712 preimage.',
      'Issue the oracle verdict for the same target network that will verify it onchain. Base and Base Sepolia use different EIP-712 chain ids.',
      signerStatus.configured
        ? 'Signed evaluator verdicts are currently available when the oracle signer remains configured.'
        : 'Evaluator verdicts remain unsigned until ORACLE_SIGNER_PRIVATE_KEY or PUBLISHER_PRIVATE_KEY is configured.',
    ],
  }
}

export function getEvaluatorNetworkCatalogView(): EvaluatorNetworkCatalogView {
  const signerStatus = getEvaluatorAttestationSignerStatus()
  const artifacts = getEvaluatorArtifactPackageView()
  const defaultNetwork = getDefaultEvaluatorNetwork()

  return {
    standard: 'djd-evaluator-network-catalog-v1',
    default_network: toNetworkView(defaultNetwork),
    supported_networks: listEvaluatorNetworks().map((network) => ({
      ...toNetworkView(network),
      explorer: {
        name: network.explorer.name,
        base_url: network.explorer.baseUrl,
      },
      deployment: {
        rpc_env_var: network.rpcEnvVar,
        bundle_param: network.key,
        verifier_package: buildPublicUrl(`/v1/score/evaluator/verifier?network=${network.key}`),
        deployment_registry: buildPublicUrl(`/v1/score/evaluator/deployments?network=${network.key}`),
      },
    })),
    signing: {
      active_signer: signerStatus,
    },
    artifacts: {
      available: artifacts.available,
    },
  }
}

export function getEvaluatorVerifierProofView(params: {
  rawVerdictId: string | undefined
  rawTargetContract?: string | undefined
  rawNetwork?: string | undefined
}): EvaluatorServiceResult<EvaluatorVerifierProofView> {
  const storedVerdict = getEvaluatorVerdictRecord(params.rawVerdictId)
  if (!storedVerdict.ok) {
    return storedVerdict
  }

  const networkOutcome = resolveStoredVerdictNetwork(storedVerdict.data, params.rawNetwork)
  if (!networkOutcome.ok) {
    return networkOutcome
  }

  const targetContract =
    params.rawTargetContract === undefined || params.rawTargetContract === ''
      ? null
      : normalizeWallet(params.rawTargetContract)
  if (params.rawTargetContract && !targetContract) {
    return {
      ok: false,
      code: 'invalid_wallet',
      message: 'Invalid or missing target_contract address',
      status: 400,
    }
  }

  const verdict = storedVerdict.data
  const targetResolution = resolveProofTargetContract(networkOutcome.data, targetContract)
  const verdictMessage = verdict.attestation.typed_data.message
  const isSigned = verdict.attestation.status === 'signed' && verdict.attestation.signature !== null
  const calldata = isSigned
    ? encodeEvaluatorVerdictVerification({
        verdict: {
          verdictId: verdictMessage.verdictId,
          wallet: verdictMessage.wallet,
          counterpartyWallet: verdictMessage.counterpartyWallet,
          escrowId: verdictMessage.escrowId,
          decision: verdictMessage.decision,
          recommendation: verdictMessage.recommendation,
          approved: verdictMessage.approved,
          confidence: verdictMessage.confidence,
          agentScoreProvider: verdictMessage.agentScoreProvider,
          scoreModelVersion: verdictMessage.scoreModelVersion,
          certificationValid: verdictMessage.certificationValid,
          certificationTier: verdictMessage.certificationTier,
          riskLevel: verdictMessage.riskLevel,
          riskScore: verdictMessage.riskScore,
          forensicTraceId: verdictMessage.forensicTraceId,
          packetHash: verdictMessage.packetHash,
          generatedAt: verdictMessage.generatedAt,
        },
        signature: verdict.attestation.signature as `0x${string}`,
      })
    : null

  return {
    ok: true,
    data: {
      standard: 'djd-evaluator-verifier-proof-v1',
      ready: isSigned,
      reason: isSigned ? null : 'verdict_attestation_unsigned',
      verdict_id: verdict.verdict_id,
      verifier: {
        contract: DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT,
        function: DJD_EVALUATOR_VERDICT_VERIFIER_FUNCTION,
        selector: DJD_EVALUATOR_VERDICT_VERIFIER_SELECTORS.verifyVerdict,
        chain_id: networkOutcome.data.chainId,
      },
      attestation: {
        status: verdict.attestation.status,
        signer: verdict.attestation.signer,
        digest: verdict.attestation.digest,
        signature: verdict.attestation.signature,
        scheme: verdict.attestation.scheme,
      },
      verdict: verdictMessage,
      call: {
        selector: isSigned ? DJD_EVALUATOR_VERDICT_VERIFIER_SELECTORS.verifyVerdict : null,
        calldata,
        args: {
          verdict: verdictMessage,
          signature: verdict.attestation.signature,
        },
      },
      transaction: {
        to: targetResolution.contract_address,
        data: calldata,
        value: '0',
      },
      resolution: targetResolution,
      links: {
        verdict_record: buildPublicUrl(`/v1/score/evaluator/verdict?id=${encodeURIComponent(verdict.verdict_id)}`),
        verifier_package: buildPublicUrl(`/v1/score/evaluator/verifier?network=${networkOutcome.data.key}`),
        deployment_registry: buildPublicUrl(`/v1/score/evaluator/deployments?network=${networkOutcome.data.key}`),
      },
    },
  }
}

export function getEvaluatorEscrowSettlementView(params: {
  rawVerdictId: string | undefined
  rawEscrowContract?: string | undefined
  rawNetwork?: string | undefined
}): EvaluatorServiceResult<EvaluatorEscrowSettlementView> {
  const storedVerdict = getEvaluatorVerdictRecord(params.rawVerdictId)
  if (!storedVerdict.ok) {
    return storedVerdict
  }

  const networkOutcome = resolveStoredVerdictNetwork(storedVerdict.data, params.rawNetwork)
  if (!networkOutcome.ok) {
    return networkOutcome
  }

  const escrowContract =
    params.rawEscrowContract === undefined || params.rawEscrowContract === ''
      ? null
      : normalizeWallet(params.rawEscrowContract)
  if (params.rawEscrowContract && !escrowContract) {
    return {
      ok: false,
      code: 'invalid_wallet',
      message: 'Invalid or missing escrow_contract address',
      status: 400,
    }
  }

  const verdict = storedVerdict.data
  const escrowResolution = resolveEscrowTargetContract(networkOutcome.data, escrowContract)
  const verdictMessage = verdict.attestation.typed_data.message
  const isSigned = verdict.attestation.status === 'signed' && verdict.attestation.signature !== null
  const calldata = isSigned
    ? encodeEvaluatorEscrowSettlement({
        verdict: {
          verdictId: verdictMessage.verdictId,
          wallet: verdictMessage.wallet,
          counterpartyWallet: verdictMessage.counterpartyWallet,
          escrowId: verdictMessage.escrowId,
          decision: verdictMessage.decision,
          recommendation: verdictMessage.recommendation,
          approved: verdictMessage.approved,
          confidence: verdictMessage.confidence,
          agentScoreProvider: verdictMessage.agentScoreProvider,
          scoreModelVersion: verdictMessage.scoreModelVersion,
          certificationValid: verdictMessage.certificationValid,
          certificationTier: verdictMessage.certificationTier,
          riskLevel: verdictMessage.riskLevel,
          riskScore: verdictMessage.riskScore,
          forensicTraceId: verdictMessage.forensicTraceId,
          packetHash: verdictMessage.packetHash,
          generatedAt: verdictMessage.generatedAt,
        },
        signature: verdict.attestation.signature as `0x${string}`,
      })
    : null

  const outcome =
    verdict.recommendation === 'release' && verdict.approved
      ? 'release'
      : verdict.recommendation === 'manual_review'
        ? 'manual_review'
        : verdict.recommendation === 'dispute'
          ? 'dispute'
          : 'reject'

  return {
    ok: true,
    data: {
      standard: 'djd-evaluator-escrow-settlement-v1',
      ready: isSigned,
      reason: isSigned ? null : 'verdict_attestation_unsigned',
      verdict_id: verdict.verdict_id,
      escrow: {
        contract: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT,
        function: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_FUNCTION,
        selector: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SELECTOR,
        chain_id: networkOutcome.data.chainId,
      },
      verifier: {
        contract: DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT,
        function: DJD_EVALUATOR_VERDICT_VERIFIER_FUNCTION,
      },
      attestation: {
        status: verdict.attestation.status,
        signer: verdict.attestation.signer,
        digest: verdict.attestation.digest,
        signature: verdict.attestation.signature,
        scheme: verdict.attestation.scheme,
      },
      settlement: {
        recommendation: verdict.recommendation,
        approved: verdict.approved,
        outcome,
        release_authorized: outcome === 'release',
      },
      verdict: verdictMessage,
      call: {
        selector: isSigned ? DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_SELECTOR : null,
        calldata,
        args: {
          verdict: verdictMessage,
          signature: verdict.attestation.signature,
        },
      },
      transaction: {
        to: escrowResolution.contract_address,
        data: calldata,
        value: '0',
      },
      resolution: escrowResolution,
      links: {
        verdict_record: buildPublicUrl(`/v1/score/evaluator/verdict?id=${encodeURIComponent(verdict.verdict_id)}`),
        verifier_package: buildPublicUrl(`/v1/score/evaluator/verifier?network=${networkOutcome.data.key}`),
        verifier_proof: buildPublicUrl(
          `/v1/score/evaluator/proof?id=${encodeURIComponent(verdict.verdict_id)}&network=${networkOutcome.data.key}`,
        ),
        deployment_registry: buildPublicUrl(`/v1/score/evaluator/deployments?network=${networkOutcome.data.key}`),
      },
    },
  }
}

export function getEvaluatorDeploymentPlanView(params: {
  rawVerdictId: string | undefined
  rawVerifierContract?: string | undefined
  rawNetwork?: string | undefined
}): EvaluatorServiceResult<EvaluatorDeploymentPlanView> {
  const storedVerdict = getEvaluatorVerdictRecord(params.rawVerdictId)
  if (!storedVerdict.ok) {
    return storedVerdict
  }

  const networkOutcome = resolveStoredVerdictNetwork(storedVerdict.data, params.rawNetwork)
  if (!networkOutcome.ok) {
    return networkOutcome
  }

  const explicitVerifierContract =
    params.rawVerifierContract === undefined || params.rawVerifierContract === ''
      ? null
      : normalizeWallet(params.rawVerifierContract)
  if (params.rawVerifierContract && !explicitVerifierContract) {
    return {
      ok: false,
      code: 'invalid_wallet',
      message: 'Invalid or missing verifier_contract address',
      status: 400,
    }
  }

  const signerStatus = getEvaluatorAttestationSignerStatus()
  const verdict = storedVerdict.data
  const publishedDeployment = resolvePublishedDeployment(networkOutcome.data)
  const publishedVerifierContract = publishedDeployment.deployment?.contracts.verifier.address ?? null
  const verifierContract = explicitVerifierContract ?? publishedVerifierContract
  const verifierSource = explicitVerifierContract
    ? 'explicit'
    : publishedVerifierContract
      ? 'published_registry'
      : 'manual_required'

  return {
    ok: true,
    data: {
      standard: 'djd-evaluator-deploy-plan-v1',
      network: toNetworkView(networkOutcome.data),
      verdict_id: verdict.verdict_id,
      verifier: {
        contract: DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT,
        constructor: {
          initial_signer: signerStatus.address,
        },
        deployment_ready: signerStatus.configured,
        reason: signerStatus.reason,
      },
      escrow: {
        contract: DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT,
        constructor: {
          verifier: verifierContract,
          verifier_source: verifierSource,
          provider: verdict.wallet,
          counterparty: verdict.counterparty_wallet ?? ZERO_ADDRESS,
          escrow_id: verdict.escrow_id,
          escrow_id_hash: buildEscrowIdHash(verdict.escrow_id),
        },
        deployment_ready: verifierContract !== null,
        reason: verifierContract ? null : 'verifier_contract_required',
      },
      links: {
        verifier_package: buildPublicUrl(`/v1/score/evaluator/verifier?network=${networkOutcome.data.key}`),
        verifier_proof: buildPublicUrl(
          `/v1/score/evaluator/proof?id=${encodeURIComponent(verdict.verdict_id)}&network=${networkOutcome.data.key}`,
        ),
        escrow_settlement: buildPublicUrl(
          `/v1/score/evaluator/escrow?id=${encodeURIComponent(verdict.verdict_id)}&network=${networkOutcome.data.key}`,
        ),
        deployment_registry: buildPublicUrl(`/v1/score/evaluator/deployments?network=${networkOutcome.data.key}`),
      },
      notes: [
        'Deploy DJDEvaluatorVerdictVerifier first so the escrow consumer can reference a concrete verifier address.',
        'Use the provider, counterparty, and escrow id hash from this plan when deploying DJDEvaluatorEscrowSettlementExample.',
        `This deployment plan is locked to ${networkOutcome.data.chainName}. Use a verdict issued for the same network when verifying onchain.`,
        verifierSource === 'published_registry'
          ? 'A published verifier deployment was found for this network, so the escrow consumer can reuse it without a manual verifier_contract parameter.'
          : verifierSource === 'explicit'
            ? 'The escrow consumer is configured to use the explicit verifier_contract override supplied in this request.'
            : 'No published verifier deployment was found for this network, so verifier_contract is still required for escrow deployment planning.',
        signerStatus.configured
          ? 'The verifier constructor can use the currently active DJD oracle signer address.'
          : 'Set ORACLE_SIGNER_PRIVATE_KEY or PUBLISHER_PRIVATE_KEY before relying on signed verdict verification in production.',
      ],
    },
  }
}

export function getEvaluatorDeploymentBundleView(params: {
  rawVerdictId: string | undefined
  rawVerifierContract?: string | undefined
  rawNetwork?: string | undefined
}): EvaluatorServiceResult<EvaluatorDeploymentBundleView> {
  const plan = getEvaluatorDeploymentPlanView(params)
  if (!plan.ok) {
    return plan
  }

  const artifacts = getEvaluatorArtifactPackageView()
  const verifierArtifact = getEvaluatorArtifactContractEntry(DJD_EVALUATOR_VERDICT_VERIFIER_CONTRACT)
  const escrowArtifact = getEvaluatorArtifactContractEntry(DJD_EVALUATOR_ESCROW_SETTLEMENT_EXAMPLE_CONTRACT)
  const usingExistingVerifier = plan.data.escrow.constructor.verifier !== null

  return {
    ok: true,
    data: {
      standard: 'djd-evaluator-deploy-bundle-v1',
      network: plan.data.network,
      verdict_id: plan.data.verdict_id,
      artifacts: {
        available: artifacts.available,
        compiler: artifacts.compiler,
        verifier: verifierArtifact,
        escrow: escrowArtifact,
      },
      deployment: {
        order: ['verifier', 'escrow'],
        verifier: {
          action: usingExistingVerifier ? 'use_existing' : 'deploy',
          contract: plan.data.verifier.contract,
          current_address: plan.data.escrow.constructor.verifier,
          constructor: plan.data.verifier.constructor,
          deployment_ready: usingExistingVerifier ? true : plan.data.verifier.deployment_ready,
          reason: usingExistingVerifier ? null : plan.data.verifier.reason,
        },
        escrow: {
          action: 'deploy',
          contract: plan.data.escrow.contract,
          constructor: {
            ...plan.data.escrow.constructor,
            verifier_source: usingExistingVerifier ? 'existing' : 'deployment_output',
          },
          deployment_ready: artifacts.available && escrowArtifact !== null,
          reason: !artifacts.available
            ? 'artifact_package_unavailable'
            : escrowArtifact === null
              ? 'escrow_artifact_missing'
              : null,
        },
      },
      links: {
        ...plan.data.links,
        artifact_package: buildPublicUrl('/v1/score/evaluator/artifacts'),
        bundle: buildPublicUrl(
          `/v1/score/evaluator/deploy/bundle?id=${encodeURIComponent(plan.data.verdict_id)}&network=${encodeURIComponent(plan.data.network.key)}${
            plan.data.escrow.constructor.verifier
              ? `&verifier_contract=${encodeURIComponent(plan.data.escrow.constructor.verifier)}`
              : ''
          }`,
        ),
      },
      notes: [
        'Use this bundle when a deploy tool needs both the constructor plan and the compiled artifact payloads in one response.',
        usingExistingVerifier
          ? 'The bundle is configured to reuse the provided verifier contract address and deploy only the escrow consumer.'
          : 'The bundle is configured to deploy a new verifier first and then feed that address into the escrow consumer deployment.',
        ...plan.data.notes,
      ],
    },
  }
}
