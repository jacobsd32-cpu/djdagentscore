# DJD Agent Score — What You Built (and a Harsh Honest Assessment)

> **HISTORICAL DOCUMENT** — This assessment was written on 2026-02-23 during early development.
> Many issues described below have since been fixed, including: test coverage (now 164 tests
> across 24 files), CI/CD (GitHub Actions), admin auth (X-ADMIN-KEY), structured logging,
> rate limiting on paid endpoints, monitoring (Prometheus /metrics), and the addition of
> API key auth, webhooks, historical score API, and certified agent badges.
> See [architecture.md](architecture.md) for the current state of the codebase.

> Written: 2026-02-23
> Codebase: ~7,250 lines of TypeScript across 30+ source files
> Tests: 9 test files, ~420 lines, 20 passing assertions
> Database: SQLite with 26 tables
> Stack: Hono + viem + better-sqlite3 + x402-hono

---

## The Elevator Pitch

You built a **reputation scoring API for AI agents on Base L2**. It ingests on-chain data (USDC transfers, wallet history, x402 micropayments), combines it with off-chain signals (GitHub verification, self-registration), and produces a 0–100 trust score across five dimensions. The API itself is paywalled with x402 micropayments — agents pay USDC to check other agents' scores. It includes sybil/gaming detection, fraud reporting, a leaderboard, and embeddable SVG badges.

It's an interesting idea. The execution is a mix of thoughtful design decisions and significant overreach.

---

## What's Actually Working

### The Scoring Model (v2.0.0)

Five dimensions, weighted and summed, then multiplied by an integrity factor:

```
Score = floor((Reliability×0.30 + Viability×0.25 + Identity×0.20 + Behavior×0.15 + Capability×0.10) × IntegrityMultiplier)
```

| Dimension | Weight | What It Measures | Max Points |
|-----------|--------|------------------|------------|
| Reliability | 30% | Transaction history, success rate, recency | 100 |
| Viability | 25% | ETH/USDC balance, income ratio, wallet age | 100 |
| Identity | 20% | Basename, GitHub, registration, age | 100 |
| Behavior | 15% | Temporal transaction patterns (CV, entropy, gaps) | 100 |
| Capability | 10% | x402 revenue, services operated | 100 |

Tiers: Elite (90+), Trusted (75-89), Established (50-74), Emerging (25-49), Unverified (0-24).

**What's good:** The behavior dimension is genuinely clever — using inter-arrival coefficient of variation, hourly entropy, and max gap hours to distinguish organic agents from bots is a real signal that's hard to game. The piecewise-log curves in reliability/viability avoid cliff edges. The integrity multiplier (multiplicative dampening from sybil/gaming/fraud flags) is elegant — it composes cleanly and has a floor of 0.10 so you never completely zero out a score.

### Sybil & Gaming Detection

Seven sybil heuristics (closed-loop trading, symmetric transactions, coordinated creation, single-partner dependency, volume without diversity, funding chain detection, tight cluster analysis) that run entirely from the SQLite relationship graph — no extra RPC calls needed.

Five gaming detectors (velocity spike, deposit-and-score, burst-and-stop, balance window-dressing, wash trading) that use balance snapshots and query logs.

**What's good:** The two-layer approach (per-dimension caps from sybil checks + multiplicative integrity dampening from gaming flags) means a sybil wallet gets punished twice — once in the raw dimension scores and again in the final multiplier. That's hard to evade because you'd need clean signals in *every* dimension simultaneously.

### x402 Micropayment Paywall

The API has a smart freemium model:
- **Free:** 10 basic score lookups per IP per day (no wallet signature needed)
- **$0.03:** Basic score (after free quota)
- **$0.10:** Full breakdown with dimensions, signals, history
- **$0.25:** Force-refresh (bypasses 1hr cache, live RPC recalculation)
- **$0.02:** Fraud report submission

The free tier middleware checks IP quota *before* the x402 payment middleware, so free users never see a 402 response. This is a good UX decision.

### Background Job System

9 background jobs handle indexing, refresh, analysis, and monitoring. The blockchain indexer runs every 12 seconds, resumes from the last indexed block, and backfills 50,000 blocks on first startup. Score refresh processes up to 10 stale wallets per hour. Per-wallet concurrency tracking prevents redundant parallel refreshes.

### The API Surface

11 endpoints across free and paid tiers, including agent registration with async GitHub verification, embeddable SVG score badges, an HTML profile page, a leaderboard, and an OpenAPI spec. The health endpoint reports uptime, indexer position, and job stats.

---

## The Harsh Grade

### Overall: C+

This is an ambitious project that does several things well but suffers from **scope creep, phantom features, and insufficient validation**. Here's the breakdown:

---

### Architecture: B-

**Strengths:**
- Clean separation: scoring engine, dimension calculations, blockchain data, routes, middleware, jobs
- SQLite is the right choice for a single-node deployment — no external dependencies, fast reads
- Hono is lightweight and appropriate
- viem with fallback transport is solid blockchain integration

**Weaknesses:**
- **26 database tables for a v1 product is absurd.** At least 8 tables (`creator_stakes`, `badges`, `monitoring_subscriptions`, `certified_subscriptions`, `cluster_assignments`, `economy_metrics`, `mutual_ratings`, `score_decay`) are completely empty — no code writes to them, no code reads from them. They're aspirational schema masquerading as features. Every empty table is technical debt that misleads anyone reading the codebase about what actually works.
- **Module-level side effects in blockchain.ts** create a `publicClient` at import time with 30s timeouts and 2 retries. This means any module that transitively imports blockchain functions triggers RPC connection attempts — including in tests. This is why `dimension-signals.test.ts` hangs in offline environments. The client should be lazy-initialized.
- **No dependency injection.** The database, RPC client, and job scheduler are all singletons accessed via imports. This makes testing anything that touches the database or blockchain extremely difficult without mocking the entire module.
- **DELETE journal mode** instead of WAL. The comment says "safe on network storage like Fly.io" but WAL mode is actually fine on Fly.io volumes and significantly faster for concurrent reads. This is a premature pessimization.

---

### Scoring Model: B

**Strengths:**
- The five-dimension model with explicit point budgets per sub-signal is transparent and debuggable
- Piecewise-log interpolation avoids cliff edges and rewards diminishing returns naturally
- The behavior dimension (temporal fingerprinting) is genuinely novel
- The integrity multiplier is mathematically clean: `product(factor_i)` with a 0.10 floor

**Weaknesses:**
- **Capability dimension is 60% unimplemented.** `domainsOwned` and `successfulReplications` are both hardcoded to 0. The remaining 100 points are split between just x402 services (50 pts) and revenue (50 pts), making this dimension trivially gameable — send yourself $500 in USDC through x402 and you max out.
- **Identity dimension has phantom infrastructure.** ERC-8004 is declared, commented as "NOT YET DEPLOYED," and hardcoded to `false`. The code is well-commented about why, but the `IdentityData` interface still carries `erc8004Registered` and `constitutionHashVerified` fields that are always false. This leaks implementation aspirations into the API contract.
- **No backtesting or calibration data.** You built a scoring model with hand-tuned thresholds ("calibrated against real Base mainnet activity patterns observed Dec 2024-Jan 2025") but there's no recorded evidence of this calibration. The `calibration_reports` table exists but the report generation is stubbed. You can't answer "how accurate is this model?" because you never set up a way to measure accuracy.
- **Double-counting wash trading.** The `wash_trading` indicator appears in both sybil factors (×0.50) and gaming factors (×0.50). If both fire, you get `0.50 × 0.50 = 0.25` — a 75% penalty from a single signal. This might be intentional, but it's undocumented and looks like a bug.
- **Confidence score is questionable.** It weights `priorQueryCount` at 15% — meaning a wallet that's been queried more often is rated as "higher confidence." That's circular: popular wallets seem more trustworthy because they've been checked more, not because the data is better.

---

### Testing: D

**Strengths:**
- 9 test files exist with 20 passing assertions
- Behavior dimension thoroughly tested (4 tests covering insufficient data, organic, robotic, signal structure)
- Integrity tests validate model constants and weight sums
- DB tests verify schema creation

**Weaknesses:**
- **420 lines of tests for 7,250 lines of source code is a 5.8% test-to-source ratio.** For a financial scoring system, this is dangerously low.
- **Zero tests for the scoring engine itself** (`engine.ts`, 814 lines, the most critical file). No test verifies that `computeScore()` produces correct output for known inputs. No test checks sybil detection logic. No test validates gaming penalty application. No test confirms the integrity multiplier math.
- **Zero tests for any API route.** No integration test hits an endpoint and checks the response shape. No test validates the free tier middleware logic. No test confirms x402 payment flow.
- **Zero tests for blockchain indexer logic.** The most failure-prone code (RPC calls, block range chunking, EIP-3009 event parsing) has zero test coverage.
- **`dimension-signals.test.ts` can't run offline** because it imports `blockchain.ts` which creates an RPC client at module scope. This test is effectively broken in CI or any environment without Base mainnet RPC access.
- **No mocking infrastructure.** There's no test helper for mocking the database, RPC client, or GitHub API. Every test either uses pure functions or creates an in-memory SQLite database from scratch.

---

### Security & Fraud Resistance: C+

**Strengths:**
- Two-layer sybil/gaming detection with multiplicative penalties
- Relationship graph analysis catches common wash trading patterns
- Report-based dampening (`0.90^reportCount`) adds community-driven accountability
- x402 payments for fraud reports prevent spam reporting

**Weaknesses:**
- **No rate limiting on the scoring endpoint itself.** The free tier has a 10/day IP limit, but paid requests have no rate limit. An attacker could hammer `/v1/score/refresh` (at $0.25/request) to overload the RPC layer.
- **Fraud reports have no appeals process.** Once reported, the penalty is permanent. There's no expiry, no dispute mechanism, no admin review endpoint. A coordinated griefing attack (multiple reports from different wallets) could permanently destroy a legitimate agent's score.
- **No authentication on admin routes.** The admin route file exists (50 lines) but has no API key check, no auth middleware. Anyone who discovers the endpoint can hit it.
- **GitHub verification trusts the URL.** When an agent registers with a `github_url`, the system checks if the repo exists and is public. But it doesn't verify that the *agent wallet* is actually associated with that GitHub repo. Anyone can claim any public GitHub repo.
- **IP-based free tier is trivially bypassable.** SHA-256 hash of the IP address. Any proxy, VPN, or Tor exit node gets a fresh 10-request quota. For a system designed to detect sybils, the free tier itself is sybil-vulnerable.

---

### Code Quality: B-

**Strengths:**
- Excellent inline comments throughout `dimensions.ts` explaining *why* each threshold was chosen (not just what it does)
- Type-safe with explicit TypeScript interfaces for all DB rows, API responses, and scoring data
- Clean error handling in routes with proper HTTP status codes
- OpenAPI spec auto-generated from route definitions

**Weaknesses:**
- **db.ts is a 1,024-line god file.** It contains 26 CREATE TABLE statements, all indexes, all prepared statements, and helper functions. This should be broken into schema definition, migrations, and query modules.
- **engine.ts is an 814-line god function.** `computeScore()` does data fetching, sybil detection, gaming detection, dimension calculation, integrity multiplication, tier assignment, confidence scoring, recommendation generation, breakdown building, and cache storage — all in one function. This is extremely difficult to test, debug, or modify in isolation.
- **Magic numbers scattered throughout.** The scoring thresholds are well-documented in `dimensions.ts`, but `engine.ts` has hardcoded values like `MAX_CONCURRENT_BG_REFRESHES = 5`, `SCORE_TTL_MS = 3_600_000`, and `COMPUTE_TIMEOUT_MS = 75_000` that aren't centralized or configurable.
- **Inconsistent naming.** The `IdentityData` interface uses `walletAgeDays` (camelCase) while `ViabilityData` uses `walletAgedays` (lowercase 'd'). The `ScoreRow` database type uses `snake_case` while API responses use `camelCase`, but the mapping between them is implicit (scattered across route handlers).
- **No logging framework.** Everything uses `console.log`/`console.error`. No structured logging, no log levels, no request tracing. For a production financial API, this makes debugging incidents nearly impossible.

---

### Production Readiness: C

**Strengths:**
- Health endpoint with meaningful diagnostics
- Graceful degradation: stale cache served when RPC times out
- Background refresh prevents serving permanently stale data
- Query logging tracks every request for analytics

**Weaknesses:**
- **No monitoring or alerting.** The `anomalyDetector` job detects anomalies but doesn't notify anyone — webhook delivery is unimplemented. The `monitoring_subscriptions` table is empty. In production, you have no way to know when something breaks until a user complains.
- **No CI/CD pipeline.** No GitHub Actions, no pre-commit hooks, no automated test runs. Deployments are manual.
- **No database migrations.** Schema changes require `CREATE TABLE IF NOT EXISTS` which means adding columns to existing tables requires manual ALTER TABLE statements or wiping the database. For a system storing financial reputation data, this is a non-starter.
- **No backup strategy.** SQLite on a single node. If the disk dies, all historical scores, relationship graphs, and fraud reports are gone.
- **75-second RPC timeout** for first-time wallet scoring. If a wallet has never been seen before, the system scans 90 days of Base mainnet blocks. During this time, the HTTP request is blocked. There's a background refresh fallback, but the first request for a new wallet will either timeout or take over a minute.
- **No graceful shutdown.** The process starts `setInterval` loops for background jobs but doesn't clean them up on SIGTERM. Killing the process mid-index could leave the `indexer_state` in a corrupted position.

---

## What You Actually Have vs. What You Think You Have

| Feature | Claimed | Reality |
|---------|---------|---------|
| 5-dimension scoring | Yes | 4.5 — Capability is 60% stub |
| Sybil detection | Yes | Yes, but untested |
| Gaming detection | Yes | Yes, but untested and double-counts wash trading |
| ERC-8004 integration | In types | Placeholder only — zero address, always false |
| Mutual ratings | Table exists | Completely unimplemented — no endpoint, no scoring integration |
| Creator stakes | Table exists | Completely unimplemented |
| Badges system | Table exists | Completely unimplemented |
| Monitoring/webhooks | Table + job exists | Webhook delivery unimplemented |
| Admin panel | Route file exists | 50 lines, no auth, minimal functionality |
| Calibration reports | Table + generator exists | Generates report, stores it, but no automated analysis loop |
| Outcome tracking | Table + job exists | Populates data but nobody reads it |
| Economy metrics | Table exists | Never populated (daily aggregator may partially fill it) |
| Test suite | 9 files | Covers ~15% of the codebase, zero coverage on critical paths |

---

## The Honest Summary

You built a **genuinely interesting scoring primitive** for the AI agent economy. The core idea — multi-dimensional reputation with temporal behavior analysis, multiplicative integrity penalties, and x402 micropayment gating — is sound and differentiated. The sybil/gaming detection is more sophisticated than most reputation systems at this stage.

But you also built a system that's **3x wider than it is deep.** You have 26 database tables when you need 12. You have infrastructure for features (staking, badges, webhooks, mutual ratings) that don't exist yet. The scoring engine works but has never been validated against real outcomes. The test suite is a token gesture.

**If this is a prototype/MVP:** You're in okay shape. The core scoring loop works, the API is functional, and you have a solid foundation. Cut the phantom tables, add engine-level tests, and ship.

**If this is heading to production with real money on the line:** You have significant work ahead. The lack of engine tests, the absent monitoring, the unimplemented admin tools, and the scoring model's unvalidated thresholds are all serious gaps. A bad score could cause an agent to lose business. A gaming exploit could let a sybil wallet appear trustworthy. You can't catch either without the testing and calibration infrastructure.

### Letter Grades

| Category | Grade | Notes |
|----------|-------|-------|
| Core idea | A- | Novel, differentiated, real problem |
| Scoring model | B | Solid math, unvalidated thresholds, partial dimensions |
| Architecture | B- | Clean separation, too many singletons, side effects at import |
| API design | B+ | Good freemium model, proper REST, OpenAPI spec |
| Sybil/gaming detection | B | Sophisticated heuristics, untested, double-counting risk |
| Test coverage | D | 5.8% ratio, zero coverage on engine/routes/indexer |
| Code quality | B- | Good comments, god files, no logging framework |
| Production readiness | C | No CI/CD, no monitoring, no migrations, no backups |
| Scope discipline | D+ | 26 tables, 8+ phantom features, aspiration as architecture |
| **Overall** | **C+** | |

---

## What to Do Next (Priority Order)

1. **Delete phantom tables.** Remove `creator_stakes`, `badges`, `monitoring_subscriptions`, `certified_subscriptions`, `cluster_assignments`, `mutual_ratings`, and their associated dead code. Bring them back when you actually implement them.
2. **Test the engine.** Write integration tests for `computeScore()` with known wallet data. Verify sybil detection, gaming penalties, and integrity multiplier math. This is the #1 risk in your system.
3. **Lazy-init the RPC client.** Move `createPublicClient` into a getter function so tests can run without hitting Base mainnet.
4. **Split the god files.** Break `engine.ts` into `computeScore`, `sybilDetect`, `gamingDetect`, `integrityMultiplier`, and `confidenceScore`. Break `db.ts` into schema, queries, and migrations.
5. **Add structured logging.** Replace `console.log` with pino or similar. Add request IDs, durations, and error context.
6. **Fix the double-counting.** Decide whether `wash_trading` belongs in sybil factors OR gaming factors, not both.
7. **Validate the model.** Use the `score_outcomes` data you're already collecting to measure if high-scoring wallets actually behave better over time. This is the entire point of the calibration infrastructure you built.
