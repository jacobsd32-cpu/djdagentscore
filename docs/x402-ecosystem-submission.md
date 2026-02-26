# x402 Ecosystem Submission

This file contains everything needed to submit DJD Agent Score to the
[coinbase/x402](https://github.com/coinbase/x402) ecosystem page.

---

## 1. Ecosystem metadata

Create this file in the coinbase/x402 repo:
**`typescript/site/app/ecosystem/partners-data/djd-agent-score/metadata.json`**

```json
{
  "name": "DJD Agent Score",
  "description": "On-chain reputation scoring for autonomous AI agents on Base. Five-dimension trust scores (0–100) covering reliability, viability, identity, behavior, and capability. Free tier for basic lookups; paid endpoints via x402 USDC micropayments. API keys available for high-volume access.",
  "logoUrl": "/logos/djd-agent-score.png",
  "websiteUrl": "https://djd-agent-score.fly.dev",
  "category": "Services/Endpoints"
}
```

**Logo**: Add a 200×200px PNG to `typescript/site/public/logos/djd-agent-score.png`.
A simple square logo with "DJD" or the score tier color gradient works fine.

---

## 2. PR title

```
feat(ecosystem): add DJD Agent Score — reputation scoring for AI agents
```

---

## 3. PR body

```markdown
## DJD Agent Score

**URL:** https://djd-agent-score.fly.dev
**Docs:** https://djd-agent-score.fly.dev/docs
**Category:** Services/Endpoints

### What it does

DJD Agent Score is an on-chain reputation API for autonomous AI agents.
Merchants accepting x402 payments from unknown agents can query the API
to get a trust score (0–100) before fulfilling a request.

Every paid score query is itself settled via x402 micropayments on Base,
making this a native x402 service — it eats its own dog food.

### Scoring dimensions

| Dimension | Weight | What it measures |
|---|---|---|
| Payment Reliability | 30% | Transaction history and consistency on Base |
| Economic Viability | 25% | Financial health signals from USDC activity |
| Identity | 20% | Verifiable identity markers (Basename, GitHub, registration) |
| Behavior | 15% | Transaction timing patterns and anomaly detection |
| Capability | 10% | Demonstrated service delivery and ecosystem participation |

### API (live on Base mainnet)

```
# Free — 10 basic score lookups per day, no payment needed
GET https://djd-agent-score.fly.dev/v1/score/basic?wallet=0x...

# Free — register your agent (+10 identity bonus)
POST https://djd-agent-score.fly.dev/v1/agent/register
{ "wallet": "0x...", "name": "My Agent", "github_url": "https://..." }

# $0.10 USDC via x402 — full breakdown with dimensions
GET https://djd-agent-score.fly.dev/v1/score/full?wallet=0x...

# $0.25 USDC via x402 — force live recalculation
GET https://djd-agent-score.fly.dev/v1/score/refresh?wallet=0x...

# $0.15 USDC via x402 — historical scores with trend analysis
GET https://djd-agent-score.fly.dev/v1/score/history?wallet=0x...
```

### Technical notes

- Built with Hono + better-sqlite3 + viem on Node.js v22
- Indexes x402 payment settlements on Base via EIP-3009 `AuthorizationUsed`
  events (distinguishes x402 from regular USDC transfers)
- Also indexes standard USDC `Transfer` events for broader transaction history
- 25-table SQLite database with score caching, fraud reports, API keys, webhooks
- Sybil detection and score gaming prevention
- Background jobs: blockchain indexer, score refresh, anomaly detector, auto-recalibration
- API key access available for high-volume usage without per-request x402 payments
- GitHub: https://github.com/jacobsd32-cpu/djdagentscore
```

---

## 4. Where to find the ecosystem instructions in the x402 repo

```
typescript/site/app/ecosystem/partners-data/   ← add your folder here
typescript/site/public/logos/                  ← add your logo here
```

File `README.md` or `CONTRIBUTING.md` in that directory has the full guide.
