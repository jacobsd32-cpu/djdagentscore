/**
 * Structured logger — pino-backed with the same `log.info(tag, msg)` facade.
 *
 * In production (NODE_ENV=production), emits newline-delimited JSON for Fly.io
 * log drain.  In development, pipes through pino-pretty for human-readable
 * output with colours and timestamps.
 *
 * Usage:
 *   import { log } from './logger.js'
 *   log.info('server', `Listening on port ${port}`)
 *   log.error('engine', 'RPC timeout', err)
 *
 * Advanced — create a child logger bound to a tag for hot-path code:
 *   import { childLogger } from './logger.js'
 *   const clog = childLogger('indexer')
 *   clog.info('tick')
 */

import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'
const isTest = !!process.env.VITEST

// Base pino instance.
// In dev we use pino-pretty for human-readable output;
// in prod and test we emit raw JSON (fastest path — no worker thread overhead).
function buildTransport(): pino.TransportSingleOptions | undefined {
  if (isProduction || isTest) return undefined
  return {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
    },
  }
}

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : isProduction ? 'info' : 'debug'),
  transport: buildTransport(),
})

/**
 * Create a child logger bound to a tag. Useful for hot-path modules
 * that want to avoid passing the tag on every call.
 */
export function childLogger(tag: string): pino.Logger {
  return baseLogger.child({ tag })
}

// ---------- Facade matching the old log.{info,warn,error}(tag, msg, extra?) API ----------
// This keeps all 12 existing call-sites working without changes.

export const log = {
  info(tag: string, msg: string) {
    baseLogger.info({ tag }, msg)
  },
  warn(tag: string, msg: string, extra?: unknown) {
    if (extra !== undefined) {
      baseLogger.warn({ tag, error: extra instanceof Error ? extra.message : String(extra) }, msg)
    } else {
      baseLogger.warn({ tag }, msg)
    }
  },
  error(tag: string, msg: string, extra?: unknown) {
    if (extra instanceof Error) {
      baseLogger.error({ tag, err: extra }, msg)
    } else if (extra !== undefined) {
      baseLogger.error({ tag, error: String(extra) }, msg)
    } else {
      baseLogger.error({ tag }, msg)
    }
  },
}

/** The raw pino instance — use sparingly for middleware or when you need full pino features. */
export { baseLogger }
