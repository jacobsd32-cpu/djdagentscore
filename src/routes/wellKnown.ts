/**
 * .well-known/x402 — Discovery document for x402-capable agents.
 *
 * Any agent crawling a domain for x402-enabled services will check
 * `/.well-known/x402` first. This returns a machine-readable manifest
 * of every paid endpoint, its pricing, input schema, and capabilities.
 *
 * Spec: https://x402.org/docs/discovery
 */

import { Hono } from 'hono'
import { ENDPOINT_PRICING } from '../config/constants.js'

const wellKnown = new Hono()

wellKnown.get('/', (c) => {
  const baseUrl = new URL(c.req.url).origin

  return c.json({
    x402: {
      version: '1.0',
      network: 'eip155:8453',
      facilitator: process.env.FACILITATOR_URL ?? 'https://x402.org/facilitator',
      currency: 'USDC',
    },
    service: {
      name: 'DJD Agent Score',
      description:
        'On-chain reputation scoring for autonomous AI agents on Base. ' +
        'Score any wallet before sending money — detect sybil attacks, wash trading, and gaming.',
      version: '2.5.0',
      docs: `${baseUrl}/docs`,
      openapi: `${baseUrl}/openapi.json`,
    },
    endpoints: [
      {
        path: '/v1/score/basic',
        method: 'GET',
        price: 0,
        description: 'Free basic score (0–100) with tier and recommendation. 10/day per IP.',
        input: { query: { wallet: { type: 'string', required: true, description: 'Ethereum wallet address' } } },
        output: { example: { wallet: '0x…', score: 78, tier: 'Established', recommendation: 'transact' } },
      },
      {
        path: '/v1/score/full',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/score/full'],
        description: 'Full score with 6-dimension breakdown, sybil/gaming flags, confidence, and explainability.',
        input: { query: { wallet: { type: 'string', required: true } } },
      },
      {
        path: '/v1/score/refresh',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/score/refresh'],
        description: 'Force live recalculation from latest on-chain data.',
        input: { query: { wallet: { type: 'string', required: true } } },
      },
      {
        path: '/v1/score/batch',
        method: 'POST',
        price: ENDPOINT_PRICING['/v1/score/batch'],
        description: 'Batch score up to 20 wallets in a single request.',
        input: { body: { wallets: { type: 'array', items: 'string', maxItems: 20 } } },
      },
      {
        path: '/v1/score/history',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/score/history'],
        description: 'Historical scores with trend analysis and trajectory.',
        input: { query: { wallet: { type: 'string', required: true }, limit: { type: 'integer' } } },
      },
      {
        path: '/v1/report',
        method: 'POST',
        price: ENDPOINT_PRICING['/v1/report'],
        description: 'Submit a fraud report against a wallet.',
        input: { body: { target: { type: 'string' }, reason: { type: 'string' }, details: { type: 'string' } } },
      },
      {
        path: '/v1/data/fraud/blacklist',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/data/fraud/blacklist'],
        description: 'Check if a wallet has fraud reports filed against it.',
        input: { query: { wallet: { type: 'string', required: true } } },
      },
    ],
    integration: {
      npm: {
        client: 'djd-agent-score-client',
        middleware: 'x402-agent-score',
      },
      quickstart: `curl "${baseUrl}/v1/score/basic?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"`,
    },
  })
})

export default wellKnown
