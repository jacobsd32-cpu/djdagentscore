import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPFacilitatorClient } from '@x402/core/server'
import type { Network } from '@x402/core/types'
import { declareDiscoveryExtension } from '@x402/extensions/bazaar'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { paymentMiddlewareFromConfig } from '@x402/hono'

import { initStripe } from './billing/stripeClient.js'
import { API_CONFIG, ENDPOINT_PRICING } from './config/constants.js'
import { assertEnv, warnMissingGithubToken } from './config/env.js'
import { initBillingPlans } from './config/plans.js'
import { db } from './db.js'
import { AppError, errorResponse } from './errors.js'
import { log } from './logger.js'
import { apiKeyAuthMiddleware } from './middleware/apiKeyAuth.js'
import { freeTierMiddleware } from './middleware/freeTier.js'
import { paidRateLimitMiddleware } from './middleware/paidRateLimit.js'
import { queryLoggerMiddleware } from './middleware/queryLogger.js'
import { requestIdMiddleware } from './middleware/requestId.js'
import { responseHeadersMiddleware } from './middleware/responseHeaders.js'
import admin from './routes/admin.js'
import apiKeysRoute from './routes/apiKeys.js'
import agentRoute from './routes/agent.js'
import badgeRoute from './routes/badge.js'
import billingRoute from './routes/billing.js'
import blacklistRoute from './routes/blacklist.js'
import blogRoute from './routes/blog.js'
import certificationRoute from './routes/certification.js'
import docsRoute from './routes/docs.js'
import economyRoute from './routes/economy.js'
import explorerRoute from './routes/explorer.js'
import healthRoute from './routes/health.js'
import historyRoute from './routes/history.js'
import legal from './routes/legal.js'
import leaderboardRoute from './routes/leaderboard.js'
import methodologyRoute from './routes/methodology.js'
import metricsRoute from './routes/metrics.js'
import openapiRoute from './routes/openapi.js'
import portalRoute from './routes/portal.js'
import pricingRoute from './routes/pricing.js'
import registerRoute from './routes/register.js'
import reportRoute from './routes/report.js'
import scoreRoute from './routes/score.js'
import stripeWebhookRoute from './routes/stripeWebhook.js'
import wellKnownRoute from './routes/wellKnown.js'
import { adminWebhooks, publicWebhooks } from './routes/webhooks.js'
import type { AppEnv } from './types/hono-env.js'

export const PORT = Number(process.env.PORT ?? API_CONFIG.DEFAULT_PORT)
export const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'https://x402.org/facilitator'
export const NETWORK: Network = 'eip155:8453'

export const PAY_TO = (() => {
  const payTo = assertEnv('PAY_TO') as `0x${string}`
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
    throw new Error('PAY_TO must be a valid Ethereum address')
  }
  return payTo
})()

if (process.env.NODE_ENV === 'production') {
  assertEnv('ADMIN_KEY', { minLength: 32 })
  assertEnv('CORS_ORIGINS')
}

warnMissingGithubToken()
initStripe()
initBillingPlans()

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL })
const app = new Hono<AppEnv>()

app.use('*', requestIdMiddleware)
app.use('*', logger())
app.use('*', cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : process.env.NODE_ENV === 'production'
      ? []
      : ['*'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
}))

// Stripe signature verification requires access to the raw request body.
app.route('/stripe/webhook', stripeWebhookRoute)

app.use('*', bodyLimit({
  maxSize: API_CONFIG.MAX_BODY_SIZE,
  onError: (c) => c.json(errorResponse('body_too_large', 'Request body too large'), 413),
}))
app.use('*', responseHeadersMiddleware)
app.use('*', queryLoggerMiddleware)

app.use('/v1/*', apiKeyAuthMiddleware)
app.use('/v1/score/basic', freeTierMiddleware)

app.route('/', legal)
app.route('/v1/agent/register', registerRoute)
app.route('/v1/badge', badgeRoute)
app.route('/explorer', explorerRoute)
app.route('/blog', blogRoute)
app.route('/agent', agentRoute)
app.route('/openapi.json', openapiRoute)
app.route('/v1/data/economy', economyRoute)
app.route('/docs', docsRoute)
app.route('/metrics', metricsRoute)
app.route('/billing', billingRoute)
app.route('/portal', portalRoute)
app.route('/pricing', pricingRoute)
app.route('/methodology', methodologyRoute)
app.route('/.well-known/x402', wellKnownRoute)

const payment = (price: number) => ({
  scheme: 'exact',
  payTo: PAY_TO,
  price: `$${price.toFixed(2)}`,
  network: NETWORK,
})

let x402Ready = true
process.on('unhandledRejection', (err: unknown) => {
  if (err instanceof Error && err.constructor.name === 'RouteConfigurationError') {
    x402Ready = false
    log.warn('x402', `Facilitator init failed — paid endpoints will return 503: ${err.message}`)
    return
  }
  throw err
})

const x402Middleware = paymentMiddlewareFromConfig(
  {
    '/v1/score/full': {
      accepts: [payment(ENDPOINT_PRICING['/v1/score/full'])],
      description: 'Full agent reputation score with dimension breakdown — behavioral scoring for autonomous AI agents on Base',
      extensions: {
        ...declareDiscoveryExtension({
          input: { wallet: '0x1234567890abcdef1234567890abcdef12345678' },
          inputSchema: {
            properties: { wallet: { type: 'string', description: 'Ethereum wallet address to score' } },
            required: ['wallet'],
          },
          output: {
            example: {
              wallet: '0x1234...',
              score: 78,
              tier: 'good',
              confidence: 0.85,
              recommendation: 'transact',
              dimensions: {
                transactionHistory: 85,
                partnerDiversity: 72,
                volumeConsistency: 80,
                accountAge: 90,
                sybilRisk: 15,
                gamingRisk: 10,
              },
            },
          },
        }),
      },
    },
    '/v1/score/refresh': {
      accepts: [payment(ENDPOINT_PRICING['/v1/score/refresh'])],
      description: 'Force live recalculation of agent reputation score from on-chain data',
      extensions: {
        ...declareDiscoveryExtension({
          input: { wallet: '0x1234567890abcdef1234567890abcdef12345678' },
          inputSchema: {
            properties: { wallet: { type: 'string', description: 'Wallet address to rescore' } },
            required: ['wallet'],
          },
          output: {
            example: { wallet: '0x1234...', score: 78, tier: 'good', confidence: 0.85, scoreFreshness: 'live' },
          },
        }),
      },
    },
    '/v1/report': {
      accepts: [payment(ENDPOINT_PRICING['/v1/report'])],
      description: 'Submit a fraud or misconduct report against an agent wallet',
      extensions: {
        ...declareDiscoveryExtension({
          bodyType: 'json',
          input: { target: '0x1234...', reason: 'wash_trading', details: 'Suspicious circular transactions' },
          inputSchema: {
            properties: {
              target: { type: 'string', description: 'Wallet address to report' },
              reason: { type: 'string', description: 'Report reason: wash_trading | sybil_attack | rug_pull | spam | other' },
              details: { type: 'string', description: 'Description of suspicious behavior' },
            },
            required: ['target', 'reason', 'details'],
          },
          output: { example: { reportId: 'rpt_abc123', status: 'accepted' } },
        }),
      },
    },
    '/v1/data/fraud/blacklist': {
      accepts: [payment(ENDPOINT_PRICING['/v1/data/fraud/blacklist'])],
      description: 'Check if a wallet has fraud reports filed against it',
      extensions: {
        ...declareDiscoveryExtension({
          input: { wallet: '0x1234567890abcdef1234567890abcdef12345678' },
          inputSchema: {
            properties: { wallet: { type: 'string', description: 'Wallet address to check' } },
            required: ['wallet'],
          },
          output: {
            example: { wallet: '0x1234...', reported: false, reportCount: 0, reasons: [], disputeStatus: 'none' },
          },
        }),
      },
    },
    '/v1/score/batch': {
      accepts: [payment(ENDPOINT_PRICING['/v1/score/batch'])],
      description: 'Batch score up to 20 agent wallets in a single request',
      extensions: {
        ...declareDiscoveryExtension({
          bodyType: 'json',
          input: { wallets: ['0x1234...', '0xabcd...'] },
          inputSchema: {
            properties: {
              wallets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of wallet addresses (max 20)',
              },
            },
            required: ['wallets'],
          },
          output: {
            example: { results: [{ wallet: '0x1234...', score: 78, tier: 'good' }], count: 1 },
          },
        }),
      },
    },
    '/v1/score/history': {
      accepts: [payment(ENDPOINT_PRICING['/v1/score/history'])],
      description: 'Historical score data with trend analysis for an agent wallet',
      extensions: {
        ...declareDiscoveryExtension({
          input: { wallet: '0x1234567890abcdef1234567890abcdef12345678' },
          inputSchema: {
            properties: {
              wallet: { type: 'string', description: 'Wallet address' },
              limit: { type: 'integer', description: 'Max records (default 50)' },
              after: { type: 'string', description: 'ISO date filter start' },
              before: { type: 'string', description: 'ISO date filter end' },
            },
            required: ['wallet'],
          },
          output: {
            example: {
              wallet: '0x1234...',
              history: [{ score: 78, calculated_at: '2026-02-25T12:00:00Z' }],
              trend: { direction: 'improving', change_pct: 5.2, avg_score: 75 },
            },
          },
        }),
      },
    },
    '/v1/certification/apply': {
      accepts: [payment(ENDPOINT_PRICING['/v1/certification/apply'])],
      description: 'Apply for annual DJD Certified Agent badge — verified on-chain reputation',
      extensions: {
        ...declareDiscoveryExtension({
          bodyType: 'json',
          input: { wallet: '0x1234567890abcdef1234567890abcdef12345678' },
          inputSchema: {
            properties: { wallet: { type: 'string', description: 'Wallet to certify' } },
            required: ['wallet'],
          },
          output: {
            example: { certificationId: 'cert_abc123', tier: 'gold', expiresAt: '2027-02-25', badgeUrl: '/v1/badge/0x1234...' },
          },
        }),
      },
    },
  },
  facilitatorClient,
  [{ network: NETWORK, server: new ExactEvmScheme() }],
)

const PAID_ROUTES = new Set([
  '/v1/score/full',
  '/v1/score/refresh',
  '/v1/report',
  '/v1/data/fraud/blacklist',
  '/v1/score/batch',
  '/v1/score/history',
  '/v1/certification/apply',
])

app.use(async (c, next) => {
  if (c.get('apiKeyId')) {
    await next()
    return
  }

  if (!x402Ready) {
    if (PAID_ROUTES.has(c.req.path)) {
      return c.json({ error: 'Payment service temporarily unavailable' }, 503)
    }
    await next()
    return
  }

  return x402Middleware(c, next)
})

app.use('/v1/score/*', paidRateLimitMiddleware)
app.use('/v1/report', paidRateLimitMiddleware)
app.use('/v1/data/fraud/*', paidRateLimitMiddleware)

app.route('/health', healthRoute)
app.route('/v1/score/history', historyRoute)
app.route('/v1/score', scoreRoute)
app.route('/v1/report', reportRoute)
app.route('/v1/leaderboard', leaderboardRoute)
app.route('/v1/data/fraud/blacklist', blacklistRoute)
app.route('/v1/webhooks', publicWebhooks)
app.route('/v1/certification', certificationRoute)
app.route('/admin', admin)
app.route('/admin/api-keys', apiKeysRoute)
app.route('/admin/webhooks', adminWebhooks)

app.notFound((c) => c.json(errorResponse('not_found', 'Not found'), 404))

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(err.toJSON(), err.statusCode as 400 | 401 | 402 | 403 | 404 | 409 | 429 | 500 | 503)
  }
  log.error('http', 'Unhandled error', err)
  return c.json(errorResponse('internal_error', 'Internal server error'), 500)
})

void db

export default app
