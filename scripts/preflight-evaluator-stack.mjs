import { pathToFileURL } from 'node:url'
import { createPublicClient, http } from 'viem'
import { resolveDeploymentBundle } from './deploy-evaluator-stack.mjs'
import {
  buildRuntimeChain,
  detectBundleSource,
  detectDeployerKeySource,
  getDefaultRuntimeNetwork,
  listRuntimeNetworks,
  resolveRpcUrl,
  resolveRuntimeNetwork,
  resolveRuntimeNetworkFromMetadata,
} from './evaluator-stack-runtime.mjs'

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function normalizeRuntimeMode(value) {
  const mode = String(value ?? 'combined')
    .trim()
    .toLowerCase()
  if (['combined', 'api', 'worker'].includes(mode)) {
    return mode
  }
  return 'combined'
}

function normalizeReleaseSha(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    }
  }

  return {
    message: String(error),
    name: 'Error',
  }
}

function summarizeBundleGuidance() {
  return 'Provide bundle, DJD_DEPLOY_BUNDLE_PATH, DJD_DEPLOY_BUNDLE_URL, or DJD_API_BASE_URL + DJD_VERDICT_ID'
}

function sanitizeUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  try {
    const url = new URL(value)
    if (url.username) url.username = '***'
    if (url.password) url.password = '***'
    if (url.search) url.search = '?...'
    return url.toString()
  } catch {
    return value
  }
}

function escapeDotenvValue(value) {
  const normalized = String(value ?? '')
  if (/^[A-Za-z0-9_./:-]*$/.test(normalized)) {
    return normalized
  }
  return `"${normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

function escapeShellValue(value) {
  return `'${String(value ?? '').replace(/'/g, `'\"'\"'`)}'`
}

function formatKeyValueLines(variables, formatter) {
  return Object.entries(variables)
    .map(([key, value]) => formatter(key, value))
    .join('\n')
}

function buildRecommendedEnv(network) {
  return {
    DJD_NETWORK: network.key,
    [network.rpc_env_var]: '',
    DJD_DEPLOYER_PRIVATE_KEY: '',
    DJD_API_BASE_URL: '',
    DJD_VERDICT_ID: '',
  }
}

function buildPreflightGuidance(report, network) {
  const recommendedEnv = buildRecommendedEnv(network)
  const missing = {
    bundle: report.bundle.ready
      ? null
      : {
          recommended_envs: ['DJD_API_BASE_URL', 'DJD_VERDICT_ID'],
          accepted_sources: [
            'DJD_API_BASE_URL + DJD_VERDICT_ID',
            'DJD_DEPLOY_BUNDLE_URL',
            'DJD_DEPLOY_BUNDLE_PATH',
          ],
        },
    rpc:
      report.rpc.ready && report.rpc.reachable && report.rpc.chain_id_matches_expected === true
        ? null
        : {
            expected_envs: report.rpc.expected_envs,
          },
    deployer: report.deployer.ready
      ? null
      : {
          expected_envs: ['DJD_DEPLOYER_PRIVATE_KEY'],
        },
  }

  return {
    ready: report.ok,
    missing,
    recommended_env: recommendedEnv,
    dotenv: `${formatKeyValueLines(recommendedEnv, (key, value) => `${key}=${escapeDotenvValue(value)}`)}\n`,
    shell: `${formatKeyValueLines(recommendedEnv, (key, value) => `export ${key}=${escapeShellValue(value)}`)}\n`,
    notes: [
      'Fill the recommended env values in .env or your shell before running contracts:preflight.',
      'Bundle can come from DJD_API_BASE_URL + DJD_VERDICT_ID, DJD_DEPLOY_BUNDLE_URL, or DJD_DEPLOY_BUNDLE_PATH.',
    ],
  }
}

function buildNetworkSummary(metadata, runtimeNetwork) {
  return {
    key: metadata?.key ?? runtimeNetwork.key,
    chain_id: metadata?.chain_id ?? runtimeNetwork.chain_id,
    chain_name: metadata?.chain_name ?? runtimeNetwork.chain_name,
    environment: metadata?.environment ?? runtimeNetwork.environment,
    rpc_env_var: runtimeNetwork.rpc_env_var,
  }
}

async function resolveBundleForPreflight(options = {}) {
  const source = detectBundleSource(options)

  if (!source.ready) {
    return {
      ready: false,
      validated: false,
      source: null,
      details: null,
      bundle: null,
      error: {
        message: summarizeBundleGuidance(),
        name: 'BundleSourceError',
      },
    }
  }

  try {
    const bundle = await resolveDeploymentBundle(options)
    return {
      ready: true,
      validated: true,
      source: source.source,
      details: source.details,
      bundle,
      error: null,
    }
  } catch (error) {
    return {
      ready: false,
      validated: false,
      source: source.source,
      details: source.details,
      bundle: null,
      error: serializeError(error),
    }
  }
}

export async function runEvaluatorStackPreflight(options = {}) {
  const runHealth = normalizeBoolean(
    options.runHealth ?? process.env.DJD_STAGE_RUN_HEALTH,
    Boolean(options.health ?? options.healthUrl ?? process.env.DJD_HEALTHCHECK_URL),
  )
  const bundleResolution = await resolveBundleForPreflight(options)
  const bundleNetworkMetadata = bundleResolution.bundle?.network ?? null
  const runtimeNetwork =
    (bundleNetworkMetadata
      ? resolveRuntimeNetworkFromMetadata(bundleNetworkMetadata)
      : resolveRuntimeNetwork(options.network ?? process.env.DJD_NETWORK)) ?? getDefaultRuntimeNetwork()
  const network = buildNetworkSummary(bundleNetworkMetadata, runtimeNetwork)
  const rpcResolution = resolveRpcUrl({
    rpcUrl: options.rpcUrl,
    network: bundleNetworkMetadata ?? runtimeNetwork,
    networkKey: options.network ?? process.env.DJD_NETWORK,
  })
  const deployer = detectDeployerKeySource(options)
  const healthOptions =
    typeof options.health === 'object' && options.health !== null && !Array.isArray(options.health) ? options.health : {}

  const report = {
    standard: 'djd-evaluator-preflight-v1',
    ok: false,
    network,
    available_networks: listRuntimeNetworks().map((entry) => ({
      key: entry.key,
      chain_id: entry.chain_id,
      chain_name: entry.chain_name,
      environment: entry.environment,
      rpc_env_var: entry.rpc_env_var,
    })),
    bundle: {
      ready: bundleResolution.ready,
      validated: bundleResolution.validated,
      source: bundleResolution.source,
      details: bundleResolution.details,
      verdict_id: bundleResolution.bundle?.verdict_id ?? null,
      network: bundleResolution.bundle?.network ?? null,
      artifact_package_available: bundleResolution.bundle?.artifacts?.available ?? false,
      error: bundleResolution.error,
    },
    rpc: {
      ready: rpcResolution.ok,
      source: rpcResolution.source,
      expected_envs: rpcResolution.expected_envs,
      display_url: rpcResolution.ok ? sanitizeUrl(rpcResolution.rpcUrl) : null,
      reachable: false,
      chain_id: null,
      chain_id_matches_expected: null,
      error: null,
    },
    deployer: {
      ready: deployer.ready,
      source: deployer.source,
    },
    health: {
      run: runHealth,
      ready: true,
      health_url:
        healthOptions.healthUrl ??
        options.healthUrl ??
        process.env.DJD_HEALTHCHECK_URL ??
        'https://djdagentscore.dev/health',
      admin_key_present: typeof (healthOptions.adminKey ?? process.env.DJD_ADMIN_KEY) === 'string' &&
        String(healthOptions.adminKey ?? process.env.DJD_ADMIN_KEY).trim().length > 0,
      expected_runtime_mode: normalizeRuntimeMode(
        healthOptions.expectedRuntimeMode ?? options.expectedRuntimeMode ?? process.env.DJD_EXPECT_RUNTIME_MODE,
      ),
      expected_release_sha: normalizeReleaseSha(
        healthOptions.expectedReleaseSha ?? options.expectedReleaseSha ?? process.env.DJD_EXPECT_RELEASE_SHA,
      ),
    },
    guidance: null,
  }

  if (!rpcResolution.ok) {
    report.rpc.error = {
      message: `Missing rpcUrl. Set ${rpcResolution.expected_envs.join(' or ')}`,
      name: 'RpcConfigError',
    }
  } else {
    try {
      const publicClient = createPublicClient({
        chain: buildRuntimeChain(network, rpcResolution.rpcUrl),
        transport: http(rpcResolution.rpcUrl),
      })
      const actualChainId = await publicClient.getChainId()
      report.rpc.reachable = true
      report.rpc.chain_id = actualChainId
      report.rpc.chain_id_matches_expected = actualChainId === network.chain_id

      if (report.rpc.chain_id_matches_expected !== true) {
        report.rpc.error = {
          message: `RPC chain mismatch: expected ${network.chain_id}, got ${actualChainId}`,
          name: 'RpcChainMismatchError',
        }
      }
    } catch (error) {
      report.rpc.error = serializeError(error)
    }
  }

  report.ok = Boolean(
    report.bundle.ready &&
      report.bundle.validated &&
      report.rpc.ready &&
      report.rpc.reachable &&
      report.rpc.chain_id_matches_expected === true &&
      report.deployer.ready,
  )
  report.guidance = buildPreflightGuidance(report, network)

  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEvaluatorStackPreflight()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
      if (!report.ok) {
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error(`[contracts:preflight] FAILED: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
}
