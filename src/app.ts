import { HTTPFacilitatorClient } from '@x402/core/server'
import type { Network } from '@x402/core/types'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { declareDiscoveryExtension } from '@x402/extensions/bazaar'
import { paymentMiddlewareFromConfig } from '@x402/hono'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

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
import agentRoute from './routes/agent.js'
import analyticsRoute from './routes/analytics.js'
import apiKeysRoute from './routes/apiKeys.js'
import badgeRoute from './routes/badge.js'
import billingRoute from './routes/billing.js'
import blacklistRoute from './routes/blacklist.js'
import blogRoute from './routes/blog.js'
import certificationRoute from './routes/certification.js'
import docsRoute from './routes/docs.js'
import economyRoute from './routes/economy.js'
import explorerRoute from './routes/explorer.js'
import forensicsRoute from './routes/forensics.js'
import healthRoute from './routes/health.js'
import historyRoute from './routes/history.js'
import leaderboardRoute from './routes/leaderboard.js'
import legal from './routes/legal.js'
import methodologyRoute from './routes/methodology.js'
import metricsRoute from './routes/metrics.js'
import monitoringRoute from './routes/monitoring.js'
import openapiRoute from './routes/openapi.js'
import portalRoute from './routes/portal.js'
import pricingRoute from './routes/pricing.js'
import registerRoute from './routes/register.js'
import reportRoute from './routes/report.js'
import scoreRoute from './routes/score.js'
import stripeWebhookRoute from './routes/stripeWebhook.js'
import { adminWebhooks, publicWebhooks } from './routes/webhooks.js'
import wellKnownRoute from './routes/wellKnown.js'
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
app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : process.env.NODE_ENV === 'production'
        ? []
        : ['*'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'x-payment', 'x-djd-client'],
  }),
)

// Stripe signature verification requires access to the raw request body.
app.route('/stripe/webhook', stripeWebhookRoute)

app.use(
  '*',
  bodyLimit({
    maxSize: API_CONFIG.MAX_BODY_SIZE,
    onError: (c) => c.json(errorResponse('body_too_large', 'Request body too large'), 413),
  }),
)
app.use('*', responseHeadersMiddleware)
app.use('*', queryLoggerMiddleware)

app.use('/v1/*', apiKeyAuthMiddleware)
app.use('/v1/score/basic', freeTierMiddleware)

app.route('/', legal)
app.route('/v1/analytics', analyticsRoute)
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
      description:
        'Full agent reputation score with dimension breakdown — behavioral scoring for autonomous AI agents on Base',
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
              reason: {
                type: 'string',
                description: 'Report reason: wash_trading | sybil_attack | rug_pull | spam | other',
              },
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
    '/v1/forensics/summary': {
      accepts: [payment(ENDPOINT_PRICING['/v1/forensics/summary'])],
      description: 'DJD Forensics overview for a wallet: report counts, penalty totals, and recent incidents',
      extensions: {
        ...declareDiscoveryExtension({
          input: { wallet: '0x1234567890abcdef1234567890abcdef12345678' },
          inputSchema: {
            properties: { wallet: { type: 'string', description: 'Wallet address to inspect' } },
            required: ['wallet'],
          },
          output: {
            example: {
              wallet: '0x1234...',
              risk_level: 'watch',
              report_count: 1,
              total_penalty_applied: 5,
              most_recent_report_at: '2026-02-25T12:00:00Z',
            },
          },
        }),
      },
    },
    '/v1/forensics/dispute': {
      accepts: [payment(ENDPOINT_PRICING['/v1/forensics/dispute'])],
      description: 'Open a dispute for a fraud report as the reported wallet',
      extensions: {
        ...declareDiscoveryExtension({
          bodyType: 'json',
          input: {
            report_id: 'fraud_abc123',
            reason: 'fulfilled_service',
            details: 'The paid task was delivered and logs were shared with the buyer.',
          },
          inputSchema: {
            properties: {
              report_id: { type: 'string', description: 'Fraud report ID from the DJD Forensics reports feed' },
              reason: {
                type: 'string',
                description:
                  'Dispute reason: fulfilled_service | mistaken_identity | resolved_offchain | inaccurate_report | other',
              },
              details: { type: 'string', description: 'Evidence or explanation supporting the dispute' },
            },
            required: ['report_id', 'reason', 'details'],
          },
          output: {
            example: {
              disputeId: 'disp_abc123',
              status: 'open',
              reportId: 'fraud_abc123',
              targetWallet: '0x1234...',
            },
          },
        }),
      },
    },
    '/v1/forensics/feed': {
      accepts: [payment(ENDPOINT_PRICING['/v1/forensics/feed'])],
      description: 'DJD Forensics incident feed of recent fraud reports across the network',
      extensions: {
        ...declareDiscoveryExtension({
          input: { reason: 'payment_fraud', limit: 25 },
          inputSchema: {
            properties: {
              reason: { type: 'string', description: 'Optional report reason filter' },
              limit: { type: 'integer', description: 'Max incidents to return (default 50)' },
              after: { type: 'string', description: 'ISO date filter start' },
              before: { type: 'string', description: 'ISO date filter end' },
            },
          },
          output: {
            example: {
              incidents: [
                {
                  report_id: 'fraud_abc123',
                  wallet: '0x1234...',
                  reason: 'payment_fraud',
                  risk_level: 'elevated',
                  report_count: 3,
                },
              ],
              count: 42,
              returned: 1,
            },
          },
        }),
      },
    },
    '/v1/forensics/watchlist': {
      accepts: [payment(ENDPOINT_PRICING['/v1/forensics/watchlist'])],
      description: 'DJD Forensics watchlist of the most-reported wallets across the network',
      extensions: {
        ...declareDiscoveryExtension({
          input: { limit: 25 },
          inputSchema: {
            properties: {
              limit: { type: 'integer', description: 'Max wallets to return (default 50)' },
              after: { type: 'string', description: 'ISO date filter start' },
              before: { type: 'string', description: 'ISO date filter end' },
            },
          },
          output: {
            example: {
              wallets: [
                {
                  rank: 1,
                  wallet: '0x1234...',
                  risk_level: 'critical',
                  report_count: 5,
                  unique_reporters: 4,
                  total_penalty_applied: 25,
                },
              ],
              count: 12,
              returned: 1,
            },
          },
        }),
      },
    },
    '/v1/forensics/reports': {
      accepts: [payment(ENDPOINT_PRICING['/v1/forensics/reports'])],
      description: 'DJD Forensics incident feed with raw fraud-report details for a wallet',
      extensions: {
        ...declareDiscoveryExtension({
          input: { wallet: '0x1234567890abcdef1234567890abcdef12345678', limit: 25 },
          inputSchema: {
            properties: {
              wallet: { type: 'string', description: 'Wallet address to inspect' },
              limit: { type: 'integer', description: 'Max reports to return (default 50)' },
              after: { type: 'string', description: 'ISO date filter start' },
              before: { type: 'string', description: 'ISO date filter end' },
            },
            required: ['wallet'],
          },
          output: {
            example: {
              wallet: '0x1234...',
              reports: [
                {
                  report_id: 'fraud_abc123',
                  reason: 'payment_fraud',
                  details: 'Counterparty collected payment and never delivered.',
                  created_at: '2026-02-25T12:00:00Z',
                  penalty_applied: 5,
                },
              ],
              count: 3,
              returned: 1,
            },
          },
        }),
      },
    },
    '/v1/forensics/timeline': {
      accepts: [payment(ENDPOINT_PRICING['/v1/forensics/timeline'])],
      description: 'Merged score-history and fraud-incident timeline for a wallet',
      extensions: {
        ...declareDiscoveryExtension({
          input: { wallet: '0x1234567890abcdef1234567890abcdef12345678', limit: 25 },
          inputSchema: {
            properties: {
              wallet: { type: 'string', description: 'Wallet address to inspect' },
              limit: { type: 'integer', description: 'Max combined events to return (default 50)' },
              after: { type: 'string', description: 'ISO date filter start' },
              before: { type: 'string', description: 'ISO date filter end' },
            },
            required: ['wallet'],
          },
          output: {
            example: {
              wallet: '0x1234...',
              events: [
                {
                  type: 'fraud_report',
                  timestamp: '2026-02-25T12:00:00Z',
                  reason: 'payment_fraud',
                  penalty_applied: 5,
                },
                { type: 'score_snapshot', timestamp: '2026-02-24T12:00:00Z', score: 72, confidence: 0.84 },
              ],
              breakdown: { score_snapshots: 8, fraud_reports: 1 },
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
            example: {
              certificationId: 'cert_abc123',
              tier: 'gold',
              expiresAt: '2027-02-25',
              badgeUrl: '/v1/badge/0x1234...',
            },
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
  '/v1/forensics/summary',
  '/v1/forensics/dispute',
  '/v1/forensics/feed',
  '/v1/forensics/watchlist',
  '/v1/forensics/reports',
  '/v1/forensics/timeline',
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
app.use('/v1/forensics/*', paidRateLimitMiddleware)

app.route('/health', healthRoute)
app.route('/v1/score/history', historyRoute)
app.route('/v1/score', scoreRoute)
app.route('/v1/report', reportRoute)
app.route('/v1/monitor', monitoringRoute)
app.route('/v1/forensics', forensicsRoute)
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
