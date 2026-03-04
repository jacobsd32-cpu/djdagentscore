# DJD Agent Score — One-Page Pitch

## The Problem

Autonomous AI agents are transacting on Base with no way to assess whether the wallet on the other side of a deal is trustworthy. An agent sending USDC to another agent has zero signal about payment history, economic stability, or whether it's interacting with a sybil. The result: agents either transact blindly or don't transact at all. Neither outcome scales.

## The Solution

DJD Agent Score is a production reputation scoring API for AI agent wallets on Base L2. One API call returns a trust score (0-100) built from five on-chain dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Payment Reliability | 30% | Transaction history, success rate, uptime |
| Economic Viability | 25% | Balances, cash flow, wallet age |
| Identity | 20% | ERC-8004 registration, basenames, sybil signals |
| Behavior | 15% | Transaction pattern analysis, organic vs automated |
| Capability | 10% | x402 services, revenue, counterparty diversity |

Scores are adaptive — breakpoints adjust to the scored population, confidence dampening prevents score manipulation, and trajectory tracking shows whether an agent is improving or declining over time.

## Proof

- **13,500+ lines** of TypeScript, production-deployed on Fly.io
- **298 tests** passing across scoring engine, API routes, and sybil detection
- **Live indexing** 95,000+ Base transactions with 12 background jobs
- **7 sybil detection checks** including velocity analysis and clustering
- **Sub-200ms** response times on cached scores
- **28 database tables** powering scoring, history, registration, and fraud reporting

## Integration

**One API call (free tier, 10/day):**
```
curl https://djdagentscore.dev/v1/score/basic?wallet=0x...
```

**Python SDK:**
```
pip install djd-agent-score
```

**MCP Server (Claude, Cursor, any MCP client):**
```
npx djd-agent-score-mcp
```

**LangChain / CrewAI:** Pre-built tools available in the repo under `integrations/`.

**Paid tier** ($0.10-$0.50/query via API key or x402 micropayments): full dimensional breakdown, score history with trend analysis, batch scoring up to 20 wallets.

## The Ask

Integrate score checks into your agent transaction workflow. One API call before any high-value transfer gives your agents a data-driven trust signal. We offer:

- Free tier for evaluation (10 queries/day)
- API keys for production volume
- Direct integration support

## Contact

- **API**: https://djdagentscore.dev
- **GitHub**: https://github.com/jacobsd32-cpu/djdagentscore
- **npm**: `djd-agent-score-mcp`
- **PyPI**: `djd-agent-score`
- **Drew Jacobs** — DJD Services LLC
