# DJD Agent Score — State of the Project & Path to $1M ARR

**Date**: March 1, 2026
**Author**: Drew Jacobs (solo founder, zero prior coding experience, built entirely with AI assistance)

---

## A) Where We Are Today

### What exists

A production-grade API that scores AI agent wallets on Base L2 for trustworthiness. The system indexes real blockchain data, computes reputation scores across 5 dimensions, and serves results via REST API with micropayments.

### Technical inventory

| Asset | Details |
|-------|---------|
| **Codebase** | 13,500 lines TypeScript, 298 tests, 33 test files |
| **Scoring engine** | 5-dimension adaptive model (reliability, viability, identity, capability, behavior) with population-calibrated breakpoints, trajectory analysis, outcome learning, confidence dampening |
| **Detection systems** | Sybil detection, gaming indicators, fraud reports, integrity multiplier |
| **Infrastructure** | Hono 4 API on Fly.io, SQLite, real-time Base L2 indexer |
| **Payment rail** | x402 micropayments (USDC on Base) — agents pay per query on-chain |
| **Distribution** | MCP server on npm (`npx djd-agent-score-mcp`), TypeScript SDK, Python SDK planned |
| **Landing page** | Live at djdagentscore.dev with interactive demo, score lookup, docs |
| **Model version** | v2.5.0 (intelligent scoring flywheel) |

### Live production metrics (March 1, 2026)

| Metric | Value | Assessment |
|--------|-------|------------|
| Wallets indexed | 5,063 | Good — real blockchain data |
| Transactions indexed | 95,939 | Good — real activity |
| Scores cached | 321 | All computed by indexer, not user requests |
| Query log entries | 3,896 | Mostly own testing |
| Registered agents | 0 | No external users have registered |
| GitHub-verified agents | 0 | No one has done this |
| Paid queries | ~0 | No revenue |
| Top score | 76/100 (Trusted tier) | Scoring model works but no Elite agents yet |

### Revenue today: $0

No external users. No paid queries. The system works but nobody is using it yet.

### What's been published / distributed

| Channel | Status | Impact |
|---------|--------|--------|
| npm: `djd-agent-score-mcp` | Published (v0.1.0, March 1) | Live, installable, 0 downloads so far |
| Glama.ai | `glama.json` in repo | Listing claimed, should auto-index |
| Smithery | `server.json` drafted | Not yet submitted |
| npm: `djd-agent-score-client` | Not published | SDK exists locally only |
| GitHub | Public repo | Code visible but no community |
| Landing page | Live | Good first impression, no traffic data |

### Pricing model

| Endpoint | Price | Payment |
|----------|-------|---------|
| Basic score | Free (10/day) | — |
| Leaderboard | Free | — |
| Economy metrics | Free | — |
| Full score | $0.10 | x402 or API key |
| Score refresh | $0.25 | x402 or API key |
| Score history | $0.15 | x402 or API key |
| Batch score (2-20) | $0.50 | x402 or API key |
| Fraud report | $0.02 | x402 or API key |
| Certification | $99.00 | x402 or API key |

---

## B) Path to $1M ARR

### The math

$1M ARR = $83,333/month = $2,740/day

| Scenario | Avg revenue/query | Queries needed/day | Monthly active agents |
|----------|------------------|--------------------|-----------------------|
| All basic ($0.10) | $0.10 | 27,400 | ~900 querying 30x/day |
| Mixed usage | $0.15 | 18,267 | ~600 querying 30x/day |
| Heavy batch/history | $0.25 | 10,960 | ~365 querying 30x/day |
| Certification-heavy | $1.00 | 2,740 | ~90 querying 30x/day |

**Realistic target**: 500-1,000 actively paying agent wallets doing 15-30 queries/day at ~$0.15 average.

### The core thesis

> AI agents will increasingly transact autonomously on-chain. When they do, they need a way to assess counterparty risk before sending funds. DJD Agent Score is that trust layer.

**This thesis is correct but early.** The autonomous agent economy on Base is nascent. The infrastructure you've built is ahead of the market. The question is: how do you survive until demand catches up, and can you accelerate it?

### Strategic priorities (in order)

#### Priority 1: Get 10 real users (Month 1-2)
**Goal**: Prove anyone besides you will use this.

- **Agent framework integrations**: Build a LangChain tool, CrewAI tool, or AutoGPT plugin that wraps `get_score`. These frameworks have thousands of developers building agents. A 20-line integration that says "check wallet trust before sending funds" is an easy PR.
- **Direct outreach to agent builders**: Find 10-20 people on Twitter/Farcaster building autonomous agents on Base. DM them. Offer free API keys. Ask them to try it.
- **Farcaster/Warpcast presence**: The Base ecosystem lives here. Post about what you've built. The "solo non-coder who built a 13K-line scoring API with AI" story is genuinely compelling.
- **Open source your MCP server story**: Write a thread about building an MCP server as a non-developer. The AI-assisted development angle is trending content right now.

**Success metric**: 10 wallets registered, 5 with GitHub verification, 100+ organic queries.

#### Priority 2: Land 1 protocol integration (Month 2-4)
**Goal**: Create pull-through demand where agents *must* check scores.

This is the most important thing. If a protocol or platform checks DJD scores as part of its flow, every agent on that platform becomes your user automatically.

**Targets** (in order of feasibility):
1. **Agent-to-agent payment protocols** on Base — if they exist, they need trust scoring
2. **AI agent launchpads/registries** — platforms listing agents could display trust scores as badges
3. **DeFi protocols with agent allowlists** — your score could gate access (score > 60 to interact)
4. **Coinbase/Base ecosystem grants** — Base has developer grants; a reputation layer is infrastructure

**The pitch**: "You're already dealing with bot/sybil problems. We have a production API that scores wallets across 5 dimensions with sybil detection. Free to integrate. One API call, under 200ms."

**Success metric**: 1 signed integration, scores being checked in production by a third party.

#### Priority 3: Content + distribution engine (Ongoing)
**Goal**: Be the obvious answer when someone asks "how do I trust an agent wallet?"

- **Blog posts on your site**: "How sybil detection works for AI agents", "Why wallet age isn't enough for trust", "Scoring model v2.5 explained"
- **Technical docs**: Make it dead simple to integrate. Copy-paste code blocks for every framework.
- **SEO for "AI agent reputation"**, "wallet trust score", "on-chain agent scoring"
- **Smithery/Glama/MCP directories**: Submit properly now that the npm package is live
- **Publish the Python SDK to PyPI**: Python developers are the largest AI agent audience

**Success metric**: Organic inbound — people finding you through search/directories.

#### Priority 4: Enterprise/certification revenue (Month 4-8)
**Goal**: Land high-value certification deals.

Your $99 certification endpoint is the highest-margin product. If agent builders want a "DJD Certified" badge to build trust with users:

- Create a certification badge (you already have `badgeGenerator.ts`)
- Build a "Verified Agent" directory page on your site
- Pitch it as the "blue checkmark for AI agents"
- Target: 10 certifications/month = $12K ARR (small but proves willingness to pay)

#### Priority 5: Scale to $1M ARR (Month 6-18)
**Goal**: Multiple protocol integrations + organic API traffic.

At this stage you'd need:
- 3-5 protocol integrations driving automatic queries
- 500+ actively querying agent wallets
- Self-serve API key signup with Stripe billing (supplement x402)
- Possibly a subscription tier ($50-200/month for unlimited queries) for high-volume integrators

### Revenue model evolution

| Phase | Revenue source | Timeline |
|-------|---------------|----------|
| **Now** | $0 | — |
| **Validation** | Free tier adoption, first paid queries | Month 1-3 |
| **Early revenue** | Certifications ($99), developer API keys | Month 3-6 |
| **Growth** | Protocol integrations driving query volume | Month 6-12 |
| **Scale** | Subscription tiers + per-query volume | Month 12-18 |

### Risks to monitor

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Market too early (agents aren't transacting yet) | High | Focus on what agents DO today (info queries, not payments). Scoring is useful even for non-financial agent interactions. |
| Competitor builds this inside a bigger platform | Medium | Speed + specialization advantage. You're live, they're not. First-mover in a niche matters. |
| x402 payment rail too niche | Medium | Already added API key auth as alternative. Could add Stripe for fiat payments. |
| Solo developer burnout | Medium | AI-assisted development is your superpower. Stay focused on distribution, not more features. The product is good enough. |
| Base L2 loses to another chain | Low | Scoring model is chain-agnostic. Could add Arbitrum/Optimism indexers later. |

### What NOT to build next

You have enough features. The scoring engine, adaptive model, MCP server, and landing page are genuinely impressive. **Do not build more product.** The next 90 days should be 80% distribution and 20% maintenance.

Specifically, resist the urge to:
- Add more scoring dimensions
- Build a dashboard/UI
- Add more blockchain integrations
- Rewrite or refactor anything
- Build features nobody has asked for

### Your unfair advantage

You're a non-developer who built a production-grade 13,500-line scoring API using AI tools. That story *is* the marketing. The AI agent ecosystem is full of developers who respect technical quality. When they see the codebase — 298 tests, adaptive breakpoints, sybil detection, x402 micropayments — they'll take it seriously. And when they hear you built it without coding experience, they'll want to talk to you.

Use that.

---

## Summary

| Category | Score | Notes |
|----------|-------|-------|
| Engineering quality | 8/10 | Production-grade, well-tested, well-architected |
| Product completeness | 8/10 | Scoring, detection, API, SDK, MCP, landing page — it's all there |
| Distribution | 2/10 | Just published to npm today. No users. No integrations. |
| Market timing | 5/10 | Thesis is right, market is early |
| Revenue | 0/10 | $0 revenue, 0 paying users |

**The bottleneck is distribution, not product.** Everything you build from here should be in service of getting the existing product in front of people.
