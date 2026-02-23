/**
 * USDC Transfer Indexer — continuous forward indexer
 *
 * Indexes ALL Base USDC Transfer events (not just x402) into usdc_transfers.
 * Runs alongside blockchainIndexer.ts without interference.
 * Uses separate state key: 'usdc_last_indexed_block'.
 */
import { parseAbiItem } from 'viem'
import { log } from '../logger.js'
import { getPublicClient, USDC_ADDRESS } from '../blockchain.js'
import { db } from '../db.js'
import { getIndexerState, setIndexerState } from '../db.js'
import { indexUsdcTransferBatch, refreshWalletTransferStats } from './usdcTransferHelpers.js'
import type { UsdcTransfer } from './usdcTransferHelpers.js'

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

const STATE_KEY = 'usdc_last_indexed_block'
const POLL_INTERVAL_MS = 15_000
const RETRY_DELAY_MS = 30_000
const LOG_CHUNK_SIZE = 2_000n  // Smaller chunks to stay within rate limits
const RATE_LIMIT_DELAY_MS = 200  // ~5 getLogs/sec

let running = false
let lastBlockIndexed = 0n

export function getUsdcIndexerStatus(): { lastBlockIndexed: number; running: boolean } {
  return { lastBlockIndexed: Number(lastBlockIndexed), running }
}

function blockToIsoTimestamp(blockNumber: bigint, anchorBlock: bigint, anchorTsMs: bigint): string {
  const ms = anchorTsMs + (blockNumber - anchorBlock) * 2000n
  return new Date(Number(ms)).toISOString()
}

async function fetchAndIndexChunk(start: bigint, end: bigint): Promise<number> {
  const [transferLogs, anchorBlockData] = await Promise.all([
    getPublicClient().getLogs({
      address: USDC_ADDRESS,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    }),
    getPublicClient().getBlock({ blockNumber: start }).catch(() => null),
  ])

  if (transferLogs.length === 0) return 0

  const chunkAnchorBlock = anchorBlockData?.number ?? start
  const chunkAnchorTsMs = anchorBlockData
    ? anchorBlockData.timestamp * 1000n
    : 1677177203_000n + (start - 1n) * 2000n

  const transfers: UsdcTransfer[] = []
  for (const logEntry of transferLogs) {
    if (
      logEntry.args.from === undefined ||
      logEntry.args.to === undefined ||
      logEntry.args.value === undefined ||
      logEntry.blockNumber === null ||
      logEntry.transactionHash === null
    ) continue

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

  if (transfers.length > 0) {
    const inserted = indexUsdcTransferBatch(db, transfers)

    // Refresh stats for affected wallets
    const affectedWallets = new Set<string>()
    for (const t of transfers) {
      affectedWallets.add(t.fromWallet.toLowerCase())
      affectedWallets.add(t.toWallet.toLowerCase())
    }
    refreshWalletTransferStats(db, Array.from(affectedWallets))

    return inserted
  }
  return 0
}

function parseSuggestedEnd(err: unknown): bigint | null {
  const msg = (err as { details?: string; message?: string })?.details
    ?? (err as { message?: string })?.message
    ?? String(err)
  const m = msg.match(/retry with the range \d+-(\d+)/)
  return m ? BigInt(m[1]) : null
}

export async function startUsdcTransferIndexer(): Promise<void> {
  running = true

  const stored = getIndexerState(STATE_KEY)
  const currentBlock = await getPublicClient().getBlockNumber()

  if (stored) {
    lastBlockIndexed = BigInt(stored)
    log.info('usdc-indexer', `Resuming from block ${lastBlockIndexed}`)
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

        while (start <= tip) {
          const end = start + chunkSize - 1n > tip ? tip : start + chunkSize - 1n

          try {
            const count = await fetchAndIndexChunk(start, end)
            total += count
            start = end + 1n
            if (chunkSize < LOG_CHUNK_SIZE) {
              chunkSize = chunkSize * 2n > LOG_CHUNK_SIZE ? LOG_CHUNK_SIZE : chunkSize * 2n
            }
            await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS))
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
