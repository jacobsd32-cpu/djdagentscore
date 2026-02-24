# Architecture

## Source tree

```
src/
├── index.ts                        # Hono app, x402 middleware, background jobs
├── types.ts                        # TypeScript interfaces
├── types/
│   └── hono-env.ts                 # Hono environment type bindings
├── logger.ts                       # Structured logging
├── blockchain.ts                   # viem public client, chunked getLogs
├── db.ts                           # Legacy DB entry point
├── db/
│   ├── connection.ts               # SQLite connection (DELETE journal mode)
│   ├── schema.ts                   # 20-table schema, migrations
│   └── queries.ts                  # Parameterised query helpers
├── middleware/
│   ├── freeTier.ts                 # 10 free requests/day for /v1/score/basic
│   ├── queryLogger.ts              # Per-request query logging
│   └── responseHeaders.ts          # Standard response headers
├── routes/
│   ├── register.ts                 # POST /v1/agent/register
│   ├── score.ts                    # GET /v1/score/*
│   ├── report.ts                   # POST /v1/report
│   ├── leaderboard.ts              # GET /v1/leaderboard
│   ├── badge.ts                    # GET /v1/badge/*.svg
│   ├── agent.ts                    # GET /agent/{wallet} (HTML)
│   ├── blacklist.ts                # GET /v1/data/fraud/blacklist
│   ├── health.ts                   # GET /health
│   ├── admin.ts                    # Admin/debug endpoints
│   ├── legal.ts                    # Terms & privacy
│   └── openapi.ts                  # GET /openapi.json
├── scoring/
│   ├── dimensions.ts               # Reliability, Viability, Identity, Capability
│   ├── behavior.ts                 # Behavior dimension (transaction patterns)
│   ├── engine.ts                   # Orchestration, caching, fraud penalties
│   ├── integrity.ts                # Sybil + gaming integrity modifier
│   ├── sybil.ts                    # Sybil detection heuristics
│   ├── gaming.ts                   # Score gaming detection
│   ├── confidence.ts               # Confidence scoring
│   ├── dataAvailability.ts         # Data sufficiency checks
│   ├── responseBuilders.ts         # BasicScoreResponse / FullScoreResponse builders
│   ├── calibrationReport.ts        # Scoring model calibration
│   └── recommendation.ts           # Score improvement recommendations
└── jobs/
    ├── blockchainIndexer.ts        # x402 settlement indexer (EIP-3009 AuthorizationUsed)
    ├── usdcTransferIndexer.ts      # USDC Transfer event indexer
    ├── usdcTransferHelpers.ts      # Transfer parsing utilities
    ├── scoreRefresh.ts             # Hourly background score refresh
    ├── scoreQueue.ts               # Score computation queue
    ├── anomalyDetector.ts          # Anomaly and Sybil monitoring
    ├── intentMatcher.ts            # Pre/post payment intent matching
    ├── outcomeMatcher.ts           # Payment outcome reconciliation
    ├── dailyAggregator.ts          # Daily wallet metrics aggregation
    ├── jobStats.ts                 # Background job statistics
    └── githubReverify.ts           # Periodic GitHub verification refresh
```

## Key components

### Scoring engine (`src/scoring/`)

The scoring engine orchestrates the full scoring pipeline:

1. **Sybil detection** (DB-only, fast) — checks for known sybil patterns
2. **Blockchain data fetch** (RPC) — USDC data, nonce, ETH balance, Basename lookup
3. **Gaming checks** (DB + balance) — detects window-dressing and burst-and-stop patterns
4. **Dimension scoring** — calculates all 5 dimensions with sybil caps and gaming penalties applied
5. **Integrity multiplier** — multiplicative modifier from sybil + gaming + fraud reports
6. **Confidence scoring** — based on tx count, wallet age, unique partners, prior queries
7. **Recommendation** — human-readable recommendation based on score + confidence + flags

Dimensions are weighted: Reliability (30%) + Viability (25%) + Identity (20%) + Behavior (15%) + Capability (10%).

The integrity multiplier is a blunt instrument applied to the composite score. It stacks: `pow(0.85, sybilIndicators) * pow(0.92, gamingIndicators) * pow(0.90, fraudReports)`.

### Blockchain indexer (`src/jobs/blockchainIndexer.ts`)

Polls Base USDC every 12 seconds for `AuthorizationUsed` events (EIP-3009). Uses a two-layer filter:

1. **Event filter**: Only `AuthorizationUsed` events from the USDC contract
2. **Amount filter**: $1 USDC cap to isolate x402 micropayments from DeFi activity

Adaptive chunk sizing handles BlastAPI's 20k result cap. Stores settlements in `x402_settlements` table for scoring.

### USDC Transfer indexer (`src/jobs/usdcTransferIndexer.ts`)

Separate indexer for standard USDC `Transfer` events. Feeds the Reliability and Viability dimensions with broader transaction history beyond x402-specific settlements.

### Database (`src/db/`)

SQLite with DELETE journal mode (chosen over WAL for Fly.io network-attached volume compatibility). 20 tables:

- `scores` — cached composite + dimension scores
- `score_history` — historical score snapshots
- `fraud_reports` — user-submitted misconduct reports
- `agent_registrations` — voluntary wallet registration metadata
- `query_log` — per-request logging for rate limiting and analytics
- `x402_settlements` — indexed EIP-3009 events
- `usdc_transfers` — indexed USDC Transfer events
- `wallet_index` — first-seen timestamps for wallet age calculation
- `free_tier_usage` — daily free tier quota tracking
- `job_stats` — background job execution metrics
- And more (daily aggregates, anomaly flags, intent matching, etc.)

### Background jobs (`src/jobs/`)

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Blockchain indexer | Continuous (12s) | Index x402 settlements |
| USDC Transfer indexer | Continuous (12s) | Index USDC transfers |
| Score refresh | Hourly | Refresh up to 10 expired scores |
| Intent matcher | Every 6 hours | Match pre/post payment intents |
| Outcome matcher | Every 6 hours | Reconcile payment outcomes |
| Anomaly detector | Every 15 min | Flag anomalous wallet behavior |
| Sybil monitor | Every 5 min | Enhanced sybil detection |
| Daily aggregator | Daily | Aggregate wallet metrics |
| GitHub re-verify | Daily | Refresh GitHub verification status |
