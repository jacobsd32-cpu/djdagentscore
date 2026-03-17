import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAddress } from 'viem'
import { getDefaultRuntimeNetwork, resolveRuntimeNetwork } from './evaluator-stack-runtime.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REGISTRY_PATH = join(__dirname, '..', 'data', 'evaluator-deployments.json')
const PROMOTION_BUNDLE_STANDARD = 'djd-evaluator-promotion-bundle-v1'

function readJsonFile(filePath, label) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error(`Missing ${label}`)
  }
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function validateDeploymentResultPayload(result) {
  if (!result || result.standard !== 'djd-evaluator-deploy-result-v1') {
    throw new Error('Invalid deployment result payload')
  }
  if (!result.network?.chain_id || !result.network?.chain_name) {
    throw new Error('Deployment result is missing network metadata')
  }
  if (!isAddress(result.contracts?.verifier?.address ?? '')) {
    throw new Error('Deployment result is missing verifier address')
  }
  if (!isAddress(result.contracts?.escrow?.address ?? '')) {
    throw new Error('Deployment result is missing escrow address')
  }
  return result
}

function maybeBuildDeploymentRegistryUrl(options = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? process.env.DJD_API_BASE_URL
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.trim().length === 0) {
    return null
  }

  const network = resolveRuntimeNetwork(options.network ?? process.env.DJD_NETWORK) ?? getDefaultRuntimeNetwork()
  const url = new URL('/v1/score/evaluator/deployments', apiBaseUrl)
  url.searchParams.set('network', network.key)
  return url.toString()
}

function maybeBuildPromotionBundleUrl(options = {}) {
  const configuredUrl = options.promotionUrl ?? process.env.DJD_PROMOTION_URL
  if (typeof configuredUrl === 'string' && configuredUrl.trim().length > 0) {
    return configuredUrl.trim()
  }

  const apiBaseUrl = options.apiBaseUrl ?? process.env.DJD_API_BASE_URL
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.trim().length === 0) {
    return null
  }

  const network = resolveRuntimeNetwork(options.network ?? process.env.DJD_NETWORK) ?? getDefaultRuntimeNetwork()
  const url = new URL('/v1/score/evaluator/promotion', apiBaseUrl)
  url.searchParams.set('network', network.key)
  return url.toString()
}

function normalizeRuntimeNetwork(options = {}) {
  return resolveRuntimeNetwork(options.network ?? process.env.DJD_NETWORK) ?? getDefaultRuntimeNetwork()
}

function findRawRegistryEntry(rawRegistry, runtimeNetwork) {
  if (!rawRegistry || rawRegistry.standard !== 'djd-evaluator-deployment-registry-v1') {
    throw new Error('Invalid deployment registry payload')
  }

  const direct = rawRegistry.deployments?.[runtimeNetwork.key]
  if (direct) {
    return direct
  }

  return (
    Object.values(rawRegistry.deployments ?? {}).find((entry) => {
      if (entry?.network?.key === runtimeNetwork.key) {
        return true
      }
      if (entry?.network?.chain_id === runtimeNetwork.chain_id) {
        return true
      }
      return false
    }) ?? null
  )
}

function findApiRegistryDeployment(registryView, runtimeNetwork) {
  if (!registryView || registryView.standard !== 'djd-evaluator-deployments-v1' || !Array.isArray(registryView.networks)) {
    throw new Error('Invalid deployment registry view payload')
  }

  const matchingNetwork = registryView.networks.find((entry) => entry?.key === runtimeNetwork.key)
  return matchingNetwork?.deployment ?? null
}

function normalizeDeploymentResultFromRegistryEntry(entry, runtimeNetwork, source) {
  if (!isAddress(entry?.contracts?.verifier?.address ?? '')) {
    throw new Error('Deployment registry entry is missing verifier address')
  }
  if (!isAddress(entry?.contracts?.escrow?.address ?? '')) {
    throw new Error('Deployment registry entry is missing escrow address')
  }
  if (!isAddress(entry?.verification?.oracle_signer ?? '')) {
    throw new Error('Deployment registry entry is missing oracle signer metadata')
  }

  return validateDeploymentResultPayload({
    standard: 'djd-evaluator-deploy-result-v1',
    network: {
      key: entry?.network?.key ?? runtimeNetwork.key,
      chain_id: entry?.network?.chain_id ?? runtimeNetwork.chain_id,
      chain_name: entry?.network?.chain_name ?? runtimeNetwork.chain_name,
      caip2: entry?.network?.caip2 ?? `eip155:${entry?.network?.chain_id ?? runtimeNetwork.chain_id}`,
      environment: entry?.network?.environment ?? runtimeNetwork.environment,
    },
    verdict_id: entry?.verdict_id ?? null,
    deployer: entry?.deployer ?? null,
    contracts: {
      verifier: {
        contract: entry?.contracts?.verifier?.contract ?? null,
        address: entry?.contracts?.verifier?.address ?? null,
        tx_hash: entry?.contracts?.verifier?.tx_hash ?? null,
        action: entry?.contracts?.verifier?.action ?? null,
      },
      escrow: {
        contract: entry?.contracts?.escrow?.contract ?? null,
        address: entry?.contracts?.escrow?.address ?? null,
        tx_hash: entry?.contracts?.escrow?.tx_hash ?? null,
        action: entry?.contracts?.escrow?.action ?? null,
      },
    },
    verification: {
      oracle_signer: entry?.verification?.oracle_signer ?? null,
      escrow_verifier: entry?.verification?.escrow_verifier ?? null,
      escrow_provider: entry?.verification?.escrow_provider ?? null,
      escrow_counterparty: entry?.verification?.escrow_counterparty ?? null,
      escrow_id_hash: entry?.verification?.escrow_id_hash ?? null,
    },
    inputs: {
      network_key: entry?.inputs?.network_key ?? runtimeNetwork.key,
      provider: entry?.inputs?.provider ?? null,
      counterparty: entry?.inputs?.counterparty ?? null,
      escrow_id: entry?.inputs?.escrow_id ?? null,
    },
    explorer: entry?.explorer ?? null,
    links: {
      verifier_package: entry?.links?.verifier_package ?? null,
      verifier_proof: entry?.links?.verifier_proof ?? null,
      escrow_settlement: entry?.links?.escrow_settlement ?? null,
      artifact_package: entry?.links?.artifact_package ?? null,
      bundle: entry?.links?.bundle ?? entry?.links?.deploy_bundle ?? null,
      deployment_registry: source.kind === 'api_registry' ? source.location : null,
    },
  })
}

function validatePromotionBundlePayload(bundle, runtimeNetwork) {
  if (!bundle || bundle.standard !== PROMOTION_BUNDLE_STANDARD) {
    throw new Error('Invalid promotion bundle payload')
  }
  if (bundle.ready !== true || !bundle.deployment || !bundle.network) {
    return null
  }

  const bundleNetworkKey = bundle.network?.key ?? null
  const bundleChainId = bundle.network?.chain_id ?? null
  if (bundleNetworkKey && bundleNetworkKey !== runtimeNetwork.key && bundleChainId !== runtimeNetwork.chain_id) {
    throw new Error(
      `Promotion bundle network mismatch: expected ${runtimeNetwork.key}, got ${bundleNetworkKey}`,
    )
  }

  return bundle
}

function normalizeDeploymentResultFromPromotionBundle(bundle, runtimeNetwork, source) {
  const deployment = bundle.deployment
  const artifactPackage =
    bundle.outputs?.variables?.DJD_ARTIFACT_PACKAGE_URL ??
    bundle.outputs?.generic?.DJD_ARTIFACT_PACKAGE_URL ??
    null

  return validateDeploymentResultPayload({
    standard: 'djd-evaluator-deploy-result-v1',
    network: {
      key: bundle.network?.key ?? deployment?.network?.key ?? runtimeNetwork.key,
      chain_id: bundle.network?.chain_id ?? deployment?.network?.chain_id ?? runtimeNetwork.chain_id,
      chain_name: bundle.network?.chain_name ?? deployment?.network?.chain_name ?? runtimeNetwork.chain_name,
      caip2:
        bundle.network?.caip2 ??
        deployment?.network?.caip2 ??
        `eip155:${bundle.network?.chain_id ?? deployment?.network?.chain_id ?? runtimeNetwork.chain_id}`,
      environment:
        bundle.network?.environment ?? deployment?.network?.environment ?? runtimeNetwork.environment,
    },
    verdict_id: deployment?.verdict_id ?? null,
    deployer: deployment?.deployer ?? null,
    contracts: {
      verifier: {
        contract: deployment?.contracts?.verifier?.contract ?? null,
        address: deployment?.contracts?.verifier?.address ?? null,
        tx_hash: deployment?.contracts?.verifier?.tx_hash ?? null,
        action: deployment?.contracts?.verifier?.action ?? null,
      },
      escrow: {
        contract: deployment?.contracts?.escrow?.contract ?? null,
        address: deployment?.contracts?.escrow?.address ?? null,
        tx_hash: deployment?.contracts?.escrow?.tx_hash ?? null,
        action: deployment?.contracts?.escrow?.action ?? null,
      },
    },
    verification: {
      oracle_signer: deployment?.verification?.oracle_signer ?? null,
      escrow_verifier: deployment?.verification?.escrow_verifier ?? deployment?.contracts?.verifier?.address ?? null,
      escrow_provider: deployment?.verification?.escrow_provider ?? null,
      escrow_counterparty: deployment?.verification?.escrow_counterparty ?? null,
      escrow_id_hash: deployment?.verification?.escrow_id_hash ?? null,
    },
    inputs: {
      network_key: bundle.network?.key ?? runtimeNetwork.key,
      provider: deployment?.inputs?.provider ?? null,
      counterparty: deployment?.inputs?.counterparty ?? null,
      escrow_id: deployment?.inputs?.escrow_id ?? null,
    },
    explorer: deployment?.explorer ?? null,
    links: {
      verifier_package: deployment?.links?.verifier_package ?? null,
      verifier_proof: deployment?.links?.verifier_proof ?? null,
      escrow_settlement: deployment?.links?.escrow_settlement ?? null,
      artifact_package: artifactPackage,
      bundle: deployment?.links?.deploy_bundle ?? null,
      deployment_registry: deployment?.links?.deployment_registry ?? source.location ?? null,
    },
  })
}

async function resolveDeploymentResultFromRegistryPath(registryPath, runtimeNetwork) {
  if (!existsSync(registryPath)) {
    return null
  }

  const rawRegistry = readJsonFile(registryPath, 'DJD_EVALUATOR_DEPLOYMENTS_PATH')
  const entry = findRawRegistryEntry(rawRegistry, runtimeNetwork)
  if (!entry) {
    return null
  }

  return {
    deploymentResult: normalizeDeploymentResultFromRegistryEntry(entry, runtimeNetwork, {
      kind: 'registry_file',
      location: registryPath,
    }),
    source: {
      kind: 'registry_file',
      location: registryPath,
      network: runtimeNetwork.key,
    },
  }
}

async function fetchJson(url, requestInit, label) {
  const response = await fetch(url, requestInit)
  if (!response.ok) {
    throw new Error(`${label} request failed: ${response.status} ${response.statusText}`)
  }
  return await response.json()
}

async function resolveDeploymentResultFromRegistryUrl(registryUrl, runtimeNetwork, options = {}) {
  const registryView = await fetchJson(
    registryUrl,
    { headers: options.requestHeaders ?? {} },
    'Deployment registry',
  )
  const deployment = findApiRegistryDeployment(registryView, runtimeNetwork)
  if (!deployment) {
    return null
  }

  return {
    deploymentResult: normalizeDeploymentResultFromRegistryEntry(deployment, runtimeNetwork, {
      kind: 'api_registry',
      location: registryUrl,
    }),
    source: {
      kind: 'api_registry',
      location: registryUrl,
      network: runtimeNetwork.key,
    },
  }
}

async function resolveDeploymentResultFromPromotionBundle(bundle, runtimeNetwork, source) {
  const validatedBundle = validatePromotionBundlePayload(bundle, runtimeNetwork)
  if (!validatedBundle) {
    return null
  }

  return {
    deploymentResult: normalizeDeploymentResultFromPromotionBundle(validatedBundle, runtimeNetwork, source),
    source,
  }
}

async function resolveDeploymentResultFromPromotionUrl(promotionUrl, runtimeNetwork, options = {}) {
  const bundle = await fetchJson(
    promotionUrl,
    { headers: options.requestHeaders ?? {} },
    'Promotion bundle',
  )

  return await resolveDeploymentResultFromPromotionBundle(bundle, runtimeNetwork, {
    kind: 'api_promotion_bundle',
    location: promotionUrl,
    network: runtimeNetwork.key,
  })
}

export async function resolveEvaluatorStackDeploymentResult(options = {}) {
  if (options.deploymentResult) {
    return {
      deploymentResult: validateDeploymentResultPayload(options.deploymentResult),
      source: {
        kind: 'deployment_result',
        location: 'inline',
        network: options.deploymentResult?.network?.key ?? null,
      },
    }
  }

  const deploymentResultPath = options.deploymentResultPath ?? process.env.DJD_DEPLOY_RESULT_PATH
  if (typeof deploymentResultPath === 'string' && deploymentResultPath.trim().length > 0) {
    return {
      deploymentResult: validateDeploymentResultPayload(
        readJsonFile(deploymentResultPath, 'DJD_DEPLOY_RESULT_PATH'),
      ),
      source: {
        kind: 'deployment_result_file',
        location: deploymentResultPath,
        network: null,
      },
    }
  }

  const runtimeNetwork = normalizeRuntimeNetwork(options)

  if (options.promotionBundle) {
    const resolved = await resolveDeploymentResultFromPromotionBundle(options.promotionBundle, runtimeNetwork, {
      kind: 'inline_promotion_bundle',
      location: 'inline',
      network: runtimeNetwork.key,
    })
    if (resolved) {
      return resolved
    }
  }

  const configuredRegistryPath = options.registryPath ?? process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH
  const pathsToTry = []
  if (typeof configuredRegistryPath === 'string' && configuredRegistryPath.trim().length > 0) {
    pathsToTry.push(configuredRegistryPath.trim())
  }
  if (!pathsToTry.includes(DEFAULT_REGISTRY_PATH)) {
    pathsToTry.push(DEFAULT_REGISTRY_PATH)
  }

  for (const registryPath of pathsToTry) {
    const resolved = await resolveDeploymentResultFromRegistryPath(registryPath, runtimeNetwork)
    if (resolved) {
      return resolved
    }
  }

  const promotionUrl = maybeBuildPromotionBundleUrl(options)
  if (typeof promotionUrl === 'string' && promotionUrl.trim().length > 0) {
    try {
      const resolved = await resolveDeploymentResultFromPromotionUrl(promotionUrl.trim(), runtimeNetwork, options)
      if (resolved) {
        return resolved
      }
    } catch {
      // Fall through to the older deployment registry resolution path.
    }
  }

  const registryUrl =
    options.deploymentsUrl ??
    process.env.DJD_DEPLOYMENTS_URL ??
    maybeBuildDeploymentRegistryUrl(options)
  if (typeof registryUrl === 'string' && registryUrl.trim().length > 0) {
    const resolved = await resolveDeploymentResultFromRegistryUrl(registryUrl.trim(), runtimeNetwork, options)
    if (resolved) {
      return resolved
    }
  }

  throw new Error(
    `Unable to resolve deployment result for network=${runtimeNetwork.key}. Provide DJD_DEPLOY_RESULT_PATH or publish a deployment registry entry.`,
  )
}

export { validateDeploymentResultPayload }
