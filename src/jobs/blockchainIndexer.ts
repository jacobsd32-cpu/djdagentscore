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

// 30 days of Base blocks to backfill on first run (~2s per block)
const BACKFILL_BLOCKS = 1_296_000n

// x402 is a micro-payment protocol — realistic API prices are $0.01–$0.50.
// Transfers above this threshold are almost certainly DeFi (Morpho, Aave, etc.)
// that also emits AuthorizationUsed but at much larger amounts.
const MAX_X402_AMOUNT_USDC = 1.0

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

    // Fetch both event types in parallel
    const [transferLogs, authUsedLogs] = await Promise.all([
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
    ])

    // No x402 settlements in this range
    if (authUsedLogs.length === 0) continue

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
    // First run — backfill 30 days of x402 history
    const startBlock = currentBlock > BACKFILL_BLOCKS ? currentBlock - BACKFILL_BLOCKS : 0n
    lastBlockIndexed = startBlock
    setIndexerState(STATE_KEY, startBlock.toString())
    console.log(`[indexer] First run — backfilling from block ${startBlock} (30d history)`)
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
