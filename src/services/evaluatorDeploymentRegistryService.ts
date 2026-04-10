import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPublicUrl } from '../config/public.js'
import {
  type EvaluatorNetworkConfig,
  findEvaluatorNetworkByChainId,
  getDefaultEvaluatorNetwork,
  listEvaluatorNetworks,
  resolveEvaluatorNetwork,
} from './evaluatorNetworkService.js'
import type { EvaluatorServiceResult } from './evaluatorService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REGISTRY_PATH = join(__dirname, '..', '..', 'data', 'evaluator-deployments.json')

interface EvaluatorDeploymentRegistryEntryDocument {
  published_at?: string | null
  network?: {
    key?: string
    chain_id?: number
    chain_name?: string
    caip2?: string
    environment?: string
  }
  verdict_id?: string | null
  deployer?: string | null
  contracts?: {
    verifier?: {
      contract?: string | null
      address?: string | null
      tx_hash?: string | null
      action?: string | null
    }
    escrow?: {
      contract?: string | null
      address?: string | null
      tx_hash?: string | null
      action?: string | null
    }
  }
  verification?: {
    oracle_signer?: string | null
    escrow_verifier?: string | null
    escrow_provider?: string | null
    escrow_counterparty?: string | null
    escrow_id_hash?: string | null
  }
  inputs?: {
    network_key?: string | null
    provider?: string | null
    counterparty?: string | null
    escrow_id?: string | null
  }
  explorer?: {
    verifier_address?: string | null
    verifier_transaction?: string | null
    escrow_address?: string | null
    escrow_transaction?: string | null
  } | null
  links?: Record<string, string | null | undefined>
  checks?: {
    preflight?: boolean | null
    verified?: boolean | null
    smoked?: boolean | null
    health?: boolean | null
    staged?: boolean | null
  }
}

interface EvaluatorDeploymentRegistryDocument {
  standard?: string
  updated_at?: string | null
  deployments?: Record<string, EvaluatorDeploymentRegistryEntryDocument>
}

export interface PublishedEvaluatorDeployment {
  published_at: string | null
  network: {
    key: string | null
    chain_id: number | null
    chain_name: string | null
    caip2: string | null
    environment: string | null
  }
  verdict_id: string | null
  deployer: string | null
  contracts: {
    verifier: {
      contract: string | null
      address: string | null
      tx_hash: string | null
      action: string | null
    }
    escrow: {
      contract: string | null
      address: string | null
      tx_hash: string | null
      action: string | null
    }
  }
  verification: {
    oracle_signer: string | null
    escrow_verifier: string | null
    escrow_provider: string | null
    escrow_counterparty: string | null
    escrow_id_hash: string | null
  }
  inputs: {
    provider: string | null
    counterparty: string | null
    escrow_id: string | null
  }
  checks: {
    preflight: boolean | null
    verified: boolean | null
    smoked: boolean | null
    health: boolean | null
    staged: boolean | null
  }
  explorer: EvaluatorDeploymentRegistryEntryDocument['explorer']
  links: {
    verifier_package: string
    deployment_registry: string
    verifier_proof: string | null
    escrow_settlement: string | null
    deploy_bundle: string | null
  }
}

export interface EvaluatorDeploymentRegistryView {
  standard: 'djd-evaluator-deployments-v1'
  registry: {
    available: boolean
    updated_at: string | null
    deployment_count: number
    error: string | null
  }
  filter: {
    network: string | null
  }
  networks: Array<{
    key: string
    chain_id: number
    chain_name: string
    caip2: string
    environment: string
    explorer: {
      name: string
      base_url: string
    }
    rpc_env_var: string
    deployed: boolean
    deployment: null | PublishedEvaluatorDeployment
  }>
}

export interface EvaluatorDeploymentPromotionBundleView {
  standard: 'djd-evaluator-promotion-bundle-v1'
  ready: boolean
  reason: 'deployment_not_published' | null
  source: 'published_registry'
  registry: {
    available: boolean
    updated_at: string | null
    error: string | null
  }
  network: {
    key: string
    chain_id: number
    chain_name: string
    caip2: string
    environment: string
    rpc_env_var: string
    explorer: {
      name: string
      base_url: string
    }
  }
  deployment: PublishedEvaluatorDeployment | null
  outputs: null | {
    variables: Record<string, string>
    generic: Record<string, string>
    network_scoped: Record<string, string>
    dotenv: string
    shell: string
    github_output: string
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

function getRegistryPath(): string {
  const configuredPath = process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH
  return typeof configuredPath === 'string' && configuredPath.trim().length > 0
    ? configuredPath.trim()
    : DEFAULT_REGISTRY_PATH
}

function sanitizeNetworkEnvSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function setVariable(target: Record<string, string>, key: string, value: string | number | null | undefined): void {
  if (value === null || value === undefined || value === '') {
    return
  }

  target[key] = String(value)
}

function escapeDotenvValue(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value
  }

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

function escapeShellValue(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function formatKeyValueLines(
  variables: Record<string, string>,
  formatter: (key: string, value: string) => string,
): string {
  return `${Object.entries(variables)
    .map(([key, value]) => formatter(key, value))
    .join('\n')}\n`
}

function buildPromotionOutputs(
  network: EvaluatorNetworkConfig,
  deployment: PublishedEvaluatorDeployment,
): EvaluatorDeploymentPromotionBundleView['outputs'] {
  const generic: Record<string, string> = {}
  const networkScoped: Record<string, string> = {}
  const networkSegment = sanitizeNetworkEnvSegment(network.key)
  const apiBaseUrl = buildPublicUrl()

  setVariable(generic, 'DJD_NETWORK', network.key)
  setVariable(generic, 'DJD_CHAIN_ID', network.chainId)
  setVariable(generic, 'DJD_CHAIN_NAME', network.chainName)
  setVariable(generic, 'DJD_CAIP2', network.caip2)
  setVariable(generic, 'DJD_ENVIRONMENT', network.environment)
  setVariable(generic, 'DJD_VERDICT_ID', deployment.verdict_id)
  setVariable(generic, 'DJD_DEPLOYMENT_SOURCE', 'published_registry')
  setVariable(generic, 'DJD_DEPLOYMENT_SOURCE_LOCATION', deployment.links.deployment_registry)
  setVariable(generic, 'DJD_DEPLOYER_ADDRESS', deployment.deployer)
  setVariable(generic, 'DJD_VERIFIER_CONTRACT', deployment.contracts.verifier.address)
  setVariable(generic, 'DJD_ESCROW_CONTRACT', deployment.contracts.escrow.address)
  setVariable(generic, 'DJD_ORACLE_SIGNER', deployment.verification.oracle_signer)
  setVariable(generic, 'DJD_ESCROW_PROVIDER', deployment.inputs.provider ?? deployment.verification.escrow_provider)
  setVariable(
    generic,
    'DJD_ESCROW_COUNTERPARTY',
    deployment.inputs.counterparty ?? deployment.verification.escrow_counterparty,
  )
  setVariable(generic, 'DJD_ESCROW_ID', deployment.inputs.escrow_id)
  setVariable(generic, 'DJD_ESCROW_ID_HASH', deployment.verification.escrow_id_hash)
  setVariable(generic, 'DJD_API_BASE_URL', apiBaseUrl)
  setVariable(generic, 'DJD_VERIFIER_PACKAGE_URL', deployment.links.verifier_package)
  setVariable(generic, 'DJD_VERIFIER_PROOF_URL', deployment.links.verifier_proof)
  setVariable(generic, 'DJD_ESCROW_SETTLEMENT_URL', deployment.links.escrow_settlement)
  setVariable(generic, 'DJD_DEPLOY_BUNDLE_URL', deployment.links.deploy_bundle)
  setVariable(generic, 'DJD_DEPLOYMENTS_URL', deployment.links.deployment_registry)
  setVariable(generic, 'DJD_ARTIFACT_PACKAGE_URL', buildPublicUrl('/v1/score/evaluator/artifacts'))
  setVariable(generic, 'DJD_VERIFIER_EXPLORER_URL', deployment.explorer?.verifier_address ?? null)
  setVariable(generic, 'DJD_VERIFIER_TX_URL', deployment.explorer?.verifier_transaction ?? null)
  setVariable(generic, 'DJD_ESCROW_EXPLORER_URL', deployment.explorer?.escrow_address ?? null)
  setVariable(generic, 'DJD_ESCROW_TX_URL', deployment.explorer?.escrow_transaction ?? null)

  setVariable(networkScoped, `DJD_${networkSegment}_NETWORK`, network.key)
  setVariable(networkScoped, `DJD_${networkSegment}_CHAIN_ID`, network.chainId)
  setVariable(networkScoped, `DJD_${networkSegment}_VERDICT_ID`, deployment.verdict_id)
  setVariable(networkScoped, `DJD_${networkSegment}_VERIFIER_CONTRACT`, deployment.contracts.verifier.address)
  setVariable(networkScoped, `DJD_${networkSegment}_ESCROW_CONTRACT`, deployment.contracts.escrow.address)
  setVariable(networkScoped, `DJD_${networkSegment}_ORACLE_SIGNER`, deployment.verification.oracle_signer)
  setVariable(networkScoped, `DJD_${networkSegment}_VERIFIER_PACKAGE_URL`, deployment.links.verifier_package)
  setVariable(networkScoped, `DJD_${networkSegment}_VERIFIER_PROOF_URL`, deployment.links.verifier_proof)
  setVariable(networkScoped, `DJD_${networkSegment}_ESCROW_SETTLEMENT_URL`, deployment.links.escrow_settlement)
  setVariable(networkScoped, `DJD_${networkSegment}_DEPLOY_BUNDLE_URL`, deployment.links.deploy_bundle)
  setVariable(networkScoped, `DJD_${networkSegment}_DEPLOYMENTS_URL`, deployment.links.deployment_registry)
  setVariable(
    networkScoped,
    `DJD_${networkSegment}_ARTIFACT_PACKAGE_URL`,
    buildPublicUrl('/v1/score/evaluator/artifacts'),
  )

  const variables = {
    ...generic,
    ...networkScoped,
  }

  return {
    variables,
    generic,
    network_scoped: networkScoped,
    dotenv: formatKeyValueLines(variables, (key, value) => `${key}=${escapeDotenvValue(value)}`),
    shell: formatKeyValueLines(variables, (key, value) => `export ${key}=${escapeShellValue(value)}`),
    github_output: formatKeyValueLines(variables, (key, value) => `${key}=${value}`),
  }
}

function loadRegistryDocument(): {
  available: boolean
  updated_at: string | null
  deployments: Record<string, EvaluatorDeploymentRegistryEntryDocument>
  error: string | null
} {
  const filePath = getRegistryPath()
  if (!existsSync(filePath)) {
    return {
      available: false,
      updated_at: null,
      deployments: {},
      error: null,
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as EvaluatorDeploymentRegistryDocument
    if (parsed.standard !== 'djd-evaluator-deployment-registry-v1') {
      return {
        available: false,
        updated_at: null,
        deployments: {},
        error: 'registry_invalid_standard',
      }
    }

    return {
      available: true,
      updated_at: parsed.updated_at ?? null,
      deployments: parsed.deployments ?? {},
      error: null,
    }
  } catch {
    return {
      available: false,
      updated_at: null,
      deployments: {},
      error: 'registry_unreadable',
    }
  }
}

function resolveDeploymentEntryForNetwork(
  deployments: Record<string, EvaluatorDeploymentRegistryEntryDocument>,
  network: EvaluatorNetworkConfig,
): EvaluatorDeploymentRegistryEntryDocument | null {
  const direct = deployments[network.key]
  if (direct) {
    return direct
  }

  return (
    Object.values(deployments).find((entry) => {
      if (entry.network?.key === network.key) {
        return true
      }

      const entryNetwork = findEvaluatorNetworkByChainId(entry.network?.chain_id ?? null)
      return entryNetwork?.key === network.key
    }) ?? null
  )
}

function toDeploymentView(
  entry: EvaluatorDeploymentRegistryEntryDocument,
  network: EvaluatorNetworkConfig,
): PublishedEvaluatorDeployment {
  return {
    published_at: entry.published_at ?? null,
    network: {
      key: entry.network?.key ?? network.key,
      chain_id: entry.network?.chain_id ?? network.chainId,
      chain_name: entry.network?.chain_name ?? network.chainName,
      caip2: entry.network?.caip2 ?? network.caip2,
      environment: entry.network?.environment ?? network.environment,
    },
    verdict_id: entry.verdict_id ?? null,
    deployer: entry.deployer ?? null,
    contracts: {
      verifier: {
        contract: entry.contracts?.verifier?.contract ?? null,
        address: entry.contracts?.verifier?.address ?? null,
        tx_hash: entry.contracts?.verifier?.tx_hash ?? null,
        action: entry.contracts?.verifier?.action ?? null,
      },
      escrow: {
        contract: entry.contracts?.escrow?.contract ?? null,
        address: entry.contracts?.escrow?.address ?? null,
        tx_hash: entry.contracts?.escrow?.tx_hash ?? null,
        action: entry.contracts?.escrow?.action ?? null,
      },
    },
    verification: {
      oracle_signer: entry.verification?.oracle_signer ?? null,
      escrow_verifier: entry.verification?.escrow_verifier ?? null,
      escrow_provider: entry.verification?.escrow_provider ?? null,
      escrow_counterparty: entry.verification?.escrow_counterparty ?? null,
      escrow_id_hash: entry.verification?.escrow_id_hash ?? null,
    },
    inputs: {
      provider: entry.inputs?.provider ?? null,
      counterparty: entry.inputs?.counterparty ?? null,
      escrow_id: entry.inputs?.escrow_id ?? null,
    },
    checks: {
      preflight: entry.checks?.preflight ?? null,
      verified: entry.checks?.verified ?? null,
      smoked: entry.checks?.smoked ?? null,
      health: entry.checks?.health ?? null,
      staged: entry.checks?.staged ?? null,
    },
    explorer: entry.explorer ?? null,
    links: {
      verifier_package: buildPublicUrl(`/v1/score/evaluator/verifier?network=${network.key}`),
      deployment_registry: buildPublicUrl(`/v1/score/evaluator/deployments?network=${network.key}`),
      verifier_proof: entry.links?.verifier_proof ?? null,
      escrow_settlement: entry.links?.escrow_settlement ?? null,
      deploy_bundle: entry.links?.bundle ?? null,
    },
  }
}

export function getPublishedEvaluatorDeployment(network: EvaluatorNetworkConfig): {
  registry: {
    available: boolean
    updated_at: string | null
    error: string | null
  }
  deployment: PublishedEvaluatorDeployment | null
} {
  const registry = loadRegistryDocument()
  const entry = resolveDeploymentEntryForNetwork(registry.deployments, network)

  return {
    registry: {
      available: registry.available,
      updated_at: registry.updated_at,
      error: registry.error,
    },
    deployment: entry ? toDeploymentView(entry, network) : null,
  }
}

export function getEvaluatorDeploymentRegistryView(
  rawNetwork?: string | undefined,
): EvaluatorServiceResult<EvaluatorDeploymentRegistryView> {
  const selectedNetwork =
    rawNetwork === undefined || rawNetwork.trim() === '' ? null : resolveEvaluatorNetwork(rawNetwork)
  if (rawNetwork !== undefined && rawNetwork.trim() !== '' && !selectedNetwork) {
    return invalidNetworkResult(rawNetwork)
  }

  const networks = selectedNetwork ? [selectedNetwork] : listEvaluatorNetworks()
  const registry = loadRegistryDocument()

  return {
    ok: true,
    data: {
      standard: 'djd-evaluator-deployments-v1',
      registry: {
        available: registry.available,
        updated_at: registry.updated_at,
        deployment_count: Object.keys(registry.deployments).length,
        error: registry.error,
      },
      filter: {
        network: selectedNetwork?.key ?? null,
      },
      networks: networks.map((network) => {
        const entry = resolveDeploymentEntryForNetwork(registry.deployments, network)
        return {
          key: network.key,
          chain_id: network.chainId,
          chain_name: network.chainName,
          caip2: network.caip2,
          environment: network.environment,
          explorer: {
            name: network.explorer.name,
            base_url: network.explorer.baseUrl,
          },
          rpc_env_var: network.rpcEnvVar,
          deployed: entry !== null,
          deployment: entry ? toDeploymentView(entry, network) : null,
        }
      }),
    },
  }
}

export function getEvaluatorDeploymentPromotionBundleView(
  rawNetwork?: string | undefined,
): EvaluatorServiceResult<EvaluatorDeploymentPromotionBundleView> {
  const network =
    rawNetwork === undefined || rawNetwork.trim() === ''
      ? getDefaultEvaluatorNetwork()
      : resolveEvaluatorNetwork(rawNetwork)
  if (!network) {
    return invalidNetworkResult(rawNetwork)
  }

  const published = getPublishedEvaluatorDeployment(network)

  return {
    ok: true,
    data: {
      standard: 'djd-evaluator-promotion-bundle-v1',
      ready: published.deployment !== null,
      reason: published.deployment ? null : 'deployment_not_published',
      source: 'published_registry',
      registry: published.registry,
      network: {
        key: network.key,
        chain_id: network.chainId,
        chain_name: network.chainName,
        caip2: network.caip2,
        environment: network.environment,
        rpc_env_var: network.rpcEnvVar,
        explorer: {
          name: network.explorer.name,
          base_url: network.explorer.baseUrl,
        },
      },
      deployment: published.deployment,
      outputs: published.deployment ? buildPromotionOutputs(network, published.deployment) : null,
    },
  }
}
