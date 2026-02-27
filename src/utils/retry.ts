/**
 * Generic retry utility for transient failures (RPC timeouts, rate limits, etc).
 *
 * Not suitable for deterministic errors like SQLite constraint violations —
 * only use this around network I/O that can fail transiently.
 */
import { log } from '../logger.js'

interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  attempts?: number
  /** Base delay in ms before first retry. Doubles each attempt. Default: 1000 */
  baseDelayMs?: number
  /** Tag for log messages. Default: 'retry' */
  tag?: string
}

const DEFAULTS = { attempts: 3, baseDelayMs: 1_000, tag: 'retry' } as const

export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const { attempts, baseDelayMs, tag } = { ...DEFAULTS, ...opts }

  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts) {
        const delay = baseDelayMs * 2 ** (i - 1)
        log.warn(tag, `Attempt ${i}/${attempts} failed — retrying in ${delay}ms`, err)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}
