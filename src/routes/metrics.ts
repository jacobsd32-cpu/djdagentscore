/**
 * GET /metrics — Prometheus-compatible metrics endpoint.
 * Returns plain text in Prometheus exposition format.
 * No payment required.
 */
import { Hono } from 'hono'
import { db } from '../db.js'
import { getHttpCounters, uptimeSeconds } from '../metrics.js'

const metrics = new Hono()

metrics.get('/', (c) => {
  const lines: string[] = []

  // ── HTTP request counters ─────────────────────────────────────────
  lines.push('# HELP djd_http_requests_total Total HTTP requests by method, path, status')
  lines.push('# TYPE djd_http_requests_total counter')
  lines.push(...getHttpCounters())

  // ── Database gauges ───────────────────────────────────────────────
  lines.push('')
  lines.push('# HELP djd_scores_cached Number of cached agent scores in the database')
  lines.push('# TYPE djd_scores_cached gauge')
  const scoreCount = db.prepare<[], { c: number }>('SELECT count(*) as c FROM scores').get()
  lines.push(`djd_scores_cached ${scoreCount?.c ?? 0}`)

  lines.push('# HELP djd_wallets_indexed Number of unique wallets in wallet_stats')
  lines.push('# TYPE djd_wallets_indexed gauge')
  const walletCount = db.prepare<[], { c: number }>('SELECT count(*) as c FROM wallet_stats').get()
  lines.push(`djd_wallets_indexed ${walletCount?.c ?? 0}`)

  lines.push('# HELP djd_queries_total Total queries logged')
  lines.push('# TYPE djd_queries_total gauge')
  const queryCount = db.prepare<[], { c: number }>('SELECT count(*) as c FROM query_log').get()
  lines.push(`djd_queries_total ${queryCount?.c ?? 0}`)

  lines.push('# HELP djd_registrations_total Total agent registrations')
  lines.push('# TYPE djd_registrations_total gauge')
  const regCount = db.prepare<[], { c: number }>('SELECT count(*) as c FROM registrations').get()
  lines.push(`djd_registrations_total ${regCount?.c ?? 0}`)

  lines.push('# HELP djd_reports_total Total fraud reports')
  lines.push('# TYPE djd_reports_total gauge')
  const reportCount = db.prepare<[], { c: number }>('SELECT count(*) as c FROM reports').get()
  lines.push(`djd_reports_total ${reportCount?.c ?? 0}`)

  // ── Process metrics ───────────────────────────────────────────────
  lines.push('')
  lines.push('# HELP djd_process_uptime_seconds Process uptime in seconds')
  lines.push('# TYPE djd_process_uptime_seconds gauge')
  lines.push(`djd_process_uptime_seconds ${uptimeSeconds()}`)

  lines.push('# HELP djd_process_rss_bytes Resident set size in bytes')
  lines.push('# TYPE djd_process_rss_bytes gauge')
  lines.push(`djd_process_rss_bytes ${process.memoryUsage.rss()}`)

  lines.push('')

  c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  c.header('Cache-Control', 'no-cache')
  return c.body(lines.join('\n'))
})

export default metrics
