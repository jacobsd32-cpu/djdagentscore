import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import type { TransferLog, WalletUSDCData } from './types.js'

// ---------- Client ----------

export const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org', {
    timeout: 30_000,
    retryCount: 3,
    retryDelay: 1_000,
  }),
})

// ---------- Constants ----------

export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// ERC-8004 is a hypothetical agent registry — update this when/if deployed
const ERC8004_REGISTRY = '0x0000000000000000000000000000000000000000' as const

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

async function processLogBatch(
  chunks: Array<[bigint, bigint]>,
  direction: 'in' | 'out',
  wallet: `0x${string}`,
): Promise<TransferLog[]> {
  const results: TransferLog[] = []

  for (let i = 0; i < chunks.length; i += LOG_PARALLEL_BATCH) {
    const batch = chunks.slice(i, i + LOG_PARALLEL_BATCH)
    const batchLogs = await Promise.all(
      batch.map(([from, to]) => {
        if (direction === 'in') {
          return publicClient.getLogs({
            address: USDC_ADDRESS,
            event: TRANSFER_EVENT,
            args: { to: wallet },
            fromBlock: from,
            toBlock: to,
          })
        } else {
          return publicClient.getLogs({
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
        if (
          log.args.from !== undefined &&
          log.args.to !== undefined &&
          log.args.value !== undefined &&
          log.blockNumber !== null
        ) {
          results.push({
            from: log.args.from,
            to: log.args.to,
            value: log.args.value,
            blockNumber: log.blockNumber,
          })
        }
      }
    }
  }

  return results
}

// ---------- Public API ----------

export async function getUSDCBalance(wallet: `0x${string}`): Promise<bigint> {
  const balance = await publicClient.readContract({
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
  windowDays = 90,
): Promise<WalletUSDCData> {
  const currentBlock = await publicClient.getBlockNumber()
  const fromBlock = clamp(
    currentBlock - BLOCKS_PER_DAY * BigInt(windowDays),
    0n,
    currentBlock,
  )

  const chunks = buildChunks(fromBlock, currentBlock)
  const [balance, inLogs, outLogs] = await Promise.all([
    getUSDCBalance(wallet),
    processLogBatch(chunks, 'in', wallet),
    processLogBatch(chunks, 'out', wallet),
  ])

  const block7dAgo = currentBlock - BLOCKS_PER_DAY * 7n
  const block30dAgo = currentBlock - BLOCKS_PER_DAY * 30n

  const sum = (logs: TransferLog[], minBlock: bigint) =>
    logs.filter((l) => l.blockNumber >= minBlock).reduce((acc, l) => acc + l.value, 0n)

  const inflows30d = sum(inLogs, block30dAgo)
  const outflows30d = sum(outLogs, block30dAgo)
  const inflows7d = sum(inLogs, block7dAgo)
  const outflows7d = sum(outLogs, block7dAgo)
  const totalInflows = inLogs.reduce((acc, l) => acc + l.value, 0n)
  const totalOutflows = outLogs.reduce((acc, l) => acc + l.value, 0n)

  const allBlocks = [...inLogs, ...outLogs]
    .map((l) => l.blockNumber)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  return {
    balance,
    inflows30d,
    outflows30d,
    inflows7d,
    outflows7d,
    totalInflows,
    totalOutflows,
    transferCount: inLogs.length + outLogs.length,
    firstBlockSeen: allBlocks[0] ?? null,
    lastBlockSeen: allBlocks[allBlocks.length - 1] ?? null,
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
    const result = await publicClient.readContract({
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
  return publicClient.getBlockNumber()
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
