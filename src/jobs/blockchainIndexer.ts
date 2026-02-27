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
import { getPublicClient, USDC_ADDRESS } from '../blockchain.js'
import { BLOCKCHAIN_INDEXER_CONFIG } from '../config/constants.js'
import type { IndexedTransfer } from '../db.js'
import { getIndexerState, indexTransferBatch, setIndexerState } from '../db.js'
import { log } from '../logger.js'
import { BASE_GENESIS_BLOCK, BASE_GENESIS_TS_MS, blockToIsoTimestamp, iterateChunks } from './indexerUtils.js'

// ---------- Constants ----------

const {
  BACKFILL_BLOCKS,
  MAX_X402_AMOUNT_USDC,
  POLL_INTERVAL_MS,
  RETRY_DELAY_MS,
  LOG_CHUNK_SIZE,
  EVENT_LOOP_YIELD_MS,
  MAX_CATCHUP_BLOCKS,
} = BLOCKCHAIN_INDEXER_CONFIG

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

// AuthorizationUsed is emitted exclusively by transferWithAuthorization / receiveWithAuthorization
// (EIP-3009). Regular transfer/transferFrom do NOT emit this event.
const AUTHORIZATION_USED_EVENT = parseAbiItem(
  'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)',
)

// EOA that submits transferWithAuthorization on behalf of the OpenX402 facilitator.
// Source: https://facilitator.openx402.ai/discovery/resources → signers["eip155:*"]
// Set FACILITATOR_ADDRESS env var to override; set to empty string to disable filter.
const FACILITATOR_ADDRESS = (
  process.env.FACILITATOR_ADDRESS ?? '0x97316FA4730BC7d3B295234F8e4D04a0a4C093e8'
).toLowerCase()

const STATE_KEY = 'last_indexed_block'

// ---------- Helpers ----------

/**
 * Fetch and index a single chunk [start, end].
 * Returns the number of x402 transfers indexed.
 */
async function fetchAndIndexChunk(start: bigint, end: bigint): Promise<number> {
  // Fetch both event types AND the chunk's real start-block timestamp in parallel.
  const [transferLogs, authUsedLogs, anchorBlockData] = await Promise.all([
    getPublicClient().getLogs({
      address: USDC_ADDRESS,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    }),
    getPublicClient().getLogs({
      address: USDC_ADDRESS,
      event: AUTHORIZATION_USED_EVENT,
      fromBlock: start,
      toBlock: end,
    }),
    // Graceful fallback: if the block fetch fails we still index with the
    // genesis-based approximation (less accurate but non-fatal).
    getPublicClient()
      .getBlock({ blockNumber: start })
      .catch(() => null),
  ])

  // No x402 settlements in this range
  if (authUsedLogs.length === 0) return 0

  // Resolve anchor: use real block timestamp if available, else genesis formula
  const chunkAnchorBlock = anchorBlockData?.number ?? start
  const chunkAnchorTsMs = anchorBlockData
    ? anchorBlockData.timestamp * 1000n
    : BASE_GENESIS_TS_MS + (start - BASE_GENESIS_BLOCK) * 2000n

  // Build set of candidate tx hashes (contain AuthorizationUsed = EIP-3009 call)
  const authTxHashes = new Set<string>()
  for (const log of authUsedLogs) {
    if (log.transactionHash !== null) authTxHashes.add(log.transactionHash)
  }

  // Filter to only transactions submitted by the known OpenX402 facilitator EOA.
  // One eth_getTransactionByHash per unique txHash — batched to avoid OOM.
  //
  // Safety valve: if a chunk has >100 unique AuthorizationUsed tx hashes it is
  // almost certainly DeFi (Morpho, Aave, Permit2) rather than x402 micro-payments.
  // Skip the getTransaction filter in that case — the amount cap ($1) is sufficient.
  const TX_FILTER_LIMIT = 100
  const BATCH_SIZE = 25
  let x402TxHashes: Set<string>
  if (FACILITATOR_ADDRESS && authTxHashes.size <= TX_FILTER_LIMIT) {
    const hashes = Array.from(authTxHashes)
    x402TxHashes = new Set<string>()
    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
      const batch = hashes.slice(i, i + BATCH_SIZE)
      const txs = await Promise.all(
        batch.map((h) =>
          getPublicClient()
            .getTransaction({ hash: h as `0x${string}` })
            .catch(() => null),
        ),
      )
      for (let j = 0; j < batch.length; j++) {
        const tx = txs[j]
        if (tx && tx.from.toLowerCase() === FACILITATOR_ADDRESS) {
          x402TxHashes.add(batch[j])
        }
      }
    }
  } else {
    // Too many events for EOA filter (DeFi chunk) or filter disabled — fall back
    // to amount cap only ($1 USDC ceiling set in the transfer loop below).
    x402TxHashes = authTxHashes
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

async function fetchAndIndexRange(fromBlock: bigint, toBlock: bigint): Promise<number> {
  return iterateChunks({
    fromBlock,
    toBlock,
    chunkSize: LOG_CHUNK_SIZE,
    yieldMs: EVENT_LOOP_YIELD_MS,
    processChunk: fetchAndIndexChunk,
  })
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
  const currentBlock = await getPublicClient().getBlockNumber()

  if (stored) {
    const storedBlock = BigInt(stored)
    const minBlock = currentBlock > MAX_CATCHUP_BLOCKS ? currentBlock - MAX_CATCHUP_BLOCKS : 0n
    if (storedBlock < minBlock) {
      lastBlockIndexed = currentBlock
      setIndexerState(STATE_KEY, currentBlock.toString())
      log.warn('indexer', `Stored state too old (${storedBlock}) — skipping to current block ${currentBlock}`)
    } else {
      lastBlockIndexed = storedBlock
      log.info('indexer', `Resuming from block ${lastBlockIndexed}`)
    }
  } else {
    // First run — backfill recent history so the relationship graph and
    // wallet_index have data for sybil detection on initial queries.
    const backfillStart = currentBlock > BACKFILL_BLOCKS ? currentBlock - BACKFILL_BLOCKS : 0n
    lastBlockIndexed = backfillStart
    setIndexerState(STATE_KEY, backfillStart.toString())
    log.info(
      'indexer',
      `First run — backfilling from block ${backfillStart} (${BACKFILL_BLOCKS} blocks behind tip ${currentBlock})`,
    )
  }

  while (running) {
    try {
      const tip = await getPublicClient().getBlockNumber()

      if (tip > lastBlockIndexed) {
        const fromBlock = lastBlockIndexed + 1n
        const count = await fetchAndIndexRange(fromBlock, tip)

        if (count > 0) {
          log.info('indexer', `Indexed ${count} transfer(s) in blocks ${fromBlock}–${tip}`)
        }

        lastBlockIndexed = tip
        setIndexerState(STATE_KEY, tip.toString())
      }
    } catch (err) {
      log.error('indexer', 'RPC error', err)
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      continue
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

export function stopBlockchainIndexer(): void {
  running = false
  log.info('indexer', 'Stopped.')
}
