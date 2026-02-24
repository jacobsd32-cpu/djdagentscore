import { createPublicClient, http, fallback, parseAbiItem, namehash } from 'viem'
import { base } from 'viem/chains'
import type { WalletUSDCData } from './types.js'

// ---------- Client (lazy singleton) ----------

const BASE_RPC_URL = process.env.BASE_RPC_URL ?? 'https://base-mainnet.public.blastapi.io'
const BASE_RPC_FALLBACK_URL = process.env.BASE_RPC_FALLBACK_URL ?? 'https://mainnet.base.org'

// Lazy-initialised so that importing this module for pure helpers
// (usdcToFloat, clamp, etc.) doesn't trigger an RPC connection.
// The client is created on first call to getPublicClient().
type Client = ReturnType<typeof createPublicClient>
let _publicClient: Client | null = null

export function getPublicClient(): Client {
  if (!_publicClient) {
    // Use viem's built-in `fallback` transport for automatic failover.
    // Primary RPC is tried first; on failure, requests transparently fall back
    // to the secondary. Each transport has its own retry/timeout config.
    // viem's fallback transport includes a built-in circuit breaker: after
    // `retryCount` consecutive failures on a transport it is skipped for
    // subsequent requests until the next ranking interval (default 10s).
    // @ts-expect-error — Base chain PublicClient includes OP Stack deposit tx types not present in generic ReturnType
    _publicClient = createPublicClient({
      chain: base,
      transport: fallback([
        http(BASE_RPC_URL, {
          timeout: 30_000,
          retryCount: 2,
          retryDelay: 1_500,
        }),
        http(BASE_RPC_FALLBACK_URL, {
          timeout: 30_000,
          retryCount: 2,
          retryDelay: 2_000,
        }),
      ], {
        // Re-rank transports every 15 seconds based on latency
        rank: { interval: 15_000, sampleCount: 5, timeout: 3_000, weights: { latency: 0.4, stability: 0.6 } },
      }),
    })
  }
  // @ts-expect-error — dual viem type copies (direct + x402-hono transitive) create nominal mismatch
  return _publicClient
}

// ---------- Constants ----------

export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// ERC-8004 is a hypothetical agent registry — update this when/if deployed
const ERC8004_REGISTRY = '0x0000000000000000000000000000000000000000' as const

// Basenames — ENS infrastructure deployed on Base mainnet
const BASE_ENS_REGISTRY = '0xb94704422c2a1e396835a571837aa5ae53285a95' as const

const ENS_REGISTRY_ABI = [
  parseAbiItem('function resolver(bytes32 node) view returns (address)'),
] as const

const ENS_RESOLVER_NAME_ABI = [
  parseAbiItem('function name(bytes32 node) view returns (string)'),
] as const

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

const BALANCE_OF_ABI = [parseAbiItem('function balanceOf(address) view returns (uint256)')] as const

const ERC8004_ABI = [
  parseAbiItem('function isRegistered(address) view returns (bool)'),
] as const

// Base produces ~1 block every 2 seconds → ~43,200 blocks/day
const BLOCKS_PER_DAY = 43_200n
const LOG_CHUNK_SIZE = 10_000n
const LOG_PARALLEL_BATCH = 5

// ---------- Helpers ----------

function clamp<T extends bigint>(val: T, min: T, max: T): T {
  if (val < min) return min
  if (val > max) return max
  return val
}

function buildChunks(fromBlock: bigint, toBlock: bigint): Array<[bigint, bigint]> {
  const chunks: Array<[bigint, bigint]> = []
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = start + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : start + LOG_CHUNK_SIZE - 1n
    chunks.push([start, end])
  }
  return chunks
}

interface TransferStats {
  total: bigint
  last7d: bigint
  last30d: bigint
  count: number
  firstBlock: bigint | null
  lastBlock: bigint | null
}

/**
 * Stream-aggregate USDC transfer stats for a wallet over `chunks`.
 * Never stores raw log entries in memory — O(1) memory regardless of transfer count.
 */
async function processLogBatch(
  chunks: Array<[bigint, bigint]>,
  direction: 'in' | 'out',
  wallet: `0x${string}`,
  block7dAgo: bigint,
  block30dAgo: bigint,
): Promise<TransferStats> {
  const stats: TransferStats = { total: 0n, last7d: 0n, last30d: 0n, count: 0, firstBlock: null, lastBlock: null }

  for (let i = 0; i < chunks.length; i += LOG_PARALLEL_BATCH) {
    const batch = chunks.slice(i, i + LOG_PARALLEL_BATCH)
    const batchLogs = await Promise.all(
      batch.map(([from, to]) => {
        if (direction === 'in') {
          return getPublicClient().getLogs({
            address: USDC_ADDRESS,
            event: TRANSFER_EVENT,
            args: { to: wallet },
            fromBlock: from,
            toBlock: to,
          })
        } else {
          return getPublicClient().getLogs({
            address: USDC_ADDRESS,
            event: TRANSFER_EVENT,
            args: { from: wallet },
            fromBlock: from,
            toBlock: to,
          })
        }
      }),
    )
    for (const logs of batchLogs) {
      for (const log of logs) {
        if (log.args.value === undefined || log.blockNumber === null) continue
        const v = log.args.value
        const b = log.blockNumber
        stats.total += v
        stats.count++
        if (b >= block7dAgo) stats.last7d += v
        if (b >= block30dAgo) stats.last30d += v
        if (stats.firstBlock === null || b < stats.firstBlock) stats.firstBlock = b
        if (stats.lastBlock === null || b > stats.lastBlock) stats.lastBlock = b
      }
    }
  }

  return stats
}

// ---------- Public API ----------

export async function getUSDCBalance(wallet: `0x${string}`): Promise<bigint> {
  const balance = await getPublicClient().readContract({
    address: USDC_ADDRESS,
    abi: BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [wallet],
  })
  return balance as bigint
}

/**
 * Fetch USDC transfer data for a wallet over the past `windowDays` days.
 * Queries run in parallel for inflows and outflows.
 */
export async function getWalletUSDCData(
  wallet: `0x${string}`,
  windowDays = 14,
): Promise<WalletUSDCData> {
  const currentBlock = await getPublicClient().getBlockNumber()
  const fromBlock = clamp(
    currentBlock - BLOCKS_PER_DAY * BigInt(windowDays),
    0n,
    currentBlock,
  )

  const block7dAgo = currentBlock - BLOCKS_PER_DAY * 7n
  const block30dAgo = currentBlock - BLOCKS_PER_DAY * 30n

  const chunks = buildChunks(fromBlock, currentBlock)
  const [balance, inStats, outStats] = await Promise.all([
    getUSDCBalance(wallet),
    processLogBatch(chunks, 'in', wallet, block7dAgo, block30dAgo),
    processLogBatch(chunks, 'out', wallet, block7dAgo, block30dAgo),
  ])

  // firstBlockSeen / lastBlockSeen across both directions
  const allFirstBlocks = [inStats.firstBlock, outStats.firstBlock].filter((b): b is bigint => b !== null)
  const allLastBlocks = [inStats.lastBlock, outStats.lastBlock].filter((b): b is bigint => b !== null)
  const firstBlockSeen = allFirstBlocks.length ? allFirstBlocks.reduce((a, b) => (a < b ? a : b)) : null
  const lastBlockSeen = allLastBlocks.length ? allLastBlocks.reduce((a, b) => (a > b ? a : b)) : null

  return {
    balance,
    inflows30d: inStats.last30d,
    outflows30d: outStats.last30d,
    inflows7d: inStats.last7d,
    outflows7d: outStats.last7d,
    totalInflows: inStats.total,
    totalOutflows: outStats.total,
    transferCount: inStats.count + outStats.count,
    firstBlockSeen,
    lastBlockSeen,
  }
}

/**
 * Estimate wallet age in days based on first USDC Transfer found.
 * Returns null when no transaction history is available.
 */
export async function estimateWalletAgeDays(
  wallet: `0x${string}`,
  currentBlock: bigint,
  firstBlockSeen: bigint | null,
): Promise<number | null> {
  if (firstBlockSeen === null) return null
  const ageDays = Number((currentBlock - firstBlockSeen) / BLOCKS_PER_DAY)
  return Math.max(0, ageDays)
}

/**
 * Check if a wallet is registered in the ERC-8004 agent registry.
 * Returns false if the registry contract is not deployed or the call fails.
 */
export async function checkERC8004Registration(wallet: `0x${string}`): Promise<boolean> {
  if (ERC8004_REGISTRY === '0x0000000000000000000000000000000000000000') {
    return false
  }
  try {
    const result = await getPublicClient().readContract({
      address: ERC8004_REGISTRY,
      abi: ERC8004_ABI,
      functionName: 'isRegistered',
      args: [wallet],
    })
    return result as boolean
  } catch {
    return false
  }
}

/**
 * Returns the latest block number, used for block-to-time conversions.
 */
export async function getCurrentBlock(): Promise<bigint> {
  return getPublicClient().getBlockNumber()
}

/** Convert raw USDC units (6 decimals) to a USD dollar string, e.g. "12.50" */
export function usdcToUsd(raw: bigint): string {
  const whole = raw / 1_000_000n
  const frac = raw % 1_000_000n
  return `${whole}.${frac.toString().padStart(6, '0').slice(0, 2)}`
}

/** Convert raw USDC units to a float */
export function usdcToFloat(raw: bigint): number {
  return Number(raw) / 1_000_000
}

/**
 * Returns the total number of transactions sent FROM a wallet (the nonce).
 * A high nonce indicates a well-used, long-running wallet.
 */
export async function getTransactionCount(wallet: `0x${string}`): Promise<number> {
  return getPublicClient().getTransactionCount({ address: wallet })
}

/**
 * Returns the ETH balance of a wallet in wei.
 * Holding ETH for gas indicates an actively operated wallet.
 */
export async function getETHBalance(wallet: `0x${string}`): Promise<bigint> {
  return getPublicClient().getBalance({ address: wallet })
}

/**
 * Returns true if the wallet has a Basename (*.base.eth) via reverse resolution.
 * Uses the ENS registry deployed on Base mainnet.
 */
export async function hasBasename(wallet: `0x${string}`): Promise<boolean> {
  try {
    const addrHex = wallet.slice(2).toLowerCase()
    const node = namehash(`${addrHex}.addr.reverse`)

    const resolverAddr = await getPublicClient().readContract({
      address: BASE_ENS_REGISTRY,
      abi: ENS_REGISTRY_ABI,
      functionName: 'resolver',
      args: [node],
    }) as `0x${string}`

    if (resolverAddr === '0x0000000000000000000000000000000000000000') return false

    const name = await getPublicClient().readContract({
      address: resolverAddr,
      abi: ENS_RESOLVER_NAME_ABI,
      functionName: 'name',
      args: [node],
    }) as string

    return typeof name === 'string' && name.length > 0
  } catch {
    return false
  }
}
