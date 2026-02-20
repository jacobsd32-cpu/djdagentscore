/**
 * Blockchain Indexer — continuous background process
 *
 * Polls Base USDC Transfer events every 12 seconds (≈ 6 blocks).
 * For each transfer:
 *   1. Insert into raw_transactions
 *   2. Upsert from/to into wallet_index
 *   3. Upsert pair into relationship_graph
 *
 * Tracks progress in indexer_state table so restarts resume from the
 * last indexed block rather than replaying history.
 *
 * On first run, starts from the current block (no historical backfill).
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

// Base produces ~1 block every 2 seconds.
// Approximate timestamp using genesis anchor (block 1, Feb 23 2023 18:33:23 UTC).
const BASE_GENESIS_BLOCK = 1n
const BASE_GENESIS_TS_MS = 1677177203_000n

const POLL_INTERVAL_MS = 12_000   // 12 s between polls
const RETRY_DELAY_MS = 30_000     // 30 s on RPC error
const LOG_CHUNK_SIZE = 10_000n    // getLogs block-range cap

const STATE_KEY = 'last_indexed_block'

// ---------- Helpers ----------

function blockToIsoTimestamp(blockNumber: bigint): string {
  const ms = BASE_GENESIS_TS_MS + (blockNumber - BASE_GENESIS_BLOCK) * 2000n
  return new Date(Number(ms)).toISOString()
}

async function fetchAndIndexRange(fromBlock: bigint, toBlock: bigint): Promise<number> {
  let total = 0

  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = start + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : start + LOG_CHUNK_SIZE - 1n

    const logs = await publicClient.getLogs({
      address: USDC_ADDRESS,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    })

    if (logs.length === 0) continue

    const transfers: IndexedTransfer[] = []

    for (const log of logs) {
      if (
        log.args.from === undefined ||
        log.args.to === undefined ||
        log.args.value === undefined ||
        log.blockNumber === null ||
        log.transactionHash === null
      ) {
        continue
      }

      transfers.push({
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber),
        fromWallet: log.args.from,
        toWallet: log.args.to,
        amountUsdc: Number(log.args.value) / 1_000_000,
        timestamp: blockToIsoTimestamp(log.blockNumber),
      })
    }

    if (transfers.length > 0) {
      indexTransferBatch(transfers)
      total += transfers.length
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
    // First run — start from current block, no historical backfill
    lastBlockIndexed = currentBlock
    setIndexerState(STATE_KEY, currentBlock.toString())
    console.log(`[indexer] First run — starting from block ${currentBlock}`)
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
