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
import { responseHeadersMiddleware } from './middleware/responseHeaders.js'
import { queryLoggerMiddleware } from './middleware/queryLogger.js'
import { freeTierMiddleware } from './middleware/freeTier.js'
import { startBlockchainIndexer, stopBlockchainIndexer } from './jobs/blockchainIndexer.js'
import { getExpiredWallets } from './db.js'
import { getOrCalculateScore } from './scoring/engine.js'
import type { Address } from './types.js'

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

// ---------- Background Job — hourly score refresh ----------

const REFRESH_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const REFRESH_BATCH_SIZE = 10 // refresh at most N wallets per tick to avoid RPC flooding

async function refreshExpiredScores(): Promise<void> {
  const expired = getExpiredWallets()
  if (expired.length === 0) return

  console.log(`[refresh] ${expired.length} expired score(s) to refresh`)
  const batch = expired.slice(0, REFRESH_BATCH_SIZE)

  for (const wallet of batch) {
    try {
      await getOrCalculateScore(wallet as Address, true)
      console.log(`[refresh] refreshed ${wallet}`)
    } catch (err) {
      console.error(`[refresh] failed for ${wallet}:`, err)
    }
    // Small delay between wallets to be polite to the RPC
    await new Promise((res) => setTimeout(res, 500))
  }
}

// Start background refresh job
const refreshInterval = setInterval(() => {
  refreshExpiredScores().catch((err) => console.error('[refresh] job error:', err))
}, REFRESH_INTERVAL_MS)

// Graceful shutdown
function shutdown() {
  console.log('\n[server] Shutting down…')
  clearInterval(refreshInterval)
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

  // Start blockchain indexer as a non-blocking background process
  startBlockchainIndexer().catch((err) =>
    console.error('[indexer] fatal error, stopped:', err),
  )
})

export default app
