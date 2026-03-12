# Architecture

## Source tree

```
src/
├── app.ts                          # Shared Hono app construction, routes, middleware, x402
├── api.ts                          # API-only runtime entrypoint
├── worker.ts                       # Worker-only runtime entrypoint
├── index.ts                        # Legacy combined runtime (API + worker)
├── types.ts                        # TypeScript interfaces
├── types/
│   └── hono-env.ts                 # Hono environment type bindings
├── errors.ts                       # Structured error codes and responses
├── logger.ts                       # Structured logging
├── blockchain.ts                   # viem public client, chunked getLogs
├── metrics.ts                      # Prometheus metrics
├── db.ts                           # Barrel re-export for db/ modules
├── config/
│   ├── constants.ts                # Centralised magic numbers (scoring, blockchain, jobs, API)
│   └── env.ts                      # Environment helpers and runtime toggles
├── db/
│   ├── connection.ts               # SQLite connection (DELETE journal mode)
│   ├── schema.ts                   # 31-table schema, migrations, indexes
│   ├── reputationQueries.ts        # Scores, registrations, fraud reporting
│   ├── evidenceQueries.ts          # Query logs, indexer state, transfer evidence, webhook persistence
│   ├── platformQueries.ts          # API key persistence and developer platform records
│   ├── analyticsQueries.ts         # Revenue, explorer, economy, publication queries
│   └── queries.ts                  # Query barrel over domain modules
├── billing/
│   ├── billingStore.ts             # Billing/subscription persistence and pending key storage
│   └── subscriptionManager.ts      # Stripe orchestration, provisioning, and key encryption
├── runtime/
│   └── worker.ts                   # Background job scheduler and worker lifecycle
├── middleware/
│   ├── adminAuth.ts                # Admin endpoint authentication (SHA-256 + timing-safe)
│   ├── apiKeyAuth.ts               # API key authentication (Bearer token)
│   ├── freeTier.ts                 # 10 free requests/day for /v1/score/basic
│   ├── paidRateLimit.ts            # Rate limiting for paid endpoints
│   ├── queryLogger.ts              # Per-request query logging
│   ├── requestId.ts                # X-Request-ID generation
│   └── responseHeaders.ts          # Standard response + security headers
├── services/
│   ├── apiKeyService.ts            # Admin API key lifecycle and reset policy
│   ├── apiKeyAuthService.ts        # API key auth validation, quota reset, and usage accounting
│   ├── certificationService.ts     # Certification rules and workflow orchestration
│   ├── directoryService.ts         # Public trust-surface APIs for leaderboard, badges, and blacklist status
│   ├── evidenceService.ts          # Fraud report intake and score-history/forensics timeline APIs
│   ├── portalService.ts            # Developer portal usage and analytics lookup
│   ├── registrationService.ts      # Agent registration and GitHub identity workflow
│   ├── scoreService.ts             # Score request orchestration for sync, batch, and async job APIs
│   ├── webhookQueueService.ts      # Worker-side webhook queueing, delivery, and retry policy
│   └── webhookService.ts           # Webhook validation, lifecycle, and test delivery
├── utils/
│   ├── walletUtils.ts              # Wallet address normalisation and validation
│   ├── paymentUtils.ts             # x402 payment amount/pricing helpers
│   └── badgeGenerator.ts           # SVG badge rendering
├── templates/
│   ├── agentProfile.ts             # Agent profile HTML page
│   ├── explorer.ts                 # Explorer HTML page
│   └── legal.ts                    # Terms, privacy, leaderboard HTML
├── routes/
│   ├── register.ts                 # POST /v1/agent/register
│   ├── score.ts                    # GET /v1/score/*
│   ├── history.ts                  # GET /v1/score/history (paid)
│   ├── report.ts                   # POST /v1/report
│   ├── leaderboard.ts              # GET /v1/leaderboard
│   ├── badge.ts                    # GET /v1/badge/*.svg
│   ├── agent.ts                    # GET /agent/{wallet} (HTML)
│   ├── blacklist.ts                # GET /v1/data/fraud/blacklist
│   ├── certification.ts            # /v1/certification/* (apply, status, badge)
│   ├── webhooks.ts                 # /v1/webhooks + /admin/webhooks
│   ├── apiKeys.ts                  # /admin/api-keys management
│   ├── health.ts                   # GET /health
│   ├── metrics.ts                  # GET /metrics (Prometheus)
│   ├── economy.ts                  # Economy data endpoints
│   ├── admin.ts                    # Admin/debug endpoints
│   ├── legal.ts                    # Terms & privacy
│   ├── docs.ts                     # Swagger UI at /docs
│   └── openapi.ts                  # GET /openapi.json
├── scoring/
│   ├── dimensions.ts               # Reliability, Viability, Identity, Capability (+ counterparties, longevity)
│   ├── behavior.ts                 # Behavior dimension (transaction patterns, Bayesian blending)
│   ├── engine.ts                   # Orchestration, caching, fraud penalties, flywheel pipeline
│   ├── integrity.ts                # Sybil + gaming integrity modifier
│   ├── sybil.ts                    # Sybil detection heuristics
│   ├── gaming.ts                   # Score gaming detection
│   ├── confidence.ts               # Confidence scoring (trajectory stability signal)
│   ├── trajectory.ts               # Score velocity, momentum, direction → ±5 composite modifier
│   ├── populationStats.ts          # Population percentiles from scored wallets (cached 6h)
│   ├── adaptiveBreakpoints.ts      # Shift dimension breakpoints from population medians
│   ├── adaptiveWeights.ts          # Learn dimension weights from outcome correlations
│   ├── dampening.ts                # Confidence-weighted score stability
│   ├── caps.ts                     # Sybil caps + gaming penalties (pure function)
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
    ├── autoRecalibration.ts        # Auto-adjust tier thresholds from outcome data
    ├── jobStats.ts                 # Background job statistics
    ├── webhookDelivery.ts          # Thin worker adapter over webhookQueueService
    └── githubReverify.ts           # Periodic GitHub verification refresh
```

## Runtime topology

- `app.ts` is the shared composition root for the HTTP surface.
- `api.ts` starts only the Hono server.
- `worker.ts` starts only background jobs.
- `index.ts` preserves the historical single-process boot path by starting API and worker together.

Recommended production topology is two processes against the same SQLite volume:

- API process for synchronous request handling
- Worker process for indexing, refresh, delivery, and analytics jobs

This keeps the core request path isolated from long-running job pressure while preserving a single repo and schema.

Current deployment constraint:

- Fly volumes are still the limiting factor for a true production split.
- AgentScore uses SQLite on a mounted Fly volume, so API and worker cannot yet run as separate machines against the same live database file.

## Key components

### Scoring engine (`src/scoring/`)

The scoring engine orchestrates the full scoring pipeline:

1. **Blockchain data fetch** (RPC) — USDC data, nonce, ETH balance, Basename lookup
2. **Detections** — Sybil detection (DB-only, fast) + gaming checks (DB + balance)
3. **Dimension scoring** — calculates all 5 dimensions with adaptive breakpoints from population stats, sybil caps, and gaming penalties
4. **Composite score** — weighted sum using adaptive weights (learned from outcome correlations)
5. **Trajectory modifier** — ±5 point adjustment based on score velocity, momentum, and direction
6. **Confidence dampening** — clamps score delta based on confidence level (high-confidence scores are sticky)
7. **Integrity multiplier** — multiplicative modifier from sybil + gaming + fraud reports
8. **Confidence scoring** — multi-factor confidence estimate including trajectory stability
9. **Explainability** — trajectory data, effective weights, percentile rank, dampening info in response

Dimensions are weighted across Reliability, Viability, Identity, Behavior, and Capability. Base weights and sub-signal point budgets are defined in `dimensions.ts`. Effective weights adapt over time via `adaptiveWeights.ts`, which learns from outcome correlation data collected by the auto-recalibration job.

The Behavior dimension uses statistical blending for wallets with limited transaction history. The Capability dimension includes ecosystem participation signals. Dimension breakpoints shift based on population medians (`adaptiveBreakpoints.ts` + `populationStats.ts`), ensuring scores reflect where a wallet stands relative to the ecosystem. Tier thresholds are dynamically adjusted by the auto-recalibration job based on outcome data.

The integrity multiplier applies multiplicative penalties from sybil indicators, gaming indicators, and fraud reports. See `integrity.ts` for constants.

### Blockchain indexer (`src/jobs/blockchainIndexer.ts`)

Polls Base USDC every 12 seconds for `AuthorizationUsed` events (EIP-3009). Uses a two-layer filter:

1. **Event filter**: Only `AuthorizationUsed` events from the USDC contract
2. **Amount filter**: $1 USDC cap to isolate x402 micropayments from DeFi activity

Adaptive chunk sizing handles BlastAPI's 20k result cap. Stores settlements in `x402_settlements` table for scoring.

### USDC Transfer indexer (`src/jobs/usdcTransferIndexer.ts`)

Separate indexer for standard USDC `Transfer` events. Feeds the Reliability and Viability dimensions with broader transaction history beyond x402-specific settlements.

### Database (`src/db/`)

SQLite with DELETE journal mode (chosen over WAL for Fly.io network-attached volume compatibility). 31 tables:

- `scores` — cached composite + dimension scores
- `score_history` — historical score snapshots
- `fraud_reports` — user-submitted misconduct reports
- `agent_registrations` — voluntary wallet registration metadata
- `query_log` — per-request logging for rate limiting and analytics
- `x402_settlements` — indexed EIP-3009 events
- `usdc_transfers` — indexed USDC Transfer events
- `wallet_index` — first-seen timestamps for wallet age calculation
- `free_tier_usage` — daily free tier quota tracking
- `api_keys` — API key hashes, quotas, and usage tracking
- `webhooks` — webhook subscription configuration
- `webhook_deliveries` — delivery attempts and retry state
- `certifications` — certified agent badge records
- `job_stats` — background job execution metrics
- And more (daily aggregates, anomaly flags, intent matching, etc.)

### Background jobs (`src/jobs/`)

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Blockchain indexer | Continuous (12s) | Index x402 settlements |
| USDC Transfer indexer | Continuous (12s) | Index USDC transfers |
| Score refresh | Hourly | Refresh up to 50 expired scores |
| Webhook delivery | Every 30s | Deliver queued webhook events with retries |
| Intent matcher | Every 6 hours | Match pre/post payment intents |
| Outcome matcher | Every 6 hours | Reconcile payment outcomes |
| Anomaly detector | Every 15 min | Flag anomalous wallet behavior |
| Sybil monitor | Every 5 min | Enhanced sybil detection |
| Auto-recalibration | Every 6 hours | Adjust tier thresholds, update population stats, learn adaptive weights |
| Daily aggregator | Daily | Aggregate wallet metrics |
| GitHub re-verify | Daily | Refresh GitHub verification status |
