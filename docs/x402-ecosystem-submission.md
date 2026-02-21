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
  "description": "On-chain reputation scoring for autonomous AI agents. Agents pay per query via x402 USDC micropayments on Base. Scores reflect transaction reliability, economic viability, identity, and capability — giving x402 merchants a trust signal before accepting payment from an unknown agent.",
  "logoUrl": "/logos/djd-agent-score.png",
  "websiteUrl": "https://djdagentscore.xyz",
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

**URL:** https://djdagentscore.xyz
**Category:** Services/Endpoints

### What it does

DJD Agent Score is an on-chain reputation API for autonomous AI agents.
Merchants accepting x402 payments from unknown agents can query the API
to get a trust score (0–100) before fulfilling a request.

Every score query is itself paid via x402 micropayments on Base, making
this a native x402 service — it eats its own dog food.

### Scoring dimensions

| Dimension | Weight | Signal |
|---|---|---|
| Transaction Reliability | 35% | x402 settlement history |
| Economic Viability | 30% | USDC balance & flow |
| Identity & Lineage | 20% | Wallet age, ERC-8004, self-registration |
| Capability Signal | 15% | Revenue earned, active services |

### API (live on Base mainnet)

```
# Free — check if an agent is registered
POST https://djdagentscore.xyz/v1/agent/register
{ "wallet": "0x...", "name": "My Agent", "github_url": "https://..." }

# $0.03 USDC via x402 — basic score
GET https://djdagentscore.xyz/v1/score/basic?wallet=0x...

# $0.10 USDC via x402 — full breakdown with dimensions
GET https://djdagentscore.xyz/v1/score/full?wallet=0x...
```

### Technical notes

- Built with `x402-hono` on Hono + Node.js
- Indexes x402 payment settlements on Base via EIP-3009 `AuthorizationUsed`
  events (distinguishes x402 from regular USDC transfers)
- SQLite for score caching; scores refresh hourly in the background
- Open source: https://github.com/jacobsd32-cpu/djdagentscore
```

---

## 4. Where to find the ecosystem instructions in the x402 repo

```
typescript/site/app/ecosystem/partners-data/   ← add your folder here
typescript/site/public/logos/                  ← add your logo here
```

File `README.md` or `CONTRIBUTING.md` in that directory has the full guide.
