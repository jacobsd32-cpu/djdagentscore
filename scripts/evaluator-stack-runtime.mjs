import { base, baseSepolia } from 'viem/chains'

const NETWORKS = {
  base: {
    key: 'base',
    chain_id: base.id,
    chain_name: base.name,
    environment: 'mainnet',
    rpc_env_var: 'DJD_BASE_RPC_URL',
    chain: base,
  },
  'base-sepolia': {
    key: 'base-sepolia',
    chain_id: baseSepolia.id,
    chain_name: baseSepolia.name,
    environment: 'testnet',
    rpc_env_var: 'DJD_BASE_SEPOLIA_RPC_URL',
    chain: baseSepolia,
  },
}

const NETWORK_ALIASES = {
  base: 'base',
  'base-mainnet': 'base',
  '8453': 'base',
  'eip155:8453': 'base',
  'base-sepolia': 'base-sepolia',
  base_sepolia: 'base-sepolia',
  '84532': 'base-sepolia',
  'eip155:84532': 'base-sepolia',
}

export function getDefaultRuntimeNetwork() {
  return NETWORKS.base
}

export function listRuntimeNetworks() {
  return Object.values(NETWORKS)
}

export function resolveRuntimeNetwork(rawNetwork) {
  if (rawNetwork === undefined || rawNetwork === null || String(rawNetwork).trim() === '') {
    return getDefaultRuntimeNetwork()
  }

  const normalized = String(rawNetwork).trim().toLowerCase()
  const key = NETWORK_ALIASES[normalized]
  return key ? NETWORKS[key] : null
}

export function resolveRuntimeNetworkFromMetadata(metadata) {
  if (metadata?.key && resolveRuntimeNetwork(metadata.key)) {
    return resolveRuntimeNetwork(metadata.key)
  }

  if (metadata?.chain_id === NETWORKS['base-sepolia'].chain_id) {
    return NETWORKS['base-sepolia']
  }

  if (metadata?.chain_id === NETWORKS.base.chain_id) {
    return NETWORKS.base
  }

  return getDefaultRuntimeNetwork()
}

export function buildRuntimeChain(metadata, rpcUrl) {
  const network = resolveRuntimeNetworkFromMetadata(metadata)
  return {
    ...network.chain,
    id: metadata?.chain_id ?? network.chain_id,
    name: metadata?.chain_name ?? network.chain_name,
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  }
}

export function resolveRpcUrl(options = {}) {
  const runtimeNetwork =
    typeof options.network === 'string'
      ? resolveRuntimeNetwork(options.network)
      : options.network
        ? resolveRuntimeNetworkFromMetadata(options.network)
        : resolveRuntimeNetwork(options.networkKey ?? process.env.DJD_NETWORK)
  const network = runtimeNetwork ?? getDefaultRuntimeNetwork()
  const explicitRpcUrl = options.rpcUrl ?? process.env.DJD_RPC_URL
  if (typeof explicitRpcUrl === 'string' && explicitRpcUrl.trim().length > 0) {
    return {
      ok: true,
      rpcUrl: explicitRpcUrl.trim(),
      source: options.rpcUrl ? 'rpcUrl' : 'DJD_RPC_URL',
      network,
      expected_envs: ['DJD_RPC_URL'],
    }
  }

  const envVar = network.rpc_env_var
  const networkRpcUrl = process.env[envVar]
  if (typeof networkRpcUrl === 'string' && networkRpcUrl.trim().length > 0) {
    return {
      ok: true,
      rpcUrl: networkRpcUrl.trim(),
      source: envVar,
      network,
      expected_envs: ['DJD_RPC_URL', envVar],
    }
  }

  return {
    ok: false,
    rpcUrl: null,
    source: null,
    network,
    expected_envs: ['DJD_RPC_URL', envVar],
  }
}

export function detectBundleSource(options = {}) {
  if (options.bundle) {
    return {
      ready: true,
      source: 'bundle',
      details: null,
    }
  }

  const bundlePath = options.bundlePath ?? process.env.DJD_DEPLOY_BUNDLE_PATH
  if (typeof bundlePath === 'string' && bundlePath.trim().length > 0) {
    return {
      ready: true,
      source: 'DJD_DEPLOY_BUNDLE_PATH',
      details: bundlePath.trim(),
    }
  }

  const bundleUrl = options.bundleUrl ?? process.env.DJD_DEPLOY_BUNDLE_URL
  if (typeof bundleUrl === 'string' && bundleUrl.trim().length > 0) {
    return {
      ready: true,
      source: 'DJD_DEPLOY_BUNDLE_URL',
      details: bundleUrl.trim(),
    }
  }

  const apiBaseUrl = options.apiBaseUrl ?? process.env.DJD_API_BASE_URL
  const verdictId = options.verdictId ?? process.env.DJD_VERDICT_ID
  if (
    typeof apiBaseUrl === 'string' &&
    apiBaseUrl.trim().length > 0 &&
    typeof verdictId === 'string' &&
    verdictId.trim().length > 0
  ) {
    return {
      ready: true,
      source: 'DJD_API_BASE_URL + DJD_VERDICT_ID',
      details: {
        api_base_url: apiBaseUrl.trim(),
        verdict_id: verdictId.trim(),
      },
    }
  }

  return {
    ready: false,
    source: null,
    details: null,
  }
}

export function isValidPrivateKey(value) {
  return /^0x[a-fA-F0-9]{64}$/.test(value ?? '')
}

export function detectDeployerKeySource(options = {}) {
  if (isValidPrivateKey(options.deployerPrivateKey)) {
    return {
      ready: true,
      source: 'deployerPrivateKey',
    }
  }

  if (isValidPrivateKey(process.env.DJD_DEPLOYER_PRIVATE_KEY)) {
    return {
      ready: true,
      source: 'DJD_DEPLOYER_PRIVATE_KEY',
    }
  }

  return {
    ready: false,
    source: null,
  }
}
