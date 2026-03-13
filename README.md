# DJD Agent Score

Screen Base wallets before your agent sends funds or fulfills a paid x402 request.

DJD Agent Score turns on-chain payment history into a 0-100 trust score so you can block obvious bad counterparties before money moves.

[![Listed in the Coinbase x402 Ecosystem](https://img.shields.io/badge/Coinbase_x402-Ecosystem-0052FF?style=flat&logo=coinbase)](https://github.com/coinbase/x402)
[![npm: djd-agent-score](https://img.shields.io/npm/v/djd-agent-score?label=npm%3A%20SDK)](https://www.npmjs.com/package/djd-agent-score)
[![npm: djd-agent-score-mcp](https://img.shields.io/npm/v/djd-agent-score-mcp?label=npm%3A%20MCP)](https://www.npmjs.com/package/djd-agent-score-mcp)
[![npm: x402-agent-score](https://img.shields.io/npm/v/x402-agent-score?label=npm%3A%20x402%20gate)](https://www.npmjs.com/package/x402-agent-score)
[![PyPI: djd-agent-score](https://img.shields.io/pypi/v/djd-agent-score?label=PyPI%3A%20djd-agent-score)](https://pypi.org/project/djd-agent-score/)

[Live API](https://djdagentscore.dev) · [API Docs](https://djdagentscore.dev/docs) · [OpenAPI Spec](https://djdagentscore.dev/openapi.json) · [Leaderboard](https://djdagentscore.dev/v1/leaderboard)

---

## Start here: gate an x402 route

If you run a paid Hono endpoint, this is the best first integration.

```ts
import { Hono } from 'hono'
import { agentScoreGate } from 'x402-agent-score'

const app = new Hono()

app.use(
  '/premium/*',
  agentScoreGate({
    minScore: 60,
    onUnknown: 'reject',
  }),
)

app.post('/premium/search', async (c) => {
  return c.json({ ok: true })
})
```

Install:

```bash
npm i x402-agent-score
```

Reference example: [examples/x402-hono.ts](./examples/x402-hono.ts)

---

## Try a free lookup

Score any wallet with no signup, no API key, and no payment. The free tier includes 10 basic lookups per day.

```bash
curl "https://djdagentscore.dev/v1/score/basic?wallet=0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528"
```

Returns:

```json
{
  "wallet": "0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528",
  "score": 39,
  "tier": "Emerging",
  "confidence": 0.16,
  "recommendation": "insufficient_history",
  "modelVersion": "2.5.0",
  "lastUpdated": "2026-02-25T04:12:50.000Z",
  "computedAt": "2026-02-25T04:12:50.000Z",
  "dataSource": "cached",
  "scoreFreshness": 0.85,
  "freeTier": true,
  "freeQueriesRemainingToday": 9
}
```

`score` is 0–100. `confidence` reflects how much on-chain data backs the score. `dataSource` is `live`, `cached`, or `unavailable` — indicating whether the score was freshly computed, served from cache, or if on-chain data couldn't be fetched. Wallets with more USDC transaction history and verified identity score higher.

Embed a live score badge in your own README:

```markdown
![Agent Score](https://djdagentscore.dev/v1/badge/0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528.svg)
```

View any wallet's profile page: [djdagentscore.dev/agent/{wallet}](https://djdagentscore.dev/agent/0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528)

---

## What you can do with it

- Reject low-trust payers before your paid x402 route runs.
- Score a wallet before your agent sends USDC or assigns work.
- Register your own agent so its wallet has identity metadata and a public profile.
- Use the paid endpoints when you need deeper history, integrity signals, or forced refreshes.

## Built for one concrete wedge first

**x402 service providers** — Gate paid routes by payer reputation. That is the clearest problem and the easiest integration path.

**Agent developers** — Score a wallet before your agent sends money, accepts a request, or enters a paid interaction.

**Directories and protocols** — Add a public trust layer to wallet profiles, badges, and access policies.

---

## Pick your path

| Path | Use it for | Install / docs |
|---|---|---|
| **x402 middleware** | Best first integration for paid Hono routes | [npm: x402-agent-score](https://www.npmjs.com/package/x402-agent-score) · [reference example](./examples/x402-hono.ts) |
| **REST API** | Fastest way to score a wallet before sending funds | [API docs](https://djdagentscore.dev/docs) |
| **TypeScript SDK** | Typed JS/TS integrations | [npm: djd-agent-score](https://www.npmjs.com/package/djd-agent-score) |
| **MCP server** | Claude, Cursor, Windsurf, Codex, or any MCP client | [npm: djd-agent-score-mcp](https://www.npmjs.com/package/djd-agent-score-mcp) |

---

## Register your agent

Publishing your wallet metadata is free and adds identity context to your profile and score.

```bash
curl -X POST https://djdagentscore.dev/v1/agent/register \
  -H 'Content-Type: application/json' \
  -d '{
    "wallet": "0xYourAgentWallet",
    "name": "My Agent",
    "description": "What your agent does",
    "github_url": "https://github.com/you/your-agent",
    "website_url": "https://your-agent.com"
  }'
```

---

## Integrate in 3 lines

### JavaScript

```js
// Free tier: 10 calls/day, no payment needed
const response = await fetch(
  "https://djdagentscore.dev/v1/score/basic?wallet=" + agentWallet
);
const { score, tier, confidence } = await response.json();

// Gate interactions based on trust
if (score < 50 || confidence < 0.3) {
  console.log("Wallet has insufficient reputation. Declining interaction.");
  return;
}

// Proceed with transaction
```

### Python

```python
import requests

resp = requests.get(
    "https://djdagentscore.dev/v1/score/basic",
    params={"wallet": agent_wallet}
)
data = resp.json()

if data["score"] >= 75 and data["confidence"] >= 0.5:
    # Trusted wallet, proceed
    execute_transaction(agent_wallet)
else:
    # Require additional verification
    flag_for_review(agent_wallet)
```

### curl (paid endpoint with x402)

```bash
# Full score breakdown for production checks
# x402-compatible clients attach the payment header automatically
curl "https://djdagentscore.dev/v1/score/full?wallet=0x…" \
  -H "X-PAYMENT: <payment_proof>"
```

---

## How scoring works

> **Model v2.5.0** — Intelligent Scoring Flywheel. Adaptive dimension breakpoints from population statistics. Outcome-learned dimension weights. Score trajectory analysis (velocity, momentum, direction). Confidence-weighted dampening for score stability. Percentile ranking.

Every wallet is evaluated across five weighted dimensions based on its USDC transaction history on Base:

| Dimension | Base Weight | What it measures |
|---|---|---|
| **Payment Reliability** | 30% | Transaction history and consistency on Base |
| **Economic Viability** | 25% | Financial health signals from USDC activity |
| **Identity** | 20% | Verifiable identity markers (Basename, GitHub, registration, [Insumer](https://insumer.ai) token-gating) |
| **Behavior** | 15% | Transaction timing patterns and anomaly detection |
| **Capability** | 10% | Demonstrated service delivery and ecosystem participation |

Dimension weights adapt over time based on outcome correlation data — dimensions that better predict real-world wallet behavior receive higher effective weights.

**Score tiers:** Elite (90+) · Trusted (75–89) · Established (50–74) · Emerging (25–49) · Unverified (0–24). Tier thresholds auto-adjust based on outcome calibration data.

The scoring engine indexes x402 settlements on-chain using the EIP-3009 `AuthorizationUsed` event. Agents that use x402 to pay for services accumulate verifiable payment history that feeds directly into their score. The more an agent transacts through x402, the more meaningful its reputation becomes.

**Adaptive scoring:** The v2.5 flywheel makes scores smarter over time. Population-derived breakpoints ensure dimension scores reflect where a wallet stands relative to the ecosystem. Score trajectory analysis applies a ±5 point modifier based on whether a wallet's reputation is improving or declining. Confidence-weighted dampening prevents established scores from swinging on limited new data.

**Integrity layers:** Sybil detection, gaming detection, and fraud report penalties are applied multiplicatively. Scores are cached for 1 hour with background refresh for active wallets.

---

## API reference

### Free endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/v1/score/basic?wallet=0x…` | GET | Score, tier, confidence. 10 free calls/day. |
| `/v1/score/erc8004?wallet=0x…` | GET | ERC-8004-compatible reputation document with score, identity, certification, and publication status. |
| `/v1/certification/readiness?wallet=0x…` | GET | Check if a wallet can apply for certification, see blockers, and get the next step before paying. |
| `/v1/certification/directory` | GET | Public directory of active certifications with score context and evaluator/standards links. |
| `/v1/agent/register` | POST | Register your wallet. +10 identity bonus. |
| `/v1/score/compute` | POST | Queue background score computation. Returns jobId immediately. |
| `/v1/score/job/:jobId` | GET | Poll async job status (pending → complete). |
| `/v1/leaderboard` | GET | Top-ranked wallets by score. |
| `/v1/certification/:wallet` | GET | Check certification status. |
| `/agent/{wallet}` | GET | Profile page (HTML). |
| `/v1/badge/{wallet}.svg` | GET | Embeddable SVG score badge. |
| `/health` | GET | Service health and indexer status. |

### Paid endpoints (x402 USDC on Base)

| Endpoint | Method | Price | Description |
|---|---|---|---|
| `/v1/score/full?wallet=0x…` | GET | $0.10 | Per-dimension scores, raw data, history, fraud flags |
| `/v1/score/evaluator?wallet=0x…` | GET | $0.35 | ERC-8183 evaluator prototype using score, certification, risk, and market signals |
| `/v1/score/refresh?wallet=0x…` | GET | $0.25 | Force live recalculation (bypasses 1hr cache) |
| `/v1/score/history?wallet=0x…` | GET | $0.15 | Historical score data with trend analysis |
| `/v1/report` | POST | $0.02 | Submit fraud/misconduct report against a wallet |
| `/v1/data/fraud/blacklist?wallet=0x…` | GET | $0.05 | Check if a wallet is on the fraud blacklist |
| `/v1/certification/apply` | POST | $99.00 | Apply for Certified Agent Badge (annual) |

### API key access

For high-volume usage without per-request x402 payments, API keys are available. Authenticate with `Authorization: Bearer djd_live_…` — requests are counted against a monthly quota instead of requiring individual payments.

Paid endpoints return `402 Payment Required` without a valid payment proof or API key. Include the proof in the `X-PAYMENT` header, or use an API key. Any x402-compatible client handles payment automatically. [How x402 payments work →](#how-x402-payments-work)

---

## Need a pilot path?

If you want to use DJD Agent Score in production and want help choosing a starting score threshold or rollout policy, reach out at [feedback@djdagentscore.dev](mailto:feedback@djdagentscore.dev).

---

## Report fraud

Submit reports against wallets engaged in misconduct. $0.02 per report to prevent spam. Verified reports apply a score penalty.

```bash
curl -X POST https://djdagentscore.dev/v1/report \
  -H 'Content-Type: application/json' \
  -H 'X-PAYMENT: <payment_proof>' \
  -d '{
    "target": "0xSuspiciousWallet",
    "reporter": "0xYourWallet",
    "reason": "payment_fraud",
    "details": "Agent accepted payment but never delivered the service."
  }'
```

Reasons: `failed_delivery` · `payment_fraud` · `impersonation` · `malicious_behavior` · `other`

---

## Local development

```bash
git clone https://github.com/jacobsd32-cpu/djdagentscore
cd djdagentscore
npm install
npm run dev
```

Requires **Node.js v22**. `npm run dev` keeps the legacy combined runtime. Starts on `http://localhost:3000`.

To run the split runtimes independently:

```bash
npm run dev:api
npm run dev:worker
```

Production-style entrypoints are also available after build:

```bash
npm run start:api
npm run start:worker
```

### Runtime topology

- `src/app.ts` builds the shared Hono app: routes, middleware, billing, and x402.
- `src/api.ts` runs the HTTP API only.
- `src/worker.ts` runs indexers, refreshers, anomaly detection, webhook delivery, and publishing jobs.
- `src/index.ts` is the legacy combined runtime and remains the default `npm run dev` / `npm start` path.

Recommended deployment shape:

- API process: `npm run start:api`
- Worker process: `npm run start:worker`
- Combined runtime: only for local development or backwards-compatible single-process deploys

Current production note:

- The Fly deployment should remain on the combined runtime until storage changes.
- This app still uses SQLite on a Fly volume, and that storage model blocks a safe API/worker machine split against the same database file.

### Deploy smoke checks

The deploy workflow now verifies both that `/health` is live and that the responding app reports the expected runtime mode and release SHA.

```bash
DJD_HEALTHCHECK_URL=https://djdagentscore.dev/health \
DJD_EXPECT_RUNTIME_MODE=combined \
DJD_EXPECT_RELEASE_SHA=<git_sha> \
DJD_ADMIN_KEY=<admin_key> \
npm run smoke:deploy
```

### Preview deploy lane

`codex/runtime-split-entrypoints` can now deploy to a non-production Fly preview app through `.github/workflows/fly-preview.yml`.

- Required GitHub variable: `FLY_PREVIEW_APP`
- Optional GitHub variable: `FLY_PREVIEW_PUBLIC_BASE_URL`
- Optional GitHub secret: `FLY_PREVIEW_API_TOKEN` (use this when your existing `FLY_API_TOKEN` is scoped only to the production app)
- Optional GitHub secret: `FLY_PREVIEW_ADMIN_KEY`

If `FLY_PREVIEW_PUBLIC_BASE_URL` is not set, the workflow defaults to `https://<FLY_PREVIEW_APP>.fly.dev`.

The preview app should be provisioned separately from production and should have its own mounted Fly volume named `djd_agent_score_data`, since this service still runs against a single SQLite file.

Use `npm run audit:promotion` to catch preview-unsafe hardcoded production URLs in `src/` and `index.html` before promotion.
Use `npm run render:fly-config -- --app <preview-app> --public-base-url <preview-url> --output .fly/preview.toml` to render a preview-safe Fly config from `fly.toml` without mutating the production config in the repo.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DJD_RUNTIME_MODE` | `combined` | Which built entrypoint to boot: `combined`, `api`, or `worker` |
| `DJD_RELEASE_SHA` | unset | Release commit baked into the container image and exposed via `/health` |
| `DJD_BUILD_TIMESTAMP` | unset | UTC build timestamp baked into the container image and exposed via `/health` |
| `PAY_TO` | `0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528` | USDC recipient for x402 payments |
| `FACILITATOR_URL` | `https://x402.org/facilitator` | x402 facilitator endpoint |
| `BASE_RPC_URL` | `https://base-mainnet.public.blastapi.io` | Base RPC (BlastAPI recommended) |
| `ENABLE_BLOCKCHAIN_INDEXER` | `true` | Enable x402 settlement indexing in worker/combined runtime |
| `ENABLE_USDC_INDEXER` | `true` | Enable USDC transfer indexing in worker/combined runtime |
| `ENABLE_HOURLY_REFRESH` | `true` | Enable hourly score refresh in worker/combined runtime |
| `DJD_HEALTHCHECK_URL` | `https://djdagentscore.dev/health` | Health endpoint used by `npm run smoke:deploy` |
| `DJD_EXPECT_RUNTIME_MODE` | `combined` | Expected runtime mode for deploy smoke verification |
| `DJD_EXPECT_RELEASE_SHA` | unset | Expected release SHA for deploy smoke verification |
| `DJD_ADMIN_KEY` | unset | Optional admin key so deploy smoke can verify detailed runtime health |

---

## Technical notes

**Stack:** Hono + SQLite + viem, deployed on Fly.io. Full architecture docs at [docs/architecture.md](docs/architecture.md).

**Blockchain indexer:** Polls Base USDC every 12 seconds for `AuthorizationUsed` and `Transfer` events. Two-layer filter (EIP-3009 event + $1 USDC amount cap) isolates x402 settlements from regular DeFi activity. Adaptive chunk sizing handles BlastAPI's 20k result cap.

**Database:** SQLite with DELETE journal mode (chosen over WAL for Fly.io network-attached volume compatibility). 31 tables covering scores, history, fraud reports, registrations, query logs, indexer state, API keys, webhooks, certifications, job stats, outcome calibration, and anomaly detection.

**RPC provider:** Default is BlastAPI public Base endpoint. For heavy indexing, use a dedicated provider via `BASE_RPC_URL`. Avoid `publicnode.com` (rejects 10k-block `eth_getLogs` ranges).

**ERC-8004:** [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) (AI Agent Registry) compatibility is available at `/v1/score/erc8004`, and the on-chain publication job writes high-confidence DJD scores into the reputation registry when configured.

**Score caching:** 1 hour cache. Background refresh for up to 50 expired scores per batch. Force recalculation with `/v1/score/refresh` ($0.25). Admin flush endpoint expires all cached scores to trigger ecosystem-wide re-scoring after model updates.

**Auto-recalibration:** The system continuously adjusts scoring thresholds based on real-world outcome data, closing the feedback loop between predicted trust and actual wallet behavior.

### Agent auto-discovery

x402-compatible agents can discover all DJD endpoints automatically:

```bash
curl https://djdagentscore.dev/.well-known/x402
```

Returns a machine-readable manifest of every endpoint, its price, input schema, and integration options.

### How x402 payments work

[x402](https://github.com/coinbase/x402) is an open payment protocol built on HTTP 402. When you hit a paid endpoint without payment, you get back a `402` response with payment instructions (amount, recipient, network). Your x402 client signs a USDC payment on Base, attaches the proof to `X-PAYMENT`, and resends the request. One additional round-trip, handled automatically by client libraries.

No API keys. No subscriptions. No accounts. Micropayments per request.

---

## License

[MIT](./LICENSE)

---

Built by DJD · Powered by [x402](https://github.com/coinbase/x402) · Running on [Base](https://base.org)
