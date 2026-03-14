import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { buildPublicUrl, getSupportEmail } from '../config/public.js'
import { leaderboardHtml, privacyContent, tosContent, wrapHtml } from '../templates/legal.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const indexHtmlTemplate = readFileSync(join(__dirname, '../../index.html'), 'utf8')

const legal = new Hono()

function renderLandingPageHtml(): string {
  return indexHtmlTemplate
    .replaceAll('__DJD_PUBLIC_BASE_URL__', buildPublicUrl())
    .replaceAll('__DJD_SUPPORT_EMAIL__', getSupportEmail())
}

legal.get('/', (c) => c.html(renderLandingPageHtml()))

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
      'Allow: /certify\n' +
      'Allow: /directory\n' +
      'Allow: /docs\n' +
      'Allow: /methodology\n' +
      'Allow: /pricing\n' +
      'Allow: /blog\n' +
      'Disallow: /admin\n' +
      'Disallow: /metrics\n' +
      'Disallow: /stripe\n' +
      'Disallow: /portal\n' +
      'Disallow: /reviewer\n' +
      '\n' +
      `Sitemap: ${buildPublicUrl('/openapi.json')}\n`,
  )
})

// ── /.well-known/agent.json — AI agent discovery ────────────────────
legal.get('/.well-known/agent.json', (c) => {
  c.header('Cache-Control', 'public, max-age=3600')
  const publicBaseUrl = buildPublicUrl()
  return c.json({
    name: 'DJD Agent Score',
    description:
      'On-chain trust scoring and certification surfaces for autonomous AI agents on Base L2. Score any wallet, inspect certified agents, and evaluate settlement readiness before transacting.',
    url: publicBaseUrl,
    docs: buildPublicUrl('/docs'),
    openapi: buildPublicUrl('/openapi.json'),
    mcp: {
      npm: 'djd-agent-score-mcp',
      description: 'MCP server for AI agents to query wallet trust scores',
    },
    capabilities: [
      'trust-scoring',
      'certified-directory',
      'erc-8004-compatibility',
      'erc-8183-evaluator-prototype',
      'sybil-detection',
      'fraud-reporting',
      'trust-assessment',
    ],
    payment: {
      protocol: 'x402',
      network: 'eip155:8453',
      currency: 'USDC',
      discovery: buildPublicUrl('/.well-known/x402'),
    },
  })
})

export default legal
