import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENDPOINT_PRICING } from '../config/constants.js'
import { getPublicBaseUrl, getSupportEmail } from '../config/public.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OPENAPI_SPEC_PATH = join(__dirname, '..', '..', 'openapi.json')
const PUBLIC_CACHE_CONTROL = 'public, max-age=3600'
const FALLBACK_SERVICE_VERSION = '2.5.0'
const OPENAPI_SPEC = readFileSync(OPENAPI_SPEC_PATH, 'utf8')
const OPENAPI_DOCUMENT = JSON.parse(OPENAPI_SPEC) as {
  info?: {
    title?: string
    version?: string
    contact?: {
      email?: string
    }
  }
  servers?: Array<{
    url?: string
    description?: string
  }>
}

const SERVICE_TITLE = OPENAPI_DOCUMENT.info?.title ?? 'DJD Agent Score API'
const SERVICE_VERSION = OPENAPI_DOCUMENT.info?.version ?? FALLBACK_SERVICE_VERSION

export function getPublicDiscoveryCacheControl(): string {
  return PUBLIC_CACHE_CONTROL
}

export function getOpenApiSpecView(): string {
  const server = OPENAPI_DOCUMENT.servers?.[0]
  return JSON.stringify(
    {
      ...OPENAPI_DOCUMENT,
      info: {
        ...OPENAPI_DOCUMENT.info,
        contact: {
          ...OPENAPI_DOCUMENT.info?.contact,
          email: getSupportEmail(),
        },
      },
      servers: [
        {
          description: server?.description ?? 'Production',
          url: getPublicBaseUrl(),
        },
      ],
    },
    null,
    2,
  )
}

export function getDocsHtmlView(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DJD Agent Score — API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #1a1a2e; }
    #swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #e94560; }
    .swagger-ui .info .description { color: #c4c4c4; }
    .swagger-ui .scheme-container { background: #16213e; }
    .swagger-ui .opblock-tag { color: #e94560; border-bottom-color: #0f3460; }
    .swagger-ui .opblock .opblock-summary-method { font-weight: bold; }
    .swagger-ui .btn.execute { background-color: #e94560; border-color: #e94560; }
    .swagger-ui .btn.execute:hover { background-color: #c73d54; }
    .swagger-ui select { font-weight: bold; }
    .header-banner {
      background: linear-gradient(135deg, #0f3460, #1a1a2e);
      padding: 2.25rem 2rem 2rem;
      text-align: center;
      border-bottom: 2px solid #e94560;
    }
    .header-banner h1 {
      color: #e94560;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 1.8rem;
      margin: 0 0 0.5rem;
    }
    .header-banner p {
      color: #a6afd0;
      font-family: system-ui, sans-serif;
      margin: 0 auto;
      font-size: 0.95rem;
      line-height: 1.7;
      max-width: 760px;
    }
    .header-banner .badge {
      display: inline-block;
      background: #e94560;
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
      margin-left: 0.5rem;
      vertical-align: middle;
    }
    .header-actions {
      display: flex;
      justify-content: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
    .header-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      padding: 0.7rem 1rem;
      border-radius: 999px;
      border: 1px solid rgba(129, 140, 248, 0.24);
      background: rgba(15, 23, 42, 0.35);
      color: #c7d2fe;
      font-family: system-ui, sans-serif;
      font-size: 0.9rem;
      font-weight: 600;
      text-decoration: none;
    }
    .header-link:hover { color: #ffffff; text-decoration: none; border-color: rgba(129, 140, 248, 0.5); }
    .docs-shell {
      max-width: 1120px;
      margin: 0 auto;
      padding: 2rem;
    }
    .docs-section {
      margin-bottom: 1.5rem;
    }
    .docs-title {
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 0.85rem;
    }
    .docs-copy {
      color: #94a3b8;
      font-family: system-ui, sans-serif;
      font-size: 0.95rem;
      line-height: 1.7;
      margin-bottom: 1rem;
      max-width: 860px;
    }
    .docs-grid {
      display: grid;
      gap: 1rem;
    }
    .docs-grid-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .docs-grid-4 {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .docs-card {
      background: rgba(15, 23, 42, 0.58);
      border: 1px solid rgba(129, 140, 248, 0.16);
      border-radius: 16px;
      padding: 1rem;
      min-height: 170px;
    }
    .docs-kicker {
      color: #818cf8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 0.65rem;
    }
    .docs-card h3 {
      color: #f8fafc;
      font-family: system-ui, sans-serif;
      font-size: 1rem;
      margin: 0 0 0.55rem;
    }
    .docs-card p {
      color: #94a3b8;
      font-family: system-ui, sans-serif;
      font-size: 0.92rem;
      line-height: 1.65;
      margin: 0 0 0.8rem;
    }
    .docs-code {
      display: inline-block;
      padding: 0.45rem 0.65rem;
      border-radius: 10px;
      background: rgba(2, 6, 23, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.14);
      color: #c7d2fe;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.78rem;
      line-height: 1.5;
    }
    @media (max-width: 920px) {
      .docs-grid-3,
      .docs-grid-4 {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <h1>DJD Agent Score <span class="badge">API</span></h1>
    <p>Developer docs for scoring wallets, publishing trust surfaces, and gating payouts or x402 routes. Start with a free lookup, move into API-key or x402 production auth, then add evaluator, Certify, and directory surfaces when trust needs to become visible.</p>
    <div class="header-actions">
      <a class="header-link" href="/pricing">View pricing</a>
      <a class="header-link" href="/directory">Browse directory</a>
      <a class="header-link" href="/certify">Open Certify</a>
    </div>
  </div>
  <div class="docs-shell">
    <section class="docs-section">
      <div class="docs-title">Ship your first DJD integration</div>
      <div class="docs-copy">The simplest path is: screen counterparties in development, choose your production billing path, then add public trust surfaces only when customers or operators need to inspect what your backend already knows.</div>
      <div class="docs-grid docs-grid-3">
        <article class="docs-card">
          <div class="docs-kicker">Step 1</div>
          <h3>Screen counterparties during development</h3>
          <p>Start with the free score endpoint and test real wallet decisions before you change any production flow.</p>
          <div class="docs-code">GET /v1/score/basic?wallet=0x...</div>
        </article>
        <article class="docs-card">
          <div class="docs-kicker">Step 2</div>
          <h3>Add production auth</h3>
          <p>Human teams usually move to a Bearer API key. Autonomous agents can keep paying per request with x402.</p>
          <div class="docs-code">Authorization: Bearer djd_sk_...<br/>X-PAYMENT: &lt;proof&gt;</div>
        </article>
        <article class="docs-card">
          <div class="docs-kicker">Step 3</div>
          <h3>Layer in trust surfaces</h3>
          <p>When the trust decision needs to be inspectable, add evaluator, directory, certification, and standards-facing outputs.</p>
          <div class="docs-code">/v1/score/evaluator<br/>/v1/certification/directory<br/>/v1/score/erc8004</div>
        </article>
      </div>
    </section>
    <section class="docs-section">
      <div class="docs-title">Use DJD when you're building</div>
      <div class="docs-copy">DJD fits best anywhere a wallet can cost you money, fulfillment quality, or customer trust. These are the strongest customer wedges in the product today.</div>
      <div class="docs-grid docs-grid-4">
        <article class="docs-card">
          <div class="docs-kicker">Marketplaces</div>
          <h3>Agent marketplaces</h3>
          <p>Score providers before listing them and link buyers to profiles, badges, and certification surfaces they can inspect.</p>
        </article>
        <article class="docs-card">
          <div class="docs-kicker">Settlement</div>
          <h3>Payout and escrow flows</h3>
          <p>Use score, risk, and evaluator outputs before releasing funds or treating a counterparty as settlement-ready.</p>
        </article>
        <article class="docs-card">
          <div class="docs-kicker">Paid APIs</div>
          <h3>x402 and paid agent tools</h3>
          <p>Check the payer before expensive work starts and keep trust gating inside the same monetized route.</p>
        </article>
        <article class="docs-card">
          <div class="docs-kicker">Discovery</div>
          <h3>Directories and service networks</h3>
          <p>Publish machine-readable trust documents and public pages so other apps can discover certified, inspectable wallets.</p>
        </article>
      </div>
    </section>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset,
      ],
      layout: 'BaseLayout',
      defaultModelsExpandDepth: -1,
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
    })
  </script>
</body>
</html>`
}

export function getX402DiscoveryView(requestUrl: string, forwardedProto?: string | null) {
  const raw = new URL(requestUrl)
  const proto = forwardedProto ?? raw.protocol.replace(':', '')
  const baseUrl = `${proto}://${raw.host}`

  return {
    x402: {
      version: '1.0',
      network: 'eip155:8453',
      facilitator: process.env.FACILITATOR_URL ?? 'https://x402.org/facilitator',
      currency: 'USDC',
    },
    service: {
      name: SERVICE_TITLE,
      description:
        'Trust infrastructure for apps and agents on Base. ' +
        'Score wallets, publish public trust surfaces, and gate payouts or x402 routes before money moves.',
      version: SERVICE_VERSION,
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
        path: '/v1/score/erc8004',
        method: 'GET',
        price: 0,
        description:
          'Free ERC-8004-compatible reputation document that packages score, identity registration, certification, and publication status.',
        input: { query: { wallet: { type: 'string', required: true, description: 'Ethereum wallet address' } } },
        output: {
          example: {
            wallet: '0x…',
            agent_id: '123456789',
            standard: 'erc-8004-compatible',
            reputation: { composite_score: 78, tier: 'Established', confidence: 0.82 },
            certification: { active: true, tier: 'Trusted' },
          },
        },
      },
      {
        path: '/v1/certification/readiness',
        method: 'GET',
        price: 0,
        description:
          'Free certification readiness check that tells a wallet whether it can apply, what is blocking it, and what to do next.',
        input: { query: { wallet: { type: 'string', required: true, description: 'Ethereum wallet address' } } },
        output: {
          example: {
            wallet: '0x…',
            can_apply: true,
            status: 'eligible',
            payment: { protocol: 'x402', amount_usdc: 99 },
          },
        },
      },
      {
        path: '/v1/certification/review',
        method: 'GET/POST',
        price: 0,
        description:
          'Free certification review queue surface for submitting a review request or reading the latest reviewer status for a wallet.',
        input: {
          query: { wallet: { type: 'string', required: true, description: 'Ethereum wallet address' } },
          body: { wallet: { type: 'string', required: true }, note: { type: 'string', required: false } },
        },
        output: {
          example: {
            wallet: '0x…',
            status: 'pending',
            requested_tier: 'Trusted',
            requested_score: 82,
          },
        },
      },
      {
        path: '/v1/certification/directory',
        method: 'GET',
        price: 0,
        description:
          'Public directory of active DJD certifications with current score context, profile metadata, trust links, and optional search/sort filters.',
        input: {
          query: {
            limit: { type: 'integer' },
            tier: { type: 'string' },
            search: { type: 'string' },
            sort: { type: 'string', enum: ['score', 'confidence', 'recent', 'name'] },
          },
        },
      },
      {
        path: '/v1/score/full',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/score/full'],
        description: 'Full score with 6-dimension breakdown, sybil/gaming flags, confidence, and explainability.',
        input: { query: { wallet: { type: 'string', required: true } } },
      },
      {
        path: '/v1/score/evaluator',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/score/evaluator'],
        description:
          'ERC-8183 evaluator prototype that returns an approve, review, or reject recommendation for settlement readiness.',
        input: { query: { wallet: { type: 'string', required: true } } },
      },
      {
        path: '/v1/score/risk',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/score/risk'],
        description: 'Risk prediction view combining fraud pressure, sybil/gaming flags, ratings, and intent outcomes.',
        input: { query: { wallet: { type: 'string', required: true } } },
      },
      {
        path: '/v1/cluster',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/cluster'],
        description:
          'Cluster analysis for a wallet using graph structure, risk signals, and persisted cluster assignments.',
        input: { query: { wallet: { type: 'string', required: true }, limit: { type: 'integer' } } },
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
        path: '/v1/rate',
        method: 'POST',
        price: ENDPOINT_PRICING['/v1/rate'],
        description:
          'Submit a transaction-backed 1-5 star counterparty rating for a wallet after at least $0.10 USDC of indexed settlement.',
        input: {
          body: {
            rated_wallet: { type: 'string' },
            tx_hash: { type: 'string' },
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
        },
      },
      {
        path: '/v1/stake',
        method: 'POST',
        price: 0,
        fee_model: '1% of stake amount, validated from an on-chain USDC transfer to PAY_TO',
        description:
          'Register a creator-to-agent USDC stake after validating both the stake transfer and the separate 1% DJD fee transfer on-chain.',
        input: {
          body: {
            agent_wallet: { type: 'string' },
            stake_tx_hash: { type: 'string' },
            fee_tx_hash: { type: 'string' },
          },
        },
      },
      {
        path: '/v1/data/fraud/blacklist',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/data/fraud/blacklist'],
        description: 'Check if a wallet has fraud reports filed against it.',
        input: { query: { wallet: { type: 'string', required: true } } },
      },
      {
        path: '/v1/data/decay',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/data/decay'],
        description: 'Historical score decay curve for a wallet with trend and trajectory analysis.',
        input: {
          query: {
            wallet: { type: 'string', required: true },
            limit: { type: 'integer' },
            after: { type: 'string' },
            before: { type: 'string' },
          },
        },
      },
      {
        path: '/v1/data/graph',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/data/graph'],
        description: 'Relationship graph data for a wallet with top counterparties and directional volume totals.',
        input: {
          query: {
            wallet: { type: 'string', required: true },
            limit: { type: 'integer' },
          },
        },
      },
      {
        path: '/v1/data/intent',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/data/intent'],
        description: 'Transaction-intent conversion data for a wallet based on paid lookups and follow-up deals.',
        input: {
          query: {
            wallet: { type: 'string', required: true },
            limit: { type: 'integer' },
          },
        },
      },
      {
        path: '/v1/data/ratings',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/data/ratings'],
        description: 'Counterparty rating history and aggregate sentiment for a wallet.',
        input: {
          query: {
            wallet: { type: 'string', required: true },
            limit: { type: 'integer' },
          },
        },
      },
      {
        path: '/v1/data/economy/survival',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/data/economy/survival'],
        description: 'Economy survival analytics showing cohort retention, activity survival, and at-risk wallets.',
        input: {
          query: {
            limit: { type: 'integer' },
          },
        },
      },
      {
        path: '/v1/data/economy/summary',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/data/economy/summary'],
        description: 'Economy summary metrics by period from the aggregated ecosystem warehouse.',
        input: {
          query: {
            period: { type: 'string' },
            limit: { type: 'integer' },
          },
        },
      },
      {
        path: '/v1/data/economy/volume',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/data/economy/volume'],
        description: 'Economy volume time series with transaction counts and total USDC flow by period.',
        input: {
          query: {
            period: { type: 'string' },
            limit: { type: 'integer' },
          },
        },
      },
      {
        path: '/v1/forensics/summary',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/forensics/summary'],
        description: 'DJD Forensics overview: report counts, penalties, and recent incidents for a wallet.',
        input: { query: { wallet: { type: 'string', required: true } } },
      },
      {
        path: '/v1/forensics/dispute',
        method: 'POST',
        price: ENDPOINT_PRICING['/v1/forensics/dispute'],
        description: 'Open a dispute for a fraud report as the reported wallet.',
        input: {
          body: {
            report_id: { type: 'string' },
            reason: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
      {
        path: '/v1/forensics/feed',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/forensics/feed'],
        description: 'DJD Forensics incident feed with recent fraud reports across the network.',
        input: {
          query: {
            reason: { type: 'string' },
            limit: { type: 'integer' },
            after: { type: 'string' },
            before: { type: 'string' },
          },
        },
      },
      {
        path: '/v1/forensics/watchlist',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/forensics/watchlist'],
        description: 'DJD Forensics watchlist ranking the most-reported wallets across the network.',
        input: {
          query: {
            limit: { type: 'integer' },
            after: { type: 'string' },
            before: { type: 'string' },
          },
        },
      },
      {
        path: '/v1/forensics/reports',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/forensics/reports'],
        description: 'DJD Forensics incident feed with raw report details for a wallet.',
        input: {
          query: {
            wallet: { type: 'string', required: true },
            limit: { type: 'integer' },
            after: { type: 'string' },
            before: { type: 'string' },
          },
        },
      },
      {
        path: '/v1/forensics/timeline',
        method: 'GET',
        price: ENDPOINT_PRICING['/v1/forensics/timeline'],
        description: 'Merged score-history and fraud-incident timeline for a wallet.',
        input: {
          query: {
            wallet: { type: 'string', required: true },
            limit: { type: 'integer' },
            after: { type: 'string' },
            before: { type: 'string' },
          },
        },
      },
      {
        path: '/v1/monitor/presets',
        method: 'GET',
        price: 0,
        description: 'List managed monitoring policy presets for score, anomaly, and DJD Forensics alerts.',
      },
      {
        path: '/v1/monitor',
        method: 'POST',
        price: 0,
        description:
          'Create a managed monitoring subscription that provisions webhook delivery for score, anomaly, or DJD Forensics policies.',
        input: {
          body: {
            target_wallet: { type: 'string' },
            policy_type: { type: 'string', required: true },
            url: { type: 'string', required: true },
            threshold_score: { type: 'integer' },
          },
        },
      },
    ],
    integration: {
      npm: {
        client: 'djd-agent-score',
        mcp: 'djd-agent-score-mcp',
        middleware: 'x402-agent-score',
      },
      pypi: {
        client: 'djd-agent-score',
      },
      quickstart: `curl "${baseUrl}/v1/score/basic?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"`,
    },
  }
}
