/**
 * Lightweight structured logger.
 *
 * Wraps console with ISO timestamps and a consistent [tag] prefix.
 * On production (NODE_ENV=production), emits single-line JSON for Fly.io log drain.
 * In development, emits human-readable lines.
 *
 * Usage:
 *   import { log } from './logger.js'
 *   log.info('server', `Listening on port ${port}`)
 *   log.error('engine', 'RPC timeout', err)
 */

const isProduction = process.env.NODE_ENV === 'production'

function formatMessage(level: string, tag: string, msg: string, extra?: unknown): string {
  if (isProduction) {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      tag,
      msg,
    }
    if (extra !== undefined) {
      entry.error = extra instanceof Error ? extra.message : String(extra)
    }
    return JSON.stringify(entry)
  }

  const ts = new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
  const suffix = extra ? ` ${extra instanceof Error ? extra.message : extra}` : ''
  return `${ts} [${tag}] ${msg}${suffix}`
}

export const log = {
  info(tag: string, msg: string) {
    console.log(formatMessage('info', tag, msg))
  },
  warn(tag: string, msg: string, extra?: unknown) {
    console.warn(formatMessage('warn', tag, msg, extra))
  },
  error(tag: string, msg: string, extra?: unknown) {
    console.error(formatMessage('error', tag, msg, extra))
  },
}
