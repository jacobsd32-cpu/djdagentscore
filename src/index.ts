import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { paymentMiddleware, type Network } from 'x402-hono'

import healthRoute from './routes/health.js'
import scoreRoute from './routes/score.js'
import reportRoute from './routes/report.js'
import leaderboardRoute from './routes/leaderboard.js'
import blacklistRoute from './routes/blacklist.js'
import legal from './routes/legal.js'
import { responseHeadersMiddleware } from './middleware/responseHeaders.js'
import { queryLoggerMiddleware } from './middleware/queryLogger.js'
import { freeTierMiddleware } from './middleware/freeTier.js'
import { startBlockchainIndexer, stopBlockchainIndexer } from './jobs/blockchainIndexer.js'
import { runHourlyRefresh } from './jobs/scoreRefresh.js'
import { runIntentMatcher } from './jobs/intentMatcher.js'
import { runOutcomeMatcher } from './jobs/outcomeMatcher.js'
import { runAnomalyDetector, runSybilMonitor } from './jobs/anomalyDetector.js'
import { runDailyAggregator } from './jobs/dailyAggregator.js'
import { jobStats } from './jobs/jobStats.js'
import { db } from './db.js'

// ---------- Config ----------

const PORT = Number(process.env.PORT ?? 3000)
const PAY_TO = (process.env.PAY_TO ?? '0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528') as `0x${string}`
const FACILITATOR_URL = (
  process.env.FACILITATOR_URL ?? 'https://facilitator.openx402.ai'
) as `${string}://${string}`
const NETWORK: Network = 'base'

// ---------- App ----------

const app = new Hono()

// ---------- Global middleware (registration order = execution order) ----------

app.use('*', logger())
app.use('*', cors())
app.use('*', responseHeadersMiddleware)  // adds X-DJD-* headers to every response
app.use('*', queryLoggerMiddleware)       // logs every request post-response

// ---------- Free tier — MUST be registered before x402 ----------
// Serves /v1/score/basic for free (up to 10/day per requester) by short-circuiting the chain.

app.use('/v1/score/basic', freeTierMiddleware)

// ---------- Free routes (no payment required) ----------
// Must be mounted before paymentMiddleware.

app.route('/', legal)

// ---------- x402 Payment Middleware ----------
// Protects paid endpoints. Free endpoints (leaderboard, health) are not listed so they pass through.

app.use(
  paymentMiddleware(
    PAY_TO,
    {
      '/v1/score/basic': {
        price: '$0.03',
        network: NETWORK,
        config: { description: 'Basic agent score lookup ($0.03 USDC)' },
      },
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

// 404 handler
app.notFound((c) => c.json({ error: 'Not found' }, 404))

// Global error handler
app.onError((err, c) => {
  console.error('[error]', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// ---------- Graceful shutdown ----------

const intervals: ReturnType<typeof setInterval>[] = []

function shutdown() {
  console.log('\n[server] Shutting down…')
  for (const id of intervals) clearInterval(id)
  stopBlockchainIndexer()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// ---------- Start ----------

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] DJD Agent Score API running on http://localhost:${info.port}`)
  console.log(`[server] payTo: ${PAY_TO}`)
  console.log(`[server] facilitator: ${FACILITATOR_URL}`)

  console.log('[jobs] Starting background processes...')

  // ── 1. Blockchain indexer (continuous) ─────────────────────────────────────
  startBlockchainIndexer().catch((err) =>
    console.error('[indexer] fatal error, stopped:', err),
  )

  // ── 2. Hourly score refresh + wallet snapshots + economy metrics ───────────
  intervals.push(
    setInterval(
      () => runHourlyRefresh().catch((err) => console.error('[refresh] job error:', err)),
      60 * 60 * 1000,
    ),
  )

  // ── 3. Intent matcher (every 6 hours, start after 60s) ────────────────────
  setTimeout(() => {
    runIntentMatcher(db).catch((err) => console.error('[intent] startup error:', err))
    intervals.push(
      setInterval(
        () => runIntentMatcher(db).catch((err) => console.error('[intent] job error:', err)),
        6 * 60 * 60 * 1000,
      ),
    )
  }, 60_000)

  // ── 4. Outcome matcher (every 6 hours, start after 90s) ───────────────────
  setTimeout(() => {
    runOutcomeMatcher(db).catch((err) => console.error('[outcome] startup error:', err))
    intervals.push(
      setInterval(
        () => runOutcomeMatcher(db).catch((err) => console.error('[outcome] job error:', err)),
        6 * 60 * 60 * 1000,
      ),
    )
  }, 90_000)

  // ── 5. Anomaly detector (every 15 min) ─────────────────────────────────────
  intervals.push(
    setInterval(
      () => runAnomalyDetector(db).catch((err) => console.error('[anomaly] job error:', err)),
      15 * 60 * 1000,
    ),
  )

  // ── 6. Enhanced Sybil monitoring (every 5 min) ────────────────────────────
  intervals.push(
    setInterval(
      () => runSybilMonitor(db).catch((err) => console.error('[sybil-monitor] job error:', err)),
      5 * 60 * 1000,
    ),
  )

  // ── 7. Daily aggregator (check every hour, run once per day) ─────────────
  let lastAggDate = ''
  intervals.push(
    setInterval(
      async () => {
        const today = new Date().toISOString().split('T')[0]!
        if (today !== lastAggDate) {
          await runDailyAggregator(db).catch((err) => console.error('[daily] job error:', err))
          lastAggDate = today
        }
      },
      60 * 60 * 1000,
    ),
  )

  console.log('[jobs] All background processes registered')

  // Expose jobStats for health route (module-level singleton, already imported)
  void jobStats
})

export default app
