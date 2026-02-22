/**
 * Blockchain Indexer — continuous background process
 *
 * Polls Base USDC for x402 payment settlements every 12 seconds (≈ 6 blocks).
 *
 * x402 uses USDC's EIP-3009 `transferWithAuthorization` for settlement.
 * Every settlement emits TWO events:
 *   1. Transfer(from, to, value)       — standard ERC-20 transfer
 *   2. AuthorizationUsed(authorizer, nonce)  — only emitted by EIP-3009 calls
 *
 * Filter strategy (two-layer):
 *   1. AuthorizationUsed filter — fetch these events, collect tx hashes, keep
 *      only Transfer events in that set. Eliminates regular transfer/transferFrom.
 *   2. Amount cap ($1 USDC) — x402 is a micro-payment protocol; all realistic
 *      API prices are $0.01–$0.50. Transfers above $1 are almost certainly
 *      DeFi activity (Morpho, Aave, etc.) that also happens to use EIP-3009.
 *
 * For a stricter filter, set FACILITATOR_ADDRESS env var to the EOA that
 * submits transferWithAuthorization transactions on behalf of the facilitator.
 * This requires fetching tx.from via eth_getTransactionByHash (one RPC call
 * per unique txHash) and is optional — the two-layer filter above catches
 * the vast majority of noise without the extra RPC cost.
 *
 * Tracks progress in indexer_state table so restarts resume from the
 * last indexed block rather than replaying history.
 *
 * On first run, backfills 30 days of history (~1,296,000 blocks).
 * On RPC error, waits 30 seconds before retrying.
 */
import { parseAbiItem } from 'viem'
import { publicClient, USDC_ADDRESS } from '../blockchain.js'
import { getIndexerState, setIndexerState, indexTransferBatch } from '../db.js'
import type { IndexedTransfer } from '../db.js'

// ---------- Constants ----------

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

// AuthorizationUsed is emitted exclusively by transferWithAuthorization / receiveWithAuthorization
// (EIP-3009). Regular transfer/transferFrom do NOT emit this event.
const AUTHORIZATION_USED_EVENT = parseAbiItem(
  'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)',
)

// No backfill on first run — start from current block to avoid OOM on 1GB machine.
// Historical data is not needed; per-wallet scoring uses direct RPC queries.
const BACKFILL_BLOCKS = 0n

// x402 is a micro-payment protocol — realistic API prices are $0.01–$0.50.
// Transfers above this threshold are almost certainly DeFi (Morpho, Aave, etc.)
// that also emits AuthorizationUsed but at much larger amounts.
const MAX_X402_AMOUNT_USDC = 1.0

// Base produces ~1 block every 2 seconds.
// Fallback genesis anchor (block 1, Feb 23 2023 18:33:23 UTC) is used only
// when the RPC block fetch fails. Normally we fetch the real chunk start block
// timestamp in parallel with getLogs, eliminating the ~3-month drift.
const BASE_GENESIS_BLOCK = 1n
const BASE_GENESIS_TS_MS = 1677177203_000n

const POLL_INTERVAL_MS = 12_000   // 12 s between polls
const RETRY_DELAY_MS = 30_000     // 30 s on RPC error
const LOG_CHUNK_SIZE = 10_000n    // getLogs block-range cap

const STATE_KEY = 'last_indexed_block'

// ---------- Helpers ----------

/**
 * Convert a block number to an ISO timestamp.
 * @param blockNumber - the block to timestamp
 * @param anchorBlock - a block whose real timestamp we know (chunk start)
 * @param anchorTsMs  - that block's real timestamp in milliseconds
 */
function blockToIsoTimestamp(
  blockNumber: bigint,
  anchorBlock: bigint,
  anchorTsMs: bigint,
): string {
  // Interpolate ±2s/block from the real anchor
  const ms = anchorTsMs + (blockNumber - anchorBlock) * 2000n
  return new Date(Number(ms)).toISOString()
}

/**
 * Fetch and index a single chunk [start, end].
 * Returns the number of x402 transfers indexed.
 */
async function fetchAndIndexChunk(start: bigint, end: bigint): Promise<number> {
  // Fetch both event types AND the chunk's real start-block timestamp in parallel.
  const [transferLogs, authUsedLogs, anchorBlockData] = await Promise.all([
    publicClient.getLogs({
      address: USDC_ADDRESS,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    }),
    publicClient.getLogs({
      address: USDC_ADDRESS,
      event: AUTHORIZATION_USED_EVENT,
      fromBlock: start,
      toBlock: end,
    }),
    // Graceful fallback: if the block fetch fails we still index with the
    // genesis-based approximation (less accurate but non-fatal).
    publicClient.getBlock({ blockNumber: start }).catch(() => null),
  ])

  // No x402 settlements in this range
  if (authUsedLogs.length === 0) return 0

  // Resolve anchor: use real block timestamp if available, else genesis formula
  const chunkAnchorBlock = anchorBlockData?.number ?? start
  const chunkAnchorTsMs = anchorBlockData
    ? anchorBlockData.timestamp * 1000n
    : BASE_GENESIS_TS_MS + (start - BASE_GENESIS_BLOCK) * 2000n

  // Build set of tx hashes that contain an AuthorizationUsed event (= x402 settlements)
  const x402TxHashes = new Set<string>()
  for (const log of authUsedLogs) {
    if (log.transactionHash !== null) x402TxHashes.add(log.transactionHash)
  }

  const transfers: IndexedTransfer[] = []

  for (const log of transferLogs) {
    if (
      log.args.from === undefined ||
      log.args.to === undefined ||
      log.args.value === undefined ||
      log.blockNumber === null ||
      log.transactionHash === null
    ) {
      continue
    }

    // Only index transfers that are x402 settlements (EIP-3009 filter)
    if (!x402TxHashes.has(log.transactionHash)) continue

    // Amount cap: skip large DeFi transfers that also emit AuthorizationUsed
    const amountUsdc = Number(log.args.value) / 1_000_000
    if (amountUsdc > MAX_X402_AMOUNT_USDC) continue

    transfers.push({
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      fromWallet: log.args.from,
      toWallet: log.args.to,
      amountUsdc,
      timestamp: blockToIsoTimestamp(log.blockNumber, chunkAnchorBlock, chunkAnchorTsMs),
    })
  }

  if (transfers.length > 0) {
    indexTransferBatch(transfers)
  }
  return transfers.length
}

/**
 * Extract the suggested safe end-block from a BlastAPI "too many results" error.
 * Error message format: "query exceeds max results 20000, retry with the range START-END"
 */
function parseSuggestedEnd(err: unknown): bigint | null {
  const msg = (err as { details?: string; message?: string })?.details
    ?? (err as { message?: string })?.message
    ?? String(err)
  const m = msg.match(/retry with the range \d+-(\d+)/)
  return m ? BigInt(m[1]) : null
}

async function fetchAndIndexRange(fromBlock: bigint, toBlock: bigint): Promise<number> {
  let total = 0
  let chunkSize = LOG_CHUNK_SIZE

  let start = fromBlock
  while (start <= toBlock) {
    const end = start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n

    try {
      const count = await fetchAndIndexChunk(start, end)
      total += count
      start = end + 1n
      // After a successful chunk, gradually restore the chunk size
      if (chunkSize < LOG_CHUNK_SIZE) {
        chunkSize = chunkSize * 2n > LOG_CHUNK_SIZE ? LOG_CHUNK_SIZE : chunkSize * 2n
      }
    } catch (err) {
      // BlastAPI tells us the max safe range — use it directly
      const suggestedEnd = parseSuggestedEnd(err)
      if (suggestedEnd !== null && suggestedEnd > start) {
        const newSize = suggestedEnd - start + 1n
        if (newSize < chunkSize) {
          chunkSize = newSize
          continue // retry same start with smaller chunk
        }
      }
      // Generic fallback: halve the chunk size
      if (chunkSize > 50n) {
        chunkSize = chunkSize / 2n
        continue // retry same start with smaller chunk
      }
      throw err // chunk is already tiny, give up
    }
  }

  return total
}

// ---------- State ----------

let running = false
let lastBlockIndexed = 0n

export function getIndexerStatus(): { lastBlockIndexed: number; running: boolean } {
  return { lastBlockIndexed: Number(lastBlockIndexed), running }
}

// ---------- Main loop ----------

export async function startBlockchainIndexer(): Promise<void> {
  running = true

  // Determine starting block
  const stored = getIndexerState(STATE_KEY)
  const currentBlock = await publicClient.getBlockNumber()

  if (stored) {
    lastBlockIndexed = BigInt(stored)
    console.log(`[indexer] Resuming from block ${lastBlockIndexed}`)
  } else {
    // First run — backfill 30 days of x402 history
    const startBlock = currentBlock > BACKFILL_BLOCKS ? currentBlock - BACKFILL_BLOCKS : 0n
    lastBlockIndexed = startBlock
    setIndexerState(STATE_KEY, startBlock.toString())
    console.log(`[indexer] First run — starting from current block ${startBlock}`)
  }

  while (running) {
    try {
      const tip = await publicClient.getBlockNumber()

      if (tip > lastBlockIndexed) {
        const fromBlock = lastBlockIndexed + 1n
        const count = await fetchAndIndexRange(fromBlock, tip)

        if (count > 0) {
          console.log(
            `[indexer] Indexed ${count} transfer(s) in blocks ${fromBlock}–${tip}`,
          )
        }

        lastBlockIndexed = tip
        setIndexerState(STATE_KEY, tip.toString())
      }
    } catch (err) {
      console.error('[indexer] RPC error:', err)
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      continue
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

export function stopBlockchainIndexer(): void {
  running = false
  console.log('[indexer] Stopped.')
}
