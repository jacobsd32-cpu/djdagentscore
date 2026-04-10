import type { Chain } from 'viem'
import { base, baseSepolia } from 'viem/chains'

export type EvaluatorNetworkKey = 'base' | 'base-sepolia'

export interface EvaluatorNetworkConfig {
  key: EvaluatorNetworkKey
  chainId: number
  chainName: string
  caip2: string
  environment: 'mainnet' | 'testnet'
  viemChain: Chain
  explorer: {
    name: 'BaseScan'
    baseUrl: string
  }
  rpcEnvVar: string
}

const EVALUATOR_NETWORKS: Record<EvaluatorNetworkKey, EvaluatorNetworkConfig> = {
  base: {
    key: 'base',
    chainId: base.id,
    chainName: base.name,
    caip2: `eip155:${base.id}`,
    environment: 'mainnet',
    viemChain: base,
    explorer: {
      name: 'BaseScan',
      baseUrl: 'https://basescan.org',
    },
    rpcEnvVar: 'DJD_BASE_RPC_URL',
  },
  'base-sepolia': {
    key: 'base-sepolia',
    chainId: baseSepolia.id,
    chainName: baseSepolia.name,
    caip2: `eip155:${baseSepolia.id}`,
    environment: 'testnet',
    viemChain: baseSepolia,
    explorer: {
      name: 'BaseScan',
      baseUrl: 'https://sepolia.basescan.org',
    },
    rpcEnvVar: 'DJD_BASE_SEPOLIA_RPC_URL',
  },
}

const NETWORK_ALIASES: Record<string, EvaluatorNetworkKey> = {
  base: 'base',
  'base-mainnet': 'base',
  'eip155:8453': 'base',
  '8453': 'base',
  'base-sepolia': 'base-sepolia',
  base_sepolia: 'base-sepolia',
  'eip155:84532': 'base-sepolia',
  '84532': 'base-sepolia',
}

export function getDefaultEvaluatorNetwork(): EvaluatorNetworkConfig {
  return EVALUATOR_NETWORKS.base
}

export function listEvaluatorNetworks(): EvaluatorNetworkConfig[] {
  return Object.values(EVALUATOR_NETWORKS)
}

export function getEvaluatorNetworkByKey(key: EvaluatorNetworkKey): EvaluatorNetworkConfig {
  return EVALUATOR_NETWORKS[key]
}

export function findEvaluatorNetworkByChainId(chainId: number | undefined | null): EvaluatorNetworkConfig | null {
  if (typeof chainId !== 'number' || !Number.isFinite(chainId)) {
    return null
  }

  return listEvaluatorNetworks().find((network) => network.chainId === chainId) ?? null
}

export function resolveEvaluatorNetwork(rawNetwork: string | undefined): EvaluatorNetworkConfig | null {
  if (rawNetwork === undefined || rawNetwork.trim() === '') {
    return getDefaultEvaluatorNetwork()
  }

  return NETWORK_ALIASES[rawNetwork.trim().toLowerCase()]
    ? EVALUATOR_NETWORKS[NETWORK_ALIASES[rawNetwork.trim().toLowerCase()]]
    : null
}

export function getEvaluatorVerdictChainId(attestation: {
  typed_data?: {
    domain?: {
      chainId?: number
    }
  }
}): number {
  return attestation.typed_data?.domain?.chainId ?? getDefaultEvaluatorNetwork().chainId
}
