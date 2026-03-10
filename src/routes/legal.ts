import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { leaderboardHtml, privacyContent, tosContent, wrapHtml } from '../templates/legal.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const indexHtml = readFileSync(join(__dirname, '../../index.html'), 'utf8')

const legal = new Hono()

legal.get('/', (c) => c.html(indexHtml))

legal.get('/leaderboard', (c) => c.html(leaderboardHtml))

legal.get('/terms', (c) => {
  return c.html(wrapHtml('Terms of Service', tosContent))
})

legal.get('/privacy', (c) => {
  return c.html(wrapHtml('Privacy Policy', privacyContent))
})

// ── robots.txt ──────────────────────────────────────────────────────
legal.get('/robots.txt', (c) => {
  c.header('Content-Type', 'text/plain')
  c.header('Cache-Control', 'public, max-age=86400')
  return c.body(
    'User-agent: *\n' +
      'Allow: /\n' +
      'Allow: /docs\n' +
      'Allow: /methodology\n' +
      'Allow: /pricing\n' +
      'Allow: /blog\n' +
      'Disallow: /admin\n' +
      'Disallow: /metrics\n' +
      'Disallow: /stripe\n' +
      'Disallow: /portal\n' +
      '\n' +
      'Sitemap: https://djdagentscore.dev/openapi.json\n',
  )
})

// ── /.well-known/agent.json — AI agent discovery ────────────────────
legal.get('/.well-known/agent.json', (c) => {
  c.header('Cache-Control', 'public, max-age=3600')
  return c.json({
    name: 'DJD Agent Score',
    description:
      'On-chain reputation scoring for autonomous AI agents on Base L2. Score any wallet 0-100 across 5 dimensions before transacting.',
    url: 'https://djdagentscore.dev',
    docs: 'https://djdagentscore.dev/docs',
    openapi: 'https://djdagentscore.dev/openapi.json',
    mcp: {
      npm: 'djd-agent-score-mcp',
      description: 'MCP server for AI agents to query wallet trust scores',
    },
    capabilities: ['reputation-scoring', 'sybil-detection', 'fraud-reporting', 'trust-assessment'],
    payment: {
      protocol: 'x402',
      network: 'eip155:8453',
      currency: 'USDC',
      discovery: 'https://djdagentscore.dev/.well-known/x402',
    },
  })
})

export default legal
