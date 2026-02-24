/**
 * USDC Transfer Indexer — continuous forward indexer
 *
 * Indexes ALL Base USDC Transfer events (not just x402) into usdc_transfers.
 * Runs alongside blockchainIndexer.ts without interference.
 * Uses separate state key: 'usdc_last_indexed_block'.
 */
import { parseAbiItem } from 'viem'
import { getPublicClient, USDC_ADDRESS } from '../blockchain.js'
import { db, getIndexerState, setIndexerState } from '../db.js'
import { log } from '../logger.js'
import type { UsdcTransfer } from './usdcTransferHelpers.js'
import { indexUsdcTransferBatch, refreshWalletTransferStats } from './usdcTransferHelpers.js'

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const STATE_KEY = 'usdc_last_indexed_block'
const POLL_INTERVAL_MS = 15_000
const RETRY_DELAY_MS = 30_000
const LOG_CHUNK_SIZE = 100n // ~100 blocks ≈ 3,500 transfers max per RPC call
const RATE_LIMIT_DELAY_MS = 200 // ~5 getLogs/sec

// Max gap we'll index on startup. If stored state is further behind, skip to current.
// Base USDC is extremely high-volume — catching up too far blocks the event loop.
const MAX_CATCHUP_BLOCKS = 21_600n // ~12 hours at 2s/block

// Max wallets to refresh stats for per chunk. Each wallet runs 3 aggregate queries
// against usdc_transfers — even with indexes, this blocks the event loop.
const MAX_WALLET_REFRESH_PER_CHUNK = 5

// SQLite micro-batch size: break large inserts into small transactions with
// event loop yields between them. better-sqlite3 is synchronous — one 2000-row
// transaction blocks for seconds. 200-row transactions block for ~20ms each.
const MICRO_BATCH_SIZE = 200
const EVENT_LOOP_YIELD_MS = 10

// Blocks behind tip at which we consider ourselves "catching up" and skip
// expensive wallet stats refresh (which runs 3 queries per wallet).
const CATCHUP_THRESHOLD = 50n

let running = false
let lastBlockIndexed = 0n

export function getUsdcIndexerStatus(): { lastBlockIndexed: number; running: boolean } {
  return { lastBlockIndexed: Number(lastBlockIndexed), running }
}

function blockToIsoTimestamp(blockNumber: bigint, anchorBlock: bigint, anchorTsMs: bigint): string {
  const ms = anchorTsMs + (blockNumber - anchorBlock) * 2000n
  return new Date(Number(ms)).toISOString()
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
  const chunkAnchorTsMs = anchorBlockData ? anchorBlockData.timestamp * 1000n : 1677177203_000n + (start - 1n) * 2000n

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

function parseSuggestedEnd(err: unknown): bigint | null {
  const msg =
    (err as { details?: string; message?: string })?.details ?? (err as { message?: string })?.message ?? String(err)
  const m = msg.match(/retry with the range \d+-(\d+)/)
  return m ? BigInt(m[1]) : null
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
        let start = lastBlockIndexed + 1n
        let total = 0
        let chunkSize = LOG_CHUNK_SIZE
        const isCatchingUp = tip - lastBlockIndexed > CATCHUP_THRESHOLD

        if (isCatchingUp) {
          log.info('usdc-indexer', `Catching up ${tip - lastBlockIndexed} blocks — skipping wallet stats refresh`)
        }

        while (start <= tip) {
          const end = start + chunkSize - 1n > tip ? tip : start + chunkSize - 1n

          try {
            const count = await fetchAndIndexChunk(start, end, isCatchingUp)
            total += count
            start = end + 1n
            if (chunkSize < LOG_CHUNK_SIZE) {
              chunkSize = chunkSize * 2n > LOG_CHUNK_SIZE ? LOG_CHUNK_SIZE : chunkSize * 2n
            }
            // Yield the event loop so HTTP health checks can be served
            await new Promise((r) => setTimeout(r, Math.max(RATE_LIMIT_DELAY_MS, 50)))
          } catch (err) {
            const suggestedEnd = parseSuggestedEnd(err)
            if (suggestedEnd !== null && suggestedEnd > start) {
              const newSize = suggestedEnd - start + 1n
              if (newSize < chunkSize) {
                chunkSize = newSize
                continue
              }
            }
            if (chunkSize > 50n) {
              chunkSize = chunkSize / 2n
              continue
            }
            throw err
          }
        }

        if (total > 0) {
          log.info('usdc-indexer', `Indexed ${total} USDC transfer(s) in blocks ${lastBlockIndexed + 1n}–${tip}`)
        }

        lastBlockIndexed = tip
        setIndexerState(STATE_KEY, tip.toString())
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
