/**
 * USDC Transfer Indexer — continuous forward indexer
 *
 * Indexes ALL Base USDC Transfer events (not just x402) into usdc_transfers.
 * Runs alongside blockchainIndexer.ts without interference.
 * Uses separate state key: 'usdc_last_indexed_block'.
 */
import { parseAbiItem } from 'viem'
import { getPublicClient, USDC_ADDRESS } from '../blockchain.js'
import { USDC_INDEXER_CONFIG } from '../config/constants.js'
import { db, getIndexerState, setIndexerState } from '../db.js'
import { log } from '../logger.js'
import { BASE_GENESIS_TS_MS, blockToIsoTimestamp, iterateChunks } from './indexerUtils.js'
import type { UsdcTransfer } from './usdcTransferHelpers.js'
import { indexUsdcTransferBatch, refreshWalletTransferStats } from './usdcTransferHelpers.js'

const {
  POLL_INTERVAL_MS,
  RETRY_DELAY_MS,
  LOG_CHUNK_SIZE,
  RATE_LIMIT_DELAY_MS,
  MAX_CATCHUP_BLOCKS,
  MAX_WALLET_REFRESH_PER_CHUNK,
  MICRO_BATCH_SIZE,
  EVENT_LOOP_YIELD_MS,
  CATCHUP_THRESHOLD,
  MAX_BLOCKS_PER_CYCLE,
} = USDC_INDEXER_CONFIG

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const STATE_KEY = 'usdc_last_indexed_block'

let running = false
let lastBlockIndexed = 0n

export function getUsdcIndexerStatus(): { lastBlockIndexed: number; running: boolean } {
  return { lastBlockIndexed: Number(lastBlockIndexed), running }
}

async function fetchAndIndexChunk(start: bigint, end: bigint, isCatchingUp: boolean): Promise<number> {
  const [transferLogs, anchorBlockData] = await Promise.all([
    getPublicClient().getLogs({
      address: USDC_ADDRESS,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    }),
    getPublicClient()
      .getBlock({ blockNumber: start })
      .catch(() => null),
  ])

  if (transferLogs.length === 0) return 0

  const chunkAnchorBlock = anchorBlockData?.number ?? start
  const chunkAnchorTsMs = anchorBlockData
    ? anchorBlockData.timestamp * 1000n
    : BASE_GENESIS_TS_MS + (start - 1n) * 2000n

  const transfers: UsdcTransfer[] = []
  for (const logEntry of transferLogs) {
    if (
      logEntry.args.from === undefined ||
      logEntry.args.to === undefined ||
      logEntry.args.value === undefined ||
      logEntry.blockNumber === null ||
      logEntry.transactionHash === null
    )
      continue

    const amountUsdc = Number(logEntry.args.value) / 1_000_000

    transfers.push({
      txHash: logEntry.transactionHash,
      blockNumber: Number(logEntry.blockNumber),
      fromWallet: logEntry.args.from,
      toWallet: logEntry.args.to,
      amountUsdc,
      timestamp: blockToIsoTimestamp(logEntry.blockNumber, chunkAnchorBlock, chunkAnchorTsMs),
    })
  }

  if (transfers.length === 0) return 0

  // ── Micro-batch inserts to avoid blocking the event loop ────────────────
  // Each micro-batch runs in its own synchronous transaction (~20ms each).
  // Yields between batches let health checks and other I/O interleave.
  let inserted = 0
  for (let i = 0; i < transfers.length; i += MICRO_BATCH_SIZE) {
    const batch = transfers.slice(i, i + MICRO_BATCH_SIZE)
    inserted += indexUsdcTransferBatch(db, batch)
    if (i + MICRO_BATCH_SIZE < transfers.length) {
      await new Promise((r) => setTimeout(r, EVENT_LOOP_YIELD_MS))
    }
  }

  // ── Wallet stats refresh (skipped during catch-up) ─────────────────────
  // refreshWalletTransferStats runs 3 aggregate queries per wallet — even
  // with indexes, this is too expensive during catch-up when we're processing
  // thousands of transfers per second.
  if (!isCatchingUp) {
    const affectedWallets = new Set<string>()
    for (const t of transfers) {
      affectedWallets.add(t.fromWallet.toLowerCase())
      affectedWallets.add(t.toWallet.toLowerCase())
    }
    const walletsToRefresh = Array.from(affectedWallets).slice(0, MAX_WALLET_REFRESH_PER_CHUNK)
    // Refresh one wallet at a time with yields between to avoid blocking
    for (const wallet of walletsToRefresh) {
      refreshWalletTransferStats(db, [wallet])
      await new Promise((r) => setTimeout(r, EVENT_LOOP_YIELD_MS))
    }
    if (affectedWallets.size > MAX_WALLET_REFRESH_PER_CHUNK) {
      log.info(
        'usdc-indexer',
        `Capped wallet refresh to ${MAX_WALLET_REFRESH_PER_CHUNK}/${affectedWallets.size} wallets`,
      )
    }
  }

  return inserted
}

export async function startUsdcTransferIndexer(): Promise<void> {
  running = true

  const stored = getIndexerState(STATE_KEY)
  const currentBlock = await getPublicClient().getBlockNumber()

  if (stored) {
    const storedBlock = BigInt(stored)
    const minBlock = currentBlock > MAX_CATCHUP_BLOCKS ? currentBlock - MAX_CATCHUP_BLOCKS : 0n
    if (storedBlock < minBlock) {
      lastBlockIndexed = currentBlock
      setIndexerState(STATE_KEY, currentBlock.toString())
      log.warn('usdc-indexer', `Stored state too old (${storedBlock}) — skipping to current block ${currentBlock}`)
    } else {
      lastBlockIndexed = storedBlock
      log.info('usdc-indexer', `Resuming from block ${lastBlockIndexed}`)
    }
  } else {
    lastBlockIndexed = currentBlock
    setIndexerState(STATE_KEY, currentBlock.toString())
    log.info('usdc-indexer', `First run — starting from current block ${currentBlock}`)
  }

  while (running) {
    try {
      const tip = await getPublicClient().getBlockNumber()

      if (tip > lastBlockIndexed) {
        const gap = tip - lastBlockIndexed
        const isCatchingUp = gap > CATCHUP_THRESHOLD

        // Cap the block range per cycle so each iteration stays bounded.
        // Excess blocks are processed in subsequent 15s poll cycles.
        const cycleEnd = gap > MAX_BLOCKS_PER_CYCLE ? lastBlockIndexed + MAX_BLOCKS_PER_CYCLE : tip

        if (isCatchingUp) {
          log.info(
            'usdc-indexer',
            `Catching up ${gap} blocks (processing ${cycleEnd - lastBlockIndexed} this cycle) — skipping wallet stats refresh`,
          )
        }

        const total = await iterateChunks({
          fromBlock: lastBlockIndexed + 1n,
          toBlock: cycleEnd,
          chunkSize: LOG_CHUNK_SIZE,
          yieldMs: Math.max(RATE_LIMIT_DELAY_MS, 50),
          processChunk: (start, end) => fetchAndIndexChunk(start, end, isCatchingUp),
        })

        if (total > 0) {
          log.info('usdc-indexer', `Indexed ${total} USDC transfer(s) in blocks ${lastBlockIndexed + 1n}–${cycleEnd}`)
        }

        lastBlockIndexed = cycleEnd
        setIndexerState(STATE_KEY, cycleEnd.toString())
      }
    } catch (err) {
      log.error('usdc-indexer', 'RPC error', err)
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      continue
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

export function stopUsdcTransferIndexer(): void {
  running = false
  log.info('usdc-indexer', 'Stopped.')
}
