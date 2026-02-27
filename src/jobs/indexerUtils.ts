/**
 * Shared indexer utilities.
 *
 * Common infrastructure used by both blockchainIndexer and usdcTransferIndexer:
 * block timestamp interpolation, RPC error parsing, and chunk iteration with
 * adaptive backoff.
 */

// Base L2 genesis anchor for timestamp interpolation fallback.
// Used when RPC block fetch fails — normally each indexer fetches the real
// chunk-start block timestamp for better accuracy.
export const BASE_GENESIS_BLOCK = 1n
export const BASE_GENESIS_TS_MS = 1_677_177_203_000n

/**
 * Interpolate a block's ISO timestamp from a known anchor.
 * Base produces ~1 block every 2 seconds.
 */
export function blockToIsoTimestamp(blockNumber: bigint, anchorBlock: bigint, anchorTsMs: bigint): string {
  const ms = anchorTsMs + (blockNumber - anchorBlock) * 2000n
  return new Date(Number(ms)).toISOString()
}

/**
 * Extract the suggested safe end-block from a BlastAPI "too many results" error.
 * Error format: "query exceeds max results 20000, retry with the range START-END"
 */
export function parseSuggestedEnd(err: unknown): bigint | null {
  const msg =
    (err as { details?: string; message?: string })?.details ?? (err as { message?: string })?.message ?? String(err)
  const m = msg.match(/retry with the range \d+-(\d+)/)
  return m ? BigInt(m[1]) : null
}

export interface ChunkIteratorOptions {
  fromBlock: bigint
  toBlock: bigint
  chunkSize: bigint
  yieldMs: number
  /** Process a [start, end] block range. Returns the number of items indexed. */
  processChunk: (start: bigint, end: bigint) => Promise<number>
}

/**
 * Iterate over a block range in chunks with adaptive sizing.
 *
 * On RPC "too many results" errors: uses the provider's suggested range if
 * available, otherwise halves the chunk size. After successful chunks,
 * gradually doubles back toward the initial size. Yields the event loop
 * between chunks so health checks can be served.
 */
export async function iterateChunks(opts: ChunkIteratorOptions): Promise<number> {
  const { fromBlock, toBlock, yieldMs, processChunk } = opts
  let { chunkSize } = opts
  const initialChunkSize = chunkSize
  let total = 0
  let start = fromBlock

  while (start <= toBlock) {
    const end = start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n

    try {
      total += await processChunk(start, end)
      start = end + 1n
      // Gradually restore chunk size after a reduction
      if (chunkSize < initialChunkSize) {
        chunkSize = chunkSize * 2n > initialChunkSize ? initialChunkSize : chunkSize * 2n
      }
      await new Promise((r) => setTimeout(r, yieldMs))
    } catch (err) {
      // BlastAPI tells us the max safe range — use it directly
      const suggestedEnd = parseSuggestedEnd(err)
      if (suggestedEnd !== null && suggestedEnd > start) {
        const newSize = suggestedEnd - start + 1n
        if (newSize < chunkSize) {
          chunkSize = newSize
          continue
        }
      }
      // Generic fallback: halve the chunk size
      if (chunkSize > 50n) {
        chunkSize = chunkSize / 2n
        continue
      }
      throw err // chunk is already tiny, give up
    }
  }

  return total
}
