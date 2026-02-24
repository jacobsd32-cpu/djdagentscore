import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { paymentMiddleware, type Network } from 'x402-hono'

import healthRoute from './routes/health.js'
import scoreRoute from './routes/score.js'
import reportRoute from './routes/report.js'
import leaderboardRoute from './routes/leaderboard.js'
import blacklistRoute from './routes/blacklist.js'
import legal from './routes/legal.js'
import registerRoute from './routes/register.js'
import badgeRoute from './routes/badge.js'
import agentRoute from './routes/agent.js'
import openapiRoute from './routes/openapi.js'
import admin from './routes/admin.js'
import { responseHeadersMiddleware } from './middleware/responseHeaders.js'
import { queryLoggerMiddleware } from './middleware/queryLogger.js'
import { freeTierMiddleware } from './middleware/freeTier.js'
import { startBlockchainIndexer, stopBlockchainIndexer } from './jobs/blockchainIndexer.js'
import { startUsdcTransferIndexer, stopUsdcTransferIndexer } from './jobs/usdcTransferIndexer.js'
import { runHourlyRefresh } from './jobs/scoreRefresh.js'
import { runIntentMatcher } from './jobs/intentMatcher.js'
import { runOutcomeMatcher } from './jobs/outcomeMatcher.js'
import { runAnomalyDetector, runSybilMonitor } from './jobs/anomalyDetector.js'
import { runDailyAggregator } from './jobs/dailyAggregator.js'
import { runGithubReverify } from './jobs/githubReverify.js'
import { jobStats } from './jobs/jobStats.js'
import { db, getIndexerState, setIndexerState } from './db.js'
import { log } from './logger.js'
import type { AppEnv } from './types/hono-env.js'

// ---------- Env helpers ----------

function assertEnv(key: string, opts?: { minLength?: number }): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  if (opts?.minLength && val.length < opts.minLength)
    throw new Error(`${key} must be at least ${opts.minLength} characters`)
  return val
}

// ---------- Config ----------

const PORT = Number(process.env.PORT ?? 3000)
const PAY_TO = assertEnv('PAY_TO') as `0x${string}`
if (!/^0x[0-9a-fA-F]{40}$/.test(PAY_TO)) throw new Error('PAY_TO must be a valid Ethereum address')

if (process.env.NODE_ENV === 'production') {
  assertEnv('ADMIN_KEY', { minLength: 32 })
  assertEnv('CORS_ORIGINS')
}

if (!process.env.GITHUB_TOKEN) {
  console.warn('[config] GITHUB_TOKEN not set — GitHub verification limited to 60 req/hr')
}
const FACILITATOR_URL = (
  process.env.FACILITATOR_URL ?? 'https://x402.org/facilitator'
) as `${string}://${string}`
const NETWORK: Network = 'base'

// ---------- App ----------

const app = new Hono<AppEnv>()

// ---------- Global middleware (registration order = execution order) ----------

app.use('*', logger())
app.use('*', cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : [],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
}))
app.use('*', bodyLimit({
  maxSize: 100 * 1024, // 100 KB
  onError: (c) => c.json({ error: 'Request body too large' }, 413),
}))
app.use('*', responseHeadersMiddleware)  // adds X-DJD-* headers to every response
app.use('*', queryLoggerMiddleware)       // logs every request post-response

// ---------- Free tier — MUST be registered before x402 ----------
// Serves /v1/score/basic for free (up to 10/day per requester) by short-circuiting the chain.

app.use('/v1/score/basic', freeTierMiddleware)

// ---------- Free routes (no payment required) ----------
// Must be mounted before paymentMiddleware.

app.route('/', legal)
app.route('/v1/agent/register', registerRoute)
app.route('/v1/badge', badgeRoute)          // free — must be before paymentMiddleware
app.route('/agent', agentRoute)             // free — agent profile pages
app.route('/openapi.json', openapiRoute)    // free — API spec

// ---------- x402 Payment Middleware ----------
// Protects paid endpoints. Free endpoints (leaderboard, health) are not listed so they pass through.

app.use(
  paymentMiddleware(
    PAY_TO,
    {
      '/v1/score/full': {
        price: '$0.10',
        network: NETWORK,
        config: { description: 'Full agent score with dimension breakdown ($0.10 USDC)' },
      },
      '/v1/score/refresh': {
        price: '$0.25',
        network: NETWORK,
        config: { description: 'Force live recalculation of agent score ($0.25 USDC)' },
      },
      '/v1/report': {
        price: '$0.02',
        network: NETWORK,
        config: { description: 'Submit a fraud/misconduct report ($0.02 USDC)' },
      },
      '/v1/data/fraud/blacklist': {
        price: '$0.05',
        network: NETWORK,
        config: { description: 'Fraud report check ($0.05 USDC)' },
      },
    },
    { url: FACILITATOR_URL },
  ),
)

// ---------- Routes ----------

app.route('/health', healthRoute)
app.route('/v1/score', scoreRoute)
app.route('/v1/report', reportRoute)
app.route('/v1/leaderboard', leaderboardRoute)
app.route('/v1/data/fraud/blacklist', blacklistRoute)
app.route('/admin', admin)

// 404 handler
app.notFound((c) => c.json({ error: 'Not found' }, 404))

// Global error handler
app.onError((err, c) => {
  log.error('http', 'Unhandled error', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// ---------- Graceful shutdown ----------

const intervals: ReturnType<typeof setInterval>[] = []
let server: ReturnType<typeof serve> | null = null
let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  log.info('server', 'Shutting down...')

  for (const id of intervals) clearInterval(id)
  stopBlockchainIndexer()
  stopUsdcTransferIndexer()

  if (server) {
    server.close(() => {
      log.info('server', 'All connections closed')
      db.close()
      process.exit(0)
    })
    setTimeout(() => {
      log.warn('server', 'Forcing exit after 10s timeout')
      db.close()
      process.exit(1)
    }, 10_000).unref()
  } else {
    db.close()
    process.exit(0)
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// ---------- Start ----------

server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  log.info('server', `DJD Agent Score API running on http://localhost:${info.port}`)
  log.info('server', `payTo: ${PAY_TO}`)
  log.info('server', `facilitator: ${FACILITATOR_URL}`)

  log.info('jobs', 'Starting background processes...')

  // ── 1. Blockchain indexer (continuous) ─────────────────────────────────────
  startBlockchainIndexer().catch((err) =>
    log.error('indexer', 'Fatal error, stopped', err),
  )

  // ── 1b. USDC Transfer indexer (continuous) ─────────────────────────────────
  startUsdcTransferIndexer().catch((err) =>
    log.error('usdc-indexer', 'Fatal error, stopped', err),
  )

  // ── 2. Hourly score refresh + wallet snapshots + economy metrics ───────────
  let hourlyRunning = false
  intervals.push(
    setInterval(async () => {
      if (hourlyRunning) return
      hourlyRunning = true
      try {
        await runHourlyRefresh()
      } catch (e) {
        log.error('refresh', 'Error in hourlyRefresh', e)
      } finally {
        hourlyRunning = false
      }
    }, 60 * 60 * 1000),
  )

  // ── 3. Intent matcher (every 6 hours, start after 60s) ────────────────────
  let intentRunning = false
  setTimeout(() => {
    runIntentMatcher(db).catch((err) => log.error('intent', 'Startup error', err))
    intervals.push(
      setInterval(async () => {
        if (intentRunning) return
        intentRunning = true
        try {
          await runIntentMatcher(db)
        } catch (e) {
          log.error('intent', 'Error in intentMatcher', e)
        } finally {
          intentRunning = false
        }
      }, 6 * 60 * 60 * 1000),
    )
  }, 60_000)

  // ── 4. Outcome matcher (every 6 hours, start after 90s) ───────────────────
  let outcomeRunning = false
  setTimeout(() => {
    runOutcomeMatcher(db).catch((err) => log.error('outcome', 'Startup error', err))
    intervals.push(
      setInterval(async () => {
        if (outcomeRunning) return
        outcomeRunning = true
        try {
          await runOutcomeMatcher(db)
        } catch (e) {
          log.error('outcome', 'Error in outcomeMatcher', e)
        } finally {
          outcomeRunning = false
        }
      }, 6 * 60 * 60 * 1000),
    )
  }, 90_000)

  // ── 5. Anomaly detector (every 15 min) ─────────────────────────────────────
  let anomalyRunning = false
  intervals.push(
    setInterval(async () => {
      if (anomalyRunning) return
      anomalyRunning = true
      try {
        await runAnomalyDetector(db)
      } catch (e) {
        log.error('anomaly', 'Error in anomalyDetector', e)
      } finally {
        anomalyRunning = false
      }
    }, 15 * 60 * 1000),
  )

  // ── 6. Enhanced Sybil monitoring (every 5 min) ────────────────────────────
  let sybilRunning = false
  intervals.push(
    setInterval(async () => {
      if (sybilRunning) return
      sybilRunning = true
      try {
        await runSybilMonitor(db)
      } catch (e) {
        log.error('sybil', 'Error in sybilMonitor', e)
      } finally {
        sybilRunning = false
      }
    }, 5 * 60 * 1000),
  )

  // ── 7. Daily aggregator + GitHub re-verification (check every hour, run once per day) ──
  let lastAggDate = getIndexerState('last_agg_date') ?? ''
  let dailyRunning = false
  intervals.push(
    setInterval(async () => {
      if (dailyRunning) return
      dailyRunning = true
      try {
        const today = new Date().toISOString().split('T')[0]!
        if (today !== lastAggDate) {
          await runDailyAggregator(db)
          await runGithubReverify()
          lastAggDate = today
          setIndexerState('last_agg_date', today)
        }
      } catch (e) {
        log.error('daily', 'Error in dailyAggregator', e)
      } finally {
        dailyRunning = false
      }
    }, 60 * 60 * 1000),
  )

  log.info('jobs', 'All background processes registered')

  // Expose jobStats for health route (module-level singleton, already imported)
  void jobStats
})

export default app
