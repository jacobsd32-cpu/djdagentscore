# Farcaster Thread Drafts

---

## Thread 1: The Build Story

**Post 1:**
I built a 13,500-line scoring API for AI agents with zero traditional coding background. DJD Agent Score is live on Base — it gives any AI agent wallet a reputation score from 0-100 so agents can assess trust before transacting. Here's how it happened and what I learned.

**Post 2:**
The problem is straightforward: autonomous agents on Base are sending USDC to each other with no signal about whether the counterparty is reliable. An agent completing a task has no way to know if the wallet paying it has a history of failed transactions, is a fresh sybil, or has been flagged for fraud. I wanted to fix that.

**Post 3:**
The scoring model uses five on-chain dimensions: payment reliability (30%), economic viability (25%), identity verification (20%), behavioral analysis (15%), and capability assessment (10%). Each dimension pulls live data from Base — transaction history, USDC flows, ERC-8004 registration, basename ownership, and x402 service records.

**Post 4:**
The entire thing was built with AI-assisted development. Claude Code wrote the TypeScript, I directed architecture and product decisions. 298 tests, 28 database tables, 12 background jobs indexing 95,000+ transactions in real-time. The scoring engine uses adaptive breakpoints that shift with the scored population, so the model doesn't go stale as the agent ecosystem evolves.

**Post 5:**
What's live right now: free tier API (10 queries/day, no auth needed), paid tier with full dimensional breakdown and score history via x402 micropayments or API keys. Python SDK on PyPI, MCP server on npm for Claude and Cursor, LangChain and CrewAI integrations ready to drop in.

**Post 6:**
The part I'm most proud of is the sybil detection layer — 7 independent checks including transaction velocity analysis, wallet clustering, and behavioral entropy scoring. If an agent is trying to game its score, the system catches it and applies an integrity multiplier that caps how high it can climb.

**Post 7:**
Try it right now — one curl command, no signup:

```
curl https://djdagentscore.dev/v1/score/basic?wallet=0xYOUR_WALLET
```

If you're building agents on Base and want to integrate trust scoring into your workflow, DM me. Free API keys for builders who want the full breakdown.

---

## Thread 2: Why AI Agents Need Credit Scores

**Post 1:**
AI agents are going to handle real money. They already are on Base — x402 micropayments, USDC transfers, automated DeFi interactions. But right now, there's no equivalent of a credit score for agents. Every transaction is a trust-me-bro situation. That has to change.

**Post 2:**
Think about what happens when Agent A needs to pay Agent B for a completed task. Agent A has no way to verify whether Agent B has a history of delivering, whether its wallet is economically stable, or whether it's even a real agent vs. a sybil trying to farm transactions. The agent either sends the USDC and hopes, or it doesn't transact at all.

**Post 3:**
This is the same problem credit scores solved for humans in the 1950s. Before FICO, every lending decision was a guess. Reputation scoring gave the financial system a shared language for trust. Agents need the same infrastructure — a standardized, queryable trust signal that any agent can check before committing funds.

**Post 4:**
DJD Agent Score is my answer to this. It scores any wallet on Base from 0-100 using five dimensions of on-chain data: payment reliability, economic viability, identity verification, behavioral analysis, and capability assessment. The score updates continuously as new transactions land on-chain.

**Post 5:**
Real data from the system: wallets with high payment reliability scores (consistent transaction history, high success rates, long uptime) tend to cluster in the 70-85 range. Fresh wallets with no history start at 15-25. Sybils that try to inflate their scores get flagged and capped by the integrity multiplier — the system watches for gaming patterns like burst transactions and circular flows.

**Post 6:**
The scoring model uses adaptive breakpoints, meaning the definition of "good" shifts as the agent population grows. A reliability score that puts you in the top 20% today might be average in six months as agents get more sophisticated. The model stays calibrated automatically.

**Post 7:**
If you're building agent infrastructure on Base, this is a primitive you can use today. Free API, Python SDK (`pip install djd-agent-score`), MCP server (`npx djd-agent-score-mcp`). One API call before a transaction gives your agent a data-driven reason to trust or walk away.

Check it: https://djdagentscore.dev

---

## Thread 3: The Scoring Model Deep-Dive

**Post 1:**
I've been building DJD Agent Score — a reputation scoring engine for AI agent wallets on Base. The model scores wallets 0-100 using five weighted dimensions. Here's a technical deep-dive into how the scoring works under the hood, and the design decisions behind it.

**Post 2:**
Dimension 1: Payment Reliability (30% weight). This pulls transaction count, nonce, success rate, failed transaction count, last transaction timestamp, and uptime estimate. A wallet with 500 successful transactions and a 99.2% success rate scores differently than one with 50 transactions and 85% success. The weight is highest because for agent-to-agent commerce, paying reliably is the most important signal.

**Post 3:**
Dimension 2: Economic Viability (25%). USDC and ETH balances, 7-day and 30-day inflows/outflows, total historical inflows, wallet age, and whether the wallet has ever hit zero balance. This dimension answers: can this agent actually pay for things? A wallet with steady inflows and healthy balances is economically viable. One that's been drained twice this month is a risk.

**Post 4:**
Dimension 3: Identity (20%). ERC-8004 registration status, basename ownership, wallet age, creator score (who deployed this agent?), generation depth, constitution hash verification, and Insumer verification. On-chain identity is still early, but the signals that exist are meaningful — a wallet registered through ERC-8004 with a verified constitution hash is materially more trustworthy than an anonymous fresh wallet.

**Post 5:**
Dimension 4: Behavior (15%). This is the pattern analysis layer. It measures inter-arrival coefficient of variation (how regular are the transactions?), hourly entropy (is activity spread across the day or concentrated?), max gap hours, and classifies wallets as organic, mixed, automated, suspicious, or insufficient_data. A wallet with high entropy and natural variation scores higher than one with perfectly timed burst transactions.

**Post 6:**
Dimension 5: Capability (10%). Active x402 services, total revenue generated, domains owned, successful replications, unique counterparties, and service longevity in days. This measures whether an agent is actually doing something useful on-chain, not just existing. An agent running three x402 services with 20 unique counterparties is demonstrably more capable than one that's only ever sent transactions to itself.

**Post 7:**
The meta-layer: adaptive breakpoints and confidence dampening. Raw dimension scores get normalized against the current scored population, so breakpoints shift as agents improve. Confidence dampening prevents score volatility — a single good day doesn't jump you 30 points. The trajectory system tracks velocity, momentum, and direction over time, so you can see if an agent is improving, declining, or stable. Finally, the integrity multiplier catches gaming: if sybil checks fire, your maximum achievable score gets capped.

**Post 8:**
All of this is queryable through a single API call. Free tier for basic scores, $0.10 for the full dimensional breakdown with sybil flags and improvement paths. Built with Hono + TypeScript + SQLite, deployed on Fly.io, scoring 5,000+ wallets from 95,000+ indexed transactions.

Full API docs and source: https://djdagentscore.dev
Python SDK: `pip install djd-agent-score`
MCP server: `npx djd-agent-score-mcp`

If you're building agents and want to integrate this, DM me for a free API key.
