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
│   ├── schema.ts                   # Schema, migrations, and indexes
│   ├── clusterQueries.ts           # Persisted cluster assignments and cluster-member lookups
│   ├── dataQueries.ts              # Score-decay, relationship-graph, and intent-conversion read models for DJD data products
│   ├── certificationQueries.ts     # DJD Certify persistence and certification revenue rollups
│   ├── directoryQueries.ts         # Public leaderboard and trust-directory read models
│   ├── forensicsQueries.ts         # Fraud report/dispute persistence, active-report filtering, and forensics read models
│   ├── identityQueries.ts          # Agent registration and GitHub identity persistence
│   ├── monitoringQueries.ts        # Managed monitoring-subscription persistence over webhook delivery
│   ├── reputationQueries.ts        # Scores, tier thresholds, and score-write persistence
│   ├── ratingsQueries.ts           # Mutual counterparty ratings persistence, transaction validation, and sentiment rollups
│   ├── stakingQueries.ts           # Creator-stake validation, stake/slash persistence, and score-boost rollups
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
│   ├── agentProfileService.ts      # Public agent profile rendering and cache-miss score lookup
│   ├── adminService.ts             # Admin calibration, reset, revenue, and Forensics dispute review workflows
│   ├── analyticsService.ts         # Public observatory-lite APIs for economy metrics and explorer data
│   ├── billingService.ts           # Billing checkout, success-page, and customer-portal workflows
│   ├── certificationService.ts     # Certification rules and workflow orchestration
│   ├── dataProductService.ts       # DJD data-product endpoints for decay curves, relationship graphs, and intent-conversion reads
│   ├── discoveryService.ts         # Public docs, OpenAPI, and x402 manifest assembly
│   ├── directoryService.ts         # Public trust-surface APIs for leaderboard and score badges
│   ├── evidenceService.ts          # Fraud report/dispute intake plus DJD Forensics wallet/corpus views and score-history APIs
│   ├── monitoringService.ts        # Managed score/anomaly/Forensics monitoring subscriptions built on wallet-scoped webhooks
│   ├── opsService.ts               # Health and Prometheus metrics payload assembly with runtime-safe caching
│   ├── portalService.ts            # Developer portal usage and analytics lookup
│   ├── ratingsService.ts           # Transaction-backed mutual-rating intake and ratings data-product views
│   ├── registrationService.ts      # Agent registration and GitHub identity workflow
│   ├── stakingService.ts           # Creator staking intake, on-chain fee validation, and score-boost workflow
│   ├── riskService.ts              # Risk prediction overlays built from fraud, integrity, ratings, and intent signals
│   ├── clusterService.ts           # Cluster analysis overlays built from graph, risk, and cluster-assignment state
│   ├── scoreService.ts             # Score request orchestration for sync, batch, and async job APIs
│   ├── stripeWebhookService.ts     # Stripe signature verification and webhook event handling
│   ├── webhookQueueService.ts      # Worker-side webhook queueing, wallet-scoped delivery, retry policy, and live Forensics/anomaly events
│   └── webhookService.ts           # Webhook validation, preset-based monitoring subscriptions, anomaly bundles, thresholds, and test delivery
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
│   ├── cluster.ts                  # GET /v1/cluster
│   ├── history.ts                  # GET /v1/score/history (paid)
│   ├── report.ts                   # POST /v1/report
│   ├── ratings.ts                  # POST /v1/rate
│   ├── stake.ts                    # POST /v1/stake
│   ├── monitoring.ts               # /v1/monitor/* managed monitoring subscriptions and presets
│   ├── forensics.ts                # /v1/forensics/* (summary, dispute intake, feed, watchlist, reports, merged timeline)
│   ├── leaderboard.ts              # GET /v1/leaderboard
│   ├── badge.ts                    # GET /v1/badge/*.svg
│   ├── data.ts                     # /v1/data/decay, /v1/data/graph, /v1/data/intent, and /v1/data/ratings
│   ├── agent.ts                    # GET /agent/{wallet} (HTML)
│   ├── blacklist.ts                # GET /v1/data/fraud/blacklist
│   ├── certification.ts            # /v1/certification/* (apply, status, badge)
│   ├── webhooks.ts                 # /v1/webhooks (presets/create/list/delete) + /admin/webhooks
│   ├── apiKeys.ts                  # /admin/api-keys management
│   ├── health.ts                   # GET /health
│   ├── metrics.ts                  # GET /metrics (Prometheus)
│   ├── economy.ts                  # Economy summary endpoints and /v1/data/economy/survival
│   ├── admin.ts                    # Admin/debug endpoints, including Forensics dispute triage
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
    ├── anomalyDetector.ts          # Anomaly detection, Sybil monitoring, and managed alert emission
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
5. **Creator stake boost** — modest creator-confidence boost from active validated stakes
6. **Trajectory modifier** — ±5 point adjustment based on score velocity, momentum, and direction
7. **Confidence dampening** — clamps score delta based on confidence level (high-confidence scores are sticky)
8. **Integrity multiplier** — multiplicative modifier from sybil + gaming + fraud reports
9. **Confidence scoring** — multi-factor confidence estimate including trajectory stability
10. **Explainability** — trajectory data, effective weights, percentile rank, dampening info in response

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

SQLite with DELETE journal mode (chosen over WAL for Fly.io network-attached volume compatibility). Core platform tables include:

- `scores` — cached composite + dimension scores
- `score_history` — historical score snapshots
- `fraud_reports` — user-submitted misconduct reports
- `fraud_patterns` — reusable fraud-pattern catalog used by risk overlays and future pattern matching
- `cluster_assignments` — persisted wallet cluster labels for cluster analysis and future clustering jobs
- `mutual_ratings` — transaction-backed peer ratings and community sentiment signals
- `creator_stakes` — validated creator-to-agent stakes, score boosts, and fraud-triggered slashing state
- `agent_registrations` — voluntary wallet registration metadata
- `query_log` — per-request logging for rate limiting and analytics
- `x402_settlements` — indexed EIP-3009 events
- `usdc_transfers` — indexed USDC Transfer events
- `wallet_index` — first-seen timestamps for wallet age calculation
- `free_tier_usage` — daily free tier quota tracking
- `api_keys` — API key hashes, quotas, and usage tracking
- `webhooks` — wallet-scoped webhook subscription configuration, thresholds, anomaly bundles, and Forensics filters
- `monitoring_subscriptions` — managed score, anomaly, and Forensics alert policies tied to subscriber wallets and target wallets
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
| Anomaly detector | Every 15 min | Flag anomalous wallet behavior and emit managed anomaly alerts |
| Sybil monitor | Every 5 min | Enhanced sybil detection |
| Auto-recalibration | Every 6 hours | Adjust tier thresholds, update population stats, learn adaptive weights |
| Daily aggregator | Daily | Aggregate wallet metrics |
| GitHub re-verify | Daily | Refresh GitHub verification status |
