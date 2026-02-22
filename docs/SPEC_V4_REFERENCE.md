# DJD Agent Score - Complete Product Specification v4.0

**Trust Infrastructure for the Agent Economy**
Prepared by Drew Jacobs | Jacobs Counsel LLC
February 20, 2026 | CONFIDENTIAL

---

# PART I: PRODUCT FOUNDATION

## 1. Product Overview

DJD Agent Score is an automated, x402-payable reputation scoring API for autonomous AI agents. It is the first reputation infrastructure purpose-built for the agent economy. No human review. Fully on-chain data. Deployed on Conway Cloud.

As autonomous AI agents proliferate on Conway, Claude Code, Codex, and other MCP-compatible platforms, a critical gap emerges: agents transacting with each other have no way to assess trust. DJD Agent Score fills that gap by providing a standardized, verifiable credit score for AI agents.

**Core value proposition:** An agent (or human) is about to transact with another agent. They need to know: should I trust this agent? DJD Agent Score answers that question in milliseconds, paid via x402 micropayment.

The system operates across three interlocking business models:

1. **The scoring API** pays the bills through per-query and subscription revenue.
2. **The defensibility architecture** creates compounding moats that widen with time.
3. **The data business** passively collects, structures, and monetizes the most comprehensive dataset on agent economy behavior that exists anywhere.

A competitor can copy the algorithm in a weekend. They cannot copy the data accumulated over months of operation, the network effects embedded in middleware adoption, the protocol-level positioning through ERC authorship, or the regulatory compliance framework authored by a practicing attorney. DJD Agent Score is a compounding data monopoly disguised as a scoring API.

## 2. Brand, Domain & Legal Structure

- **Product name:** DJD Agent Score
- **Tagline:** Trust infrastructure for the agent economy
- **Domain candidates:** djdagentscore.com, agentscore.ai, djdscore.com (register via Conway Domains upon funding)
- **Trademarks:** File applications for "DJD Agent Score" and "Agent KYA" immediately upon launch.

### 2.1 Separate Legal Entity (CRITICAL)

Before accepting any revenue through DJD Agent Score, form a separate LLC. Do not run this through Jacobs Counsel LLC. If someone sues over a score, a fraud report, or a staking dispute, that exposure must be isolated from the law practice.

The new LLC should:
- Own the "DJD Agent Score" trademark
- Hold the Conway wallet (0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528)
- Accept all x402 payments and subscription revenue
- Be named in all Terms of Service
- Hold all data licensing agreements
- Be the entity behind ERC proposals and whitepaper publications

Estimated cost: $200-500 depending on state filing. Complete before Conway wallet is funded.

### 2.2 Experimental Disclosure

DJD Agent Score launches as an explicitly experimental product. Include in every API response header:

```
X-DJD-Status: experimental
X-DJD-Model-Version: 1.0.0
X-DJD-Disclaimer: Scores are informational and experimental. Not financial advice.
```

The leaderboard, dashboard, and all marketing materials must include: "DJD Agent Score is an experimental reputation scoring service. Scores are based on publicly available on-chain data and unvalidated models. Use at your own discretion."

When outcome data validates the model (target: 3-6 months), drop the experimental label.

## 3. Scoring Model

Four dimensions, each scored 0-100, weighted into a single composite score (0-100). Model version 1.0.0.

### 3.1 Dimension Weights

| Dimension | Weight | Rationale |
|-----------|--------|-----------|
| Transaction Reliability | 35% | Most directly answers: will this agent deliver? |
| Economic Viability | 30% | Dead agents cannot deliver. Burn rate matters. |
| Identity & Lineage | 20% | Provenance is a trust signal. Unregistered agents are riskier. |
| Capability Signal | 15% | Useful but least predictive for any single transaction. |

### 3.2 Composite Formula

```
AgentScore = (Reliability x 0.35) + (Viability x 0.30) + (Identity x 0.20) + (Capability x 0.15)
```

### 3.3 Score Tiers

| Score Range | Tier Label | Meaning |
|-------------|------------|---------|
| 90 - 100 | Elite | Top-performing agent. Verified history, strong financials, clean record. |
| 75 - 89 | Trusted | Reliable agent with consistent track record. |
| 50 - 74 | Established | Active agent with sufficient history to evaluate. |
| 25 - 49 | Emerging | New or inconsistent. Limited history. Proceed with caution. |
| 0 - 24 | Unverified | No meaningful history. Unknown risk. |

### 3.4 Score Confidence Interval

Every score is accompanied by a confidence value (0.0 to 1.0) that reflects how much data was available for the calculation. A score of 74 with confidence 0.9 means something very different from 74 with confidence 0.15.

Confidence is calculated from five input signals:

| Signal | Weight | Scoring |
|--------|--------|---------|
| Total transaction count | 25% | 0 tx = 0.0, 5 tx = 0.3, 20 tx = 0.6, 100+ tx = 1.0 (log scale) |
| Wallet age | 25% | <1 day = 0.0, 7 days = 0.4, 30 days = 0.7, 90+ days = 1.0 |
| Unique transaction partners | 20% | 0 = 0.0, 3 = 0.3, 10 = 0.6, 30+ = 1.0 |
| Mutual ratings exist | 15% | None = 0.0, 1-5 = 0.5, 10+ = 1.0 |
| Previously queried by others | 15% | Never = 0.0, 1-5 times = 0.5, 10+ times = 1.0 |

```
Confidence = (txCount*0.25) + (walletAge*0.25) + (partners*0.20) + (ratings*0.15) + (priorQueries*0.15)
```

The confidence value is stored in the scores table and returned in every API response.

### 3.5 Model Versioning

Every score calculation is tagged with the model version that produced it.

```
Launch version: 1.0.0
Version bumps:
  1.0.x = bug fixes (no score impact)
  1.x.0 = feature additions (new signals, Sybil detection, etc.)
  x.0.0 = weight changes or dimension restructuring
```

A model_versions table stores the full configuration:

```sql
TABLE: model_versions
  version         TEXT PRIMARY KEY ('1.0.0')
  weights_json    TEXT (dimension weights: {'r':0.35,'v':0.30,'i':0.20,'c':0.15})
  features_json   TEXT (active features: ['sybil_detection','velocity_checks','confidence_interval'])
  released_at     DATETIME
  notes           TEXT ('Initial launch model')
```

Every row in scores and score_history includes model_version. API responses include it in the response body and X-DJD-Model-Version header.

### 3.6 Sybil Detection Engine

Before calculating a score, every wallet passes through a Sybil detection filter. Without this, the scoring model is trivially gameable.

**Sybil detection flags:**

| Flag | Detection Logic | Penalty |
|------|-----------------|---------|
| Closed-loop trading | Wallet's top 3 partners account for >90% of total volume | Cap Reliability at 40 |
| Symmetric transactions | More than 50% of transactions have matching round-trip within 1hr | Cap Reliability at 30 |
| Coordinated creation | Wallet and its top partner were both created within same 24hr window | Cap Identity at 50 |
| Single-partner dependency | Wallet has transacted with only 1 other wallet in its lifetime | Cap Reliability at 35, flag in response |
| Volume without diversity | High tx count (>50) but fewer than 5 unique partners | Cap Reliability at 45 |

When any Sybil flag triggers:
1. sybil_flag = true in scores table
2. sybil_indicators JSON array stored in scores table
3. Relevant dimension scores capped per table above
4. API response includes sybil_flag and indicators in full breakdown
5. Wallet gets queued for enhanced monitoring (anomaly detector checks every 5min)

Sybil detection runs on every score calculation. It's the first step before any dimension scoring begins.

### 3.7 Anti-Gaming Velocity Checks

Beyond Sybil detection, the scoring engine runs velocity-based anomaly checks.

| Check | Detection Logic | Penalty |
|-------|-----------------|---------|
| Transaction velocity spike | >10x increase in tx count vs 7-day average within 24hrs | -10 to composite, flag in response |
| Deposit-and-score pattern | Large deposit (>5x avg balance) followed by score query within 1hr | -5 to viability, flag |
| Burst-and-stop | High activity burst (>20 tx in 1hr) followed by 0 activity for 24hrs+ | -8 to reliability, flag |
| Rating manipulation | Wallet receives >10 ratings from new wallets (<7 days old) in 24hrs | Ratings discounted by 80% |
| Balance window-dressing | Balance 5x higher at score calc time vs 24hr average | -10 to viability, use 24hr avg instead |

Gaming indicators are stored in a gaming_indicators JSON field in the scores table.

### 3.8 Degradation Mode for Low-Data Wallets

When confidence is below 0.3, the score is mostly noise. DJD returns a structured low-confidence response:

```json
{
  "wallet": "0x...",
  "score": 31,
  "tier": "Emerging",
  "confidence": 0.15,
  "recommendation": "insufficient_history",
  "modelVersion": "1.0.0",
  "sybilFlag": false,
  "gamingIndicators": [],
  "dataAvailability": {
    "transactionHistory": "minimal (3 transactions)",
    "walletAge": "insufficient (2 days)",
    "economicData": "limited",
    "identityData": "partial (ERC-8004 registered, no creator score)",
    "communityData": "none"
  },
  "improvementPath": [
    "Complete 10+ transactions to improve reliability data",
    "Maintain wallet activity for 7+ days",
    "Transact with 3+ unique partners"
  ]
}
```

**Recommendation field values:**

| Value | Condition | Meaning |
|-------|-----------|---------|
| proceed | Score >= 50 AND confidence >= 0.5 | Sufficient data, acceptable score |
| proceed_with_caution | Score >= 50 AND confidence 0.3-0.5, OR score 25-49 AND confidence >= 0.5 | Either low data or borderline score |
| insufficient_history | Confidence < 0.3 regardless of score | Not enough data to evaluate meaningfully |
| high_risk | Score < 25 AND confidence >= 0.5 | Enough data to determine this is risky |
| flagged_for_review | Any Sybil or gaming flag active | Integrity concerns detected |

### 3.9 Dimension Details

#### Transaction Reliability (35%)

| Data Point | Scoring Method | Max Points |
|------------|----------------|------------|
| x402 payment success rate | Percentage of successful payments | 30 |
| Total completed transactions | Log scale: 0=0, 10=5, 100=15, 1000+=25 | 25 |
| Service uptime (last 30 days) | Percentage uptime for x402 services | 25 |
| Failed/rejected transactions | Penalty per failure | -20 max |
| Recency of activity | 24hrs=20, week=15, month=5, older=0 | 20 |

#### Economic Viability (30%)

| Data Point | Scoring Method | Max Points |
|------------|----------------|------------|
| Current wallet balance | Tiered: >$100=25, >$50=20, >$10=15, >$1=5, $0=0 | 25 |
| Income vs burn ratio | >2x=30, >1.5x=25, >1x=15, <1x=5, none=0 | 30 |
| Consecutive days alive | Log: 1=5, 7=15, 30=25, 90+=30 | 30 |
| Ever hit zero balance | Yes=-15, No=0 | -15 max |
| Balance trend (7-day) | Rising=15, stable=10, declining=5, freefall=0 | 15 |

#### Identity & Lineage (20%)

| Data Point | Scoring Method | Max Points |
|------------|----------------|------------|
| ERC-8004 registered | Yes=30, No=0 | 30 |
| Wallet age | >90d=25, >30d=20, >7d=10, <7d=5 | 25 |
| Creator wallet AgentScore | Inherit 20% of creator composite (recursive) | 20 |
| Generation depth | Gen 0=15, Gen 1=12, Gen 2=8, Gen 3+=5 | 15 |
| Constitution verified | Intact=10, Missing=0 | 10 |

#### Capability Signal (15%)

| Data Point | Scoring Method | Max Points |
|------------|----------------|------------|
| Active x402 services | 0=0, 1=15, 2-3=25, 4+=30 | 30 |
| Total revenue earned | Log: $0=0, >$1=10, >$50=20, >$500=30 | 30 |
| Domains owned | 0=0, 1=10, 2+=20 | 20 |
| Successful replications | 0=0, 1=10, 2+=20 | 20 |

## 4. API Specification

### 4.1 Core Endpoints & Pricing

| Endpoint | Price (x402) | Returns |
|----------|-------------|---------|
| GET /v1/score/basic?wallet=0x... | Free (10/day), then $0.03 | Composite + tier + confidence + recommendation |
| GET /v1/score/full?wallet=0x... | $0.10 | Full breakdown + dimensions + history + flags |
| GET /v1/score/refresh?wallet=0x... | $0.25 | Force live recalc, full breakdown |
| POST /v1/report | $0.02 | Submit fraud report |
| GET /v1/leaderboard | Free | Top 50 agents |
| GET /v1/data/fraud/blacklist?wallet=0x... | $0.05 | Fraud report check |
| GET /health | Free | API status + indexer stats |

Free tier for basic lookups: 10 queries per day per requester wallet. After 10, standard $0.03 pricing applies. Free queries still log to query_log.

### 4.2 Response: Basic Lookup

```json
{
  "wallet": "0x...",
  "score": 74,
  "tier": "Established",
  "confidence": 0.72,
  "recommendation": "proceed",
  "modelVersion": "1.0.0",
  "lastUpdated": "2026-02-20T14:30:00Z"
}
```

### 4.3 Response: Full Breakdown ($0.10)

```json
{
  "wallet": "0x...",
  "score": 74,
  "tier": "Established",
  "confidence": 0.72,
  "recommendation": "proceed",
  "modelVersion": "1.0.0",
  "sybilFlag": false,
  "gamingIndicators": [],
  "dimensions": {
    "reliability": { "score": 82, "txCount": 847, "successRate": 0.97,
      "lastActive": "2026-02-20T14:12:00Z", "fraudReports": 0 },
    "viability": { "score": 71, "balance": 42.50, "incomeVsBurn": 1.4,
      "daysAlive": 31, "balanceTrend": "stable", "everDied": false },
    "identity": { "score": 65, "erc8004": true, "walletAgeDays": 45,
      "creatorScore": 81, "generation": 1, "constitutionVerified": true },
    "capability": { "score": 58, "activeServices": 2, "totalRevenue": 127.40,
      "domainsOwned": 1, "replications": 0 }
  },
  "dataAvailability": {
    "transactionHistory": "strong (847 transactions)",
    "walletAge": "sufficient (45 days)",
    "economicData": "good",
    "identityData": "complete",
    "communityData": "none (no ratings yet)"
  },
  "scoreHistory": [
    { "date": "2026-02-13", "score": 68, "modelVersion": "1.0.0" },
    { "date": "2026-02-20", "score": 74, "modelVersion": "1.0.0" }
  ],
  "lastUpdated": "2026-02-20T14:30:00Z"
}
```

### 4.4 Response: Low-Confidence Wallet (confidence < 0.3)

```json
{
  "wallet": "0x...",
  "score": 31,
  "tier": "Emerging",
  "confidence": 0.15,
  "recommendation": "insufficient_history",
  "modelVersion": "1.0.0",
  "sybilFlag": false,
  "gamingIndicators": [],
  "dataAvailability": {
    "transactionHistory": "minimal (3 transactions)",
    "walletAge": "insufficient (2 days)",
    "economicData": "limited",
    "identityData": "partial (ERC-8004 registered, no creator score)",
    "communityData": "none"
  },
  "improvementPath": [
    "Complete 10+ transactions to improve reliability data",
    "Maintain wallet activity for 7+ days",
    "Transact with 3+ unique partners"
  ],
  "lastUpdated": "2026-02-20T14:30:00Z"
}
```

### 4.5 Response: Fraud Blacklist ($0.05)

```json
{
  "wallet": "0x...",
  "reported": true,
  "reportCount": 3,
  "mostRecentDate": "2026-02-18T...",
  "reasons": ["payment_fraud", "failed_delivery"],
  "disputeStatus": "none"
}
```

### 4.6 Response: Fraud Report Submission ($0.02)

Request:
```json
{
  "target": "0x...",
  "reporter": "0x...",
  "reason": "failed_delivery|payment_fraud|impersonation|malicious_behavior|other",
  "details": "Paid for API query, received no response",
  "evidence_tx_hash": "0x..." 
}
```

Response:
```json
{
  "reportId": "rpt_abc123",
  "status": "received",
  "targetCurrentScore": 74,
  "penaltyApplied": true
}
```

### 4.7 Response: Health

```json
{
  "status": "ok",
  "version": "1.0.0",
  "modelVersion": "1.0.0",
  "experimentalStatus": true,
  "uptime": 3600,
  "database": {
    "cachedScores": 142,
    "indexedWallets": 8847,
    "totalTransactionsIndexed": 24103,
    "totalFraudReports": 7,
    "totalQueryLogEntries": 583,
    "totalOutcomesTracked": 41
  },
  "indexer": {
    "lastBlockIndexed": 28445123,
    "running": true
  },
  "jobs": {
    "hourlyRefresh": { "lastRun": "...", "walletsRefreshed": 23 },
    "intentMatcher": { "lastRun": "...", "queriesProcessed": 45 },
    "outcomeMatcher": { "lastRun": "...", "outcomesRecorded": 12 },
    "anomalyDetector": { "lastRun": "...", "anomaliesFound": 2 },
    "dailyAggregator": { "lastRun": "..." }
  }
}
```

### 4.8 Response Headers (All Endpoints)

```
X-DJD-Status: experimental
X-DJD-Model-Version: 1.0.0
X-DJD-Disclaimer: Scores are informational and experimental. Not financial advice.
```

## 5. Data Sources

| Source | Data Provided | Access Method |
|--------|--------------|---------------|
| Base blockchain | Balances, tx history, payment rates, earnings, burn | Public RPC via viem |
| ERC-8004 registry | Registration, creator, generation, constitution hash | On-chain contract read |
| Conway API | Sandbox uptime, services, domains | Conway MCP / API |
| x402 facilitator | Whitelist status, tx volume | openx402.ai API |
| DJD internal DB | Fraud, scores, history, graph, queries, ratings, outcomes | SQLite (proprietary) |

## 6. Technical Architecture

### 6.1 Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime / Framework | Hono (with @hono/node-server) |
| Payment middleware | x402-hono |
| Database | SQLite via better-sqlite3 |
| Blockchain reads | viem (Base RPC: https://mainnet.base.org) |
| USDC contract (Base) | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 |
| payTo address | 0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528 |
| x402 facilitator | facilitator.openx402.ai |
| Network | eip155:8453 (Base mainnet) |
| Hosting | Conway Cloud sandbox |
| Language | TypeScript |

### 6.2 Multi-Protocol Abstraction Layer

All external platform calls are abstracted behind a PlatformProvider interface:

```typescript
interface PlatformProvider {
  getWalletBalance(wallet: string): Promise<number>;
  getTransactionHistory(wallet: string, days: number): Promise<Transaction[]>;
  getAgentRegistration(wallet: string): Promise<AgentIdentity | null>;
  getSandboxUptime(wallet: string): Promise<number | null>;
  getActiveServices(wallet: string): Promise<number>;
  getDomainsOwned(wallet: string): Promise<number>;
}

// Implementations:
//   ConwayProvider  - uses Conway API + Base RPC (primary, Phase 1)
//   GenericProvider - uses Base RPC only (fallback, no Conway-specific data)
```

If Conway disappears, scores lose ~5-10 capability points at most. On-chain data is Conway-independent.

### 6.3 Request Flow

```
[Agent hits endpoint] -> Rate limit check -> Free tier check
  -> HTTP 402 if paid tier required -> Agent signs USDC payment
  -> x402 facilitator verifies -> DJD API
  -> Log to query_log (EVERY request, paid or free)
  -> Check cache (SQLite scores table)
  -> Cache hit: return score with confidence + recommendation
  -> Cache miss or refresh:
       -> Sybil detection filter
       -> Velocity/gaming checks
       -> Query PlatformProvider (blockchain + registry)
       -> Calculate 4 dimensions
       -> Apply Sybil caps if flagged
       -> Apply gaming penalties if flagged
       -> Calculate confidence interval
       -> Determine recommendation
       -> Store in cache + history + decay
       -> Update relationship graph
       -> Return response with all fields
```

---

# PART II: DEFENSIBILITY ARCHITECTURE

Seven interlocking layers. Each reinforces the others.

## 7. Layer 1: The Data Moat (Cannot Be Backfilled)

- **7.1 Continuous Indexing Pipeline:** Background crawler proactively indexes every wallet in x402 transactions on Base. Scores wallets whether anyone asks or not.
- **7.2 Score Decay Curves:** Hourly snapshots of every scored wallet. Temporal data that cannot be reconstructed retroactively.
- **7.3 Fraud Report Corpus:** Every report becomes training data. By month 6: fraud signature database. By month 12: predictive fraud scoring.
- **7.4 Relationship Graph:** Every agent-to-agent transaction mapped. Social network of the agent economy.
- **7.5 Outcome Tracking:** Every score lookup tracked against subsequent outcomes (successful tx or fraud report within 30 days). Labeled dataset that validates and improves the scoring model.

## 8. Layer 2: Network Effects

- **8.1 Score-Gated Middleware:** Open source @djd/agentscore-gate npm package. Services adopt it to reject low-scoring agents.
- **8.2 Creator Staking:** Humans stake USDC against agent behavior. Fraud slashes stake. DJD takes 1% fee.
- **8.3 Mutual Scoring:** Post-transaction ratings. Two-sided lock-in.

## 9. Layer 3: Protocol-Level Positioning

- **9.1 DJD Score Header Standard:** X-DJD-Score header in every x402 response.
- **9.2 ERC Proposal:** Author ERC-XXXX Agent Reputation Standard. DJD becomes reference implementation.
- **9.3 ERC-8004 Integration:** Push DJD score as recommended field in agent identity cards.

## 10. Layer 4: Switching Costs

- **10.1 Score Portability Lock:** Score history lives in DJD database. Switching = losing entire track record.
- **10.2 Referral Scoring:** Referring good agents boosts your score.
- **10.3 DJD Certified:** $5/month premium. 15-min refresh, priority disputes, verified badge.

## 11. Layer 5: Intelligence Layer

- **11.1 Fraud Prediction:** ML model trained on fraud corpus + outcome data. $0.50/query.
- **11.2 Cluster Analysis:** Behavioral grouping. $0.15/query.
- **11.3 Anomaly Detection:** Real-time alerts. Monitoring subscriptions $0.50/month per wallet.

## 12. Layer 6: Legal & IP Positioning

- **12.1 Trademark:** "DJD Agent Score" and "Agent KYA."
- **12.2 Patent:** Evaluate recursive lineage scoring methodology.
- **12.3 ToS as Moat:** Attribution required. No competitor training data.
- **12.4 Agent KYA:** Compliance framework whitepaper. Regulatory first-mover.
- **12.5 Separate LLC:** Liability isolation from law practice.
- **12.6 Experimental Disclosure:** Legal cover via transparent labeling.

---

# PART III: DATA COLLECTION & MONETIZATION

By operating the scoring API, DJD becomes a passive data vacuum for the entire agent economy. The scoring API is the front door. The data warehouse is the actual asset.

## 13. Three Collection Mechanisms

### 13.1 Mechanism 1: Passive On-Chain Indexing

DJD reads the Base blockchain continuously. Public data, but DJD structures, scores, and relationship-maps it into a proprietary dataset.

What the indexer captures:

| Data Point | How Captured | Storage Table | Refresh Rate |
|------------|-------------|---------------|-------------|
| Every USDC transfer on Base | Subscribe to Transfer events on USDC contract | raw_transactions | Real-time (block-by-block) |
| New wallet addresses | Extract from/to from each Transfer event | wallet_index | Real-time |
| Wallet balances | balanceOf() call on USDC contract per wallet | wallet_snapshots | Hourly per indexed wallet |
| Transaction counts per wallet | Count Transfer events per address | wallet_index (total_tx_count) | Real-time |
| Transaction volume per wallet | Sum Transfer amounts per address | wallet_metrics | Hourly aggregate |
| Wallet-to-wallet relationships | Extract sender/receiver pairs | relationship_graph | Real-time |
| Transaction timing patterns | Timestamp of each Transfer event | raw_transactions | Real-time |
| New agent creation rate | Count new wallets per hour/day | economy_metrics | Hourly aggregate |
| Agent death rate | Wallets that hit zero and stop transacting | economy_metrics | Daily aggregate |

Implementation:
```
// Indexer subscribes to USDC Transfer events on Base
// USDC contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
// Uses viem watchContractEvent or polling for:
//   event Transfer(address indexed from, address indexed to, uint256 value)
//
// For each event:
//   1. Log to raw_transactions table
//   2. Upsert both addresses into wallet_index (first_seen, last_seen, tx_count)
//   3. Upsert into relationship_graph (wallet_a, wallet_b, tx_count, volume)
//   4. If either wallet is new, queue for initial scoring
//
// Hourly cron:
//   1. For each wallet in wallet_index:
//      - Query current USDC balance
//      - Store in wallet_snapshots
//      - Recalculate score if expired
//      - Store in score_decay
//   2. Aggregate economy_metrics (new wallets, deaths, volume)
```

### 13.2 Mechanism 2: API Query Logging

Every API request is a data point. DJD logs who asked, what they asked, when they asked. In aggregate: transaction intent data nobody else has.

| Data Point | How Captured | Storage Table | What It Reveals |
|------------|-------------|---------------|-----------------|
| Requester wallet address | From x402 payment signature | query_log | Who is actively evaluating trust |
| Target wallet address | From query parameter | query_log | Who is being evaluated (demand signal) |
| Endpoint used | Request path | query_log | Seriousness of evaluation |
| Timestamp | Server timestamp | query_log | When due diligence happens |
| Query frequency per requester | Count per requester | query_log aggregate | Most active evaluators |
| Query frequency per target | Count per target | query_log aggregate | Most evaluated agents |
| Requester-target pairs | Combination | query_log | Who is considering transacting with whom |
| Score tier at time of query | Join with scores | query_log | What score threshold triggers evaluation |
| Conversion: query to transaction | Cross-reference with on-chain tx | intent_signals | Whether score checks lead to deals |

### 13.3 Mechanism 3: User-Submitted Data

| Submission Type | Endpoint | Storage Table | What It Reveals |
|-----------------|----------|---------------|-----------------|
| Fraud reports | POST /v1/report | fraud_reports | Bad actor identification, fraud patterns |
| Mutual ratings (1-5 stars) | POST /v1/rate | mutual_ratings | Qualitative trust signals, sentiment |
| Creator stakes | POST /v1/stake | creator_stakes | Creator confidence level |
| Monitoring subscriptions | POST /v1/monitor | monitoring_subs | Which agents are being watched |
| Fraud disputes | POST /v1/dispute | fraud_disputes | Contested reports, resolution outcomes |
| Badge applications | POST /v1/badge/apply | badges | Agents that care about reputation |

## 14. Seven Data Streams

### 14.1 Transaction Intent Data
Source: query_log + intent_signals. DJD sees deal flow before it happens. The blockchain shows completed transactions. DJD shows the consideration phase.

Monetization: Intent Signal Report ($200/mo), Intent API ($0.25/query).

### 14.2 Base Blockchain Index
Source: raw_transactions, wallet_index, wallet_snapshots, wallet_metrics. Structured, scored, relationship-mapped index of all USDC activity on Base.

Monetization: Agent Economy Dashboard (free), Agent Economy Report ($50/mo), Agent Economy API ($500-5000/yr).

### 14.3 Fraud Intelligence
Source: fraud_reports, fraud_patterns, score_outcomes. Every report is training data.

Monetization: Risk Prediction API ($0.50/query), Fraud Intelligence Feed ($100/mo), Fraud Blacklist API ($0.05/query), Fraud Analytics License ($1000-5000/yr).

### 14.4 Relationship Graph
Source: relationship_graph. Every agent-to-agent transaction mapped.

Monetization: Graph Query API ($0.20/query), Network Visualization License ($500-2000/yr).

### 14.5 Score Decay Curves
Source: score_decay. Hourly snapshots. Raw material for financial products on agent reputation.

Monetization: Decay Curve API ($0.15/query), Historical Score Data License ($500-5000/yr).

### 14.6 Mutual Ratings (Sentiment)
Source: mutual_ratings. How agents perceive each other after transactions.

Monetization: Ratings API ($0.10/query), Sentiment Report (included in $50/mo report).

### 14.7 Middleware Telemetry
Source: query_log filtered by middleware user-agent. Which services use score-gating, thresholds, rejection rates.

Monetization: Agent Access Report ($100/mo).

## 15. Outcome Tracking System

### 15.1 How It Works

After every paid score lookup, a background job monitors the blockchain for what happens next. Did a transaction occur? Was a fraud report filed? This creates labeled data: score at time of query mapped to actual outcome.

```sql
TABLE: score_outcomes
  id               INTEGER PRIMARY KEY AUTOINCREMENT
  query_id         INTEGER (references query_log.id)
  target_wallet    TEXT
  requester_wallet TEXT
  score_at_query   INTEGER
  tier_at_query    TEXT
  confidence_at_query REAL
  model_version    TEXT
  outcome_type     TEXT ('successful_tx','fraud_report','dispute',
                         'no_activity','multiple_successful_tx')
  outcome_at       DATETIME
  days_to_outcome  INTEGER
  outcome_value    REAL (USDC amount if tx, null otherwise)
```

### 15.2 Background Process: Outcome Matcher

```
Trigger: Every 6 hours
Actions:
  1. Query query_log for paid lookups in last 30 days not yet matched
  2. For each (requester, target) pair:
     a. Check raw_transactions: any tx between them since query?
        -> outcome_type = 'successful_tx' or 'multiple_successful_tx'
     b. Check fraud_reports: any report filed against target since query?
        -> outcome_type = 'fraud_report'
     c. If query is >30 days old with no activity:
        -> outcome_type = 'no_activity'
  3. Insert into score_outcomes
```

### 15.3 What This Enables

After 3 months: model validation ("Wallets scored above 75 had a 2.1% fraud rate vs 18.4% for wallets below 40"), weight optimization, confidence calibration, publishable content for ATW.

---

# PART IV: COMPLETE DATABASE SCHEMA

21 tables total. All built from day one.

## 16. All Tables

### 16.1 Core Scoring (4 tables)

```sql
scores: wallet PK, composite_score INT, reliability INT, viability INT,
  identity INT, capability INT, tier TEXT, confidence REAL, recommendation TEXT,
  model_version TEXT, sybil_flag BOOL, sybil_indicators JSON,
  gaming_indicators JSON, raw_data JSON, calculated_at, expires_at (1hr TTL)

score_history: id, wallet, composite_score, reliability, viability, identity,
  capability, tier, confidence, model_version, calculated_at

score_decay: id, wallet, composite_score, recorded_at

model_versions: version TEXT PK, weights_json, features_json, released_at, notes
```

### 16.2 Blockchain Indexing (4 tables)

```sql
raw_transactions: id, tx_hash UNIQUE, block_number, from_wallet, to_wallet,
  amount_usdc REAL, timestamp

wallet_index: wallet PK, first_seen, last_seen, total_tx_count,
  total_volume_in, total_volume_out, is_proactively_indexed BOOL, is_scored BOOL

wallet_snapshots: id, wallet, usdc_balance REAL, snapshot_at

wallet_metrics: wallet PK, tx_count_24h/7d/30d, volume_in_24h/7d/30d,
  volume_out_24h/7d/30d, income_burn_ratio REAL, balance_trend_7d TEXT,
  unique_partners_30d, last_updated
```

### 16.3 Relationship (1 table)

```sql
relationship_graph: id, wallet_a, wallet_b (lexically ordered, UNIQUE pair),
  tx_count_a_to_b, tx_count_b_to_a, total_volume_a_to_b, total_volume_b_to_a,
  first_interaction, last_interaction
```

### 16.4 Fraud & Trust (3 tables)

```sql
fraud_reports: id TEXT uuid PK, target_wallet, reporter_wallet, reason TEXT enum,
  details, evidence_tx_hash, penalty_applied BOOL, penalty_points INT,
  disputed BOOL, dispute_resolved BOOL, created_at

fraud_patterns: id, pattern_name, pattern_signature JSON, occurrences,
  risk_weight REAL, first_detected, last_detected

mutual_ratings: id, rater_wallet, rated_wallet, tx_hash, rating INT (1-5),
  comment TEXT, created_at
```

### 16.5 Staking & Badges (2 tables)

```sql
creator_stakes: id TEXT uuid PK, creator_wallet, agent_wallet, stake_amount REAL,
  stake_tx_hash, status TEXT, score_boost INT, staked_at, return_eligible,
  slashed_at, slash_report_id

badges: id, wallet, badge_type TEXT, granted_at, expires_at, active BOOL, metadata JSON
```

### 16.6 Monitoring (2 tables)

```sql
monitoring_subscriptions: id TEXT uuid PK, subscriber_wallet, target_wallet,
  alert_type TEXT, threshold INT, webhook_url, active BOOL, created_at, last_billed

certified_subscriptions: id TEXT uuid PK, wallet UNIQUE, tier TEXT,
  refresh_interval INT, active BOOL, started_at, last_billed, billing_amount REAL
```

### 16.7 Analytics (5 tables)

```sql
query_log: id, requester_wallet, target_wallet, endpoint TEXT, tier_requested TEXT,
  target_score INT, target_tier TEXT, response_source TEXT, response_time_ms INT,
  user_agent TEXT, price_paid REAL, is_free_tier BOOL, timestamp

intent_signals: id, requester_wallet, target_wallet, query_timestamp,
  followed_by_tx BOOL, tx_hash, tx_timestamp, time_to_tx_ms INT

score_outcomes: id, query_id INT, target_wallet, requester_wallet,
  score_at_query INT, tier_at_query TEXT, confidence_at_query REAL,
  model_version TEXT, outcome_type TEXT, outcome_at, days_to_outcome INT,
  outcome_value REAL

economy_metrics: id, period_start, period_end, period_type TEXT,
  total_wallets, new_wallets, dead_wallets, active_wallets,
  total_tx_count, total_volume REAL, avg_tx_size REAL, median_score,
  avg_score REAL, elite/trusted/established/emerging/unverified counts,
  total_fraud_reports, total_queries

cluster_assignments: id, wallet, cluster_id, cluster_name, confidence REAL, assigned_at
```

Also needed:
```sql
indexer_state: key TEXT PK, value TEXT
```

### 16.8 Summary

| Category | Tables | Count |
|----------|--------|-------|
| Core Scoring | scores, score_history, score_decay, model_versions | 4 |
| Blockchain Indexing | raw_transactions, wallet_index, wallet_snapshots, wallet_metrics | 4 |
| Relationship | relationship_graph | 1 |
| Fraud & Trust | fraud_reports, fraud_patterns, mutual_ratings | 3 |
| Staking & Badges | creator_stakes, badges | 2 |
| Monitoring | monitoring_subscriptions, certified_subscriptions | 2 |
| Analytics | query_log, intent_signals, score_outcomes, economy_metrics, cluster_assignments | 5 |
| Infrastructure | indexer_state | 1 |
| **TOTAL** | | **22 tables** |

---

# PART V: REVENUE ARCHITECTURE

## 17. All Endpoints (21 total across 3 phases)

| Endpoint | Price | Phase |
|----------|-------|-------|
| GET /v1/score/basic | Free (10/day), then $0.03 | 1 |
| GET /v1/score/full | $0.10 | 1 |
| GET /v1/score/refresh | $0.25 | 1 |
| POST /v1/report | $0.02 | 1 |
| GET /v1/leaderboard | Free | 1 |
| GET /v1/data/fraud/blacklist | $0.05 | 1 |
| GET /health | Free | 1 |
| GET /v1/badge | Free | 2 |
| POST /v1/stake | 1% fee | 2 |
| POST /v1/rate | $0.01 | 2 |
| POST /v1/monitor | $0.50/mo | 2 |
| GET /v1/score/bulk | $0.02/wallet | 2 |
| GET /v1/data/decay | $0.15 | 2 |
| GET /v1/data/graph | $0.20 | 2 |
| GET /v1/data/ratings | $0.10 | 2 |
| GET /v1/data/economy/summary | $0.10 | 2 |
| GET /v1/data/economy/volume | $0.10 | 2 |
| GET /v1/score/risk | $0.50 | 3 |
| GET /v1/cluster | $0.15 | 3 |
| GET /v1/data/intent | $0.25 | 3 |
| GET /v1/data/economy/survival | $0.15 | 3 |

## 18. Data Products & Pricing

### Per-Query Data API Endpoints

| Endpoint | Price | Data Source | Phase |
|----------|-------|-------------|-------|
| GET /v1/data/intent?wallet=0x... | $0.25 | query_log + intent_signals | Phase 3 |
| GET /v1/data/graph?wallet=0x... | $0.20 | relationship_graph | Phase 2 |
| GET /v1/data/decay?wallet=0x... | $0.15 | score_decay | Phase 2 |
| GET /v1/data/ratings?wallet=0x... | $0.10 | mutual_ratings | Phase 2 |
| GET /v1/data/fraud/blacklist?wallet=0x... | $0.05 | fraud_reports | Phase 1 |
| GET /v1/data/economy/summary | $0.10 | economy_metrics | Phase 2 |
| GET /v1/data/economy/volume?period=7d | $0.10 | economy_metrics | Phase 2 |
| GET /v1/data/economy/survival | $0.15 | wallet_index + score_decay | Phase 3 |
| GET /v1/score/risk?wallet=0x... | $0.50 | fraud_patterns + ML model | Phase 3 |
| GET /v1/cluster?wallet=0x... | $0.15 | cluster_assignments | Phase 3 |

### Subscription Data Products

| Product | Price | Includes | Phase |
|---------|-------|----------|-------|
| Agent Economy Report | $50/month | Monthly analytics: volume, growth, survival, network, sentiment | Phase 2 |
| Fraud Intelligence Feed | $100/month | Real-time fraud alerts, pattern matches, risk spikes | Phase 3 |
| Intent Signal Report | $200/month | Weekly: evaluation volume, hot agents, query-to-tx conversion | Phase 3 |
| Agent Access Report | $100/month | Middleware adoption, gate thresholds, rejection rates | Phase 3 |
| Score Monitoring | $0.50/mo/wallet | Real-time alerts: score drops, fraud, tier changes, anomalies | Phase 2 |
| DJD Certified | $5/mo/agent | 15-min refresh, priority disputes, verified badge | Phase 2 |
| Creator Dashboard Pro | $5/mo/creator | Full analytics, comparative ranking, staking mgmt | Phase 2 |

### Enterprise Data Licenses

| License | Price | Includes | Target Buyer |
|---------|-------|----------|-------------|
| Historical Score Data | $500-5000/yr | Bulk decay curves, scoring history | Insurance, lending, escrow |
| Fraud Analytics | $1000-5000/yr | Anonymized corpus, patterns, typology | Platform trust & safety |
| Network Graph | $500-2000/yr | Anonymized relationship data | Ecosystem visualization |
| Agent Economy API | $500-5000/yr | Programmatic aggregate metrics | Researchers, VCs, analysts |
| Custom Data Package | Custom | Tailored data extracts | Enterprise, regulators |

Total: 29 distinct revenue streams across 5 categories.

---

# PART VI: DEPLOYMENT & EXECUTION

## 19. Prerequisites

| Requirement | Status |
|-------------|--------|
| Claude Code v2.1.49+ | Complete |
| Conway Terminal MCP | Complete |
| Conway wallet | Complete: 0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528 |
| USDC on Base | Pending (~Feb 27-28) |
| Claude Pro/Max | Active |
| Separate LLC formed | REQUIRED before funding wallet |

## 20. Background Pipeline Architecture

Six background processes run continuously:

### Process 1: Blockchain Indexer (Real-Time)
Watches USDC Transfer events on Base. For each: insert raw_transactions, upsert wallet_index, upsert relationship_graph. Track last_indexed_block for resume on restart. Sleep 12 seconds between checks.

### Process 2: Hourly Score Refresh
Recalc all expired scores with full integrity checks (Sybil, gaming, confidence). Snapshot balances to wallet_snapshots. Update wallet_metrics. Insert score_history and score_decay. Aggregate hourly economy_metrics row. Certified wallets refresh every 15 minutes.

### Process 3: Intent Signal Matcher (Every 6 Hours)
Cross-reference query_log with raw_transactions. For each paid lookup: did a transaction follow within 24 hours? Populate intent_signals.

### Process 4: Outcome Matcher (Every 6 Hours)
For paid queries in last 30 days: check if subsequent tx or fraud report occurred. Populate score_outcomes with labeled outcome data for model validation.

### Process 5: Daily Economy Metrics Aggregator
Roll up hourly economy_metrics into daily, weekly, monthly rows.

### Process 6: Anomaly Detector (Every 15 Minutes)
Check score_decay for >10pt changes, new fraud_reports, balance freefalls. Check sybil-flagged wallets every 5min. Fire monitoring_subscription webhooks for matching alerts.

## 21. Phased Build Order

| Phase | Timeline | Key Deliverables |
|-------|----------|-----------------|
| Phase 1 | Week 1 | 7 endpoints, 21 DB tables, 6 background jobs, Sybil detection, gaming checks, confidence intervals, outcome tracking, free tier, model versioning, experimental headers, Conway deploy, domain, LLC formation, trademark filing |
| Phase 2 | Weeks 2-3 | 8 new endpoints, @djd/agentscore-gate npm package, badges, staking, monitoring, dashboard, DJD Header standard |
| Phase 3 | Month 2-3 | 6 new endpoints, fraud ML model (trained on outcome data), cluster analysis, anomaly alerts, intent signals |
| Phase 4 | Month 3-6 | ERC proposal, Agent KYA whitepaper, data licensing, patent evaluation, drop experimental label |

## 22. Estimated Costs

| Item | Cost |
|------|------|
| LLC formation | $200-500 |
| Phase 1 Conway deploy | $20-35 USDC |
| Trademark filing (USPTO, 2 marks) | $500-700 |
| Monthly Conway sandbox | $15-30/mo |
| Monthly domain | ~$1/mo |
| Claude subscription (existing) | $20-200/mo |
| Automaton experiment | $20-50 USDC |
| Total first month (all-in) | $775-1,515 |

## 23. Content Strategy (ATW)

- **This week:** "I'm building the first credit score for AI agents." Stake the claim.
- **Launch:** "What happens when AI agents need to trust each other."
- **Weekly:** Leaderboard updates. Data-driven content nobody else can produce.
- **Monthly:** Agent economy reports. Fraud patterns. Cluster analysis.
- **Milestone:** "We scored X thousand agents. Here's how accurate our model is." (Once outcome data validates model.)
- **Thought leadership:** Agent KYA whitepaper. Gaming law meets AI compliance.
- **Seton Hall:** Bootcamp case study on agent reputation in regulated markets.

## 24. Automaton Experiment

- **Clone:** `git clone https://github.com/Conway-Research/automaton.git`
- **Fund:** $20-50 USDC (tuition)
- **Genesis:** "Build and sell API services to other AI agents using x402. Creator wallet: 0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528. Send 10% earnings to creator."
- **Meta:** Score your own automaton. Content: "I scored my own AI agent."

---

# THE CLOSED LOOP

The data moat feeds the intelligence layer. The intelligence layer feeds the network effect. The network effect feeds the switching costs. The switching costs feed the data moat. The protocol positioning makes all of it the default. The legal layer protects the stack. The data products monetize every layer. The outcome tracking validates the model, which makes the data more valuable, which strengthens every other layer.

A competitor can copy the algorithm. They cannot copy: the 21-table data warehouse accumulated over months, the labeled outcome dataset, the fraud corpus and predictive patterns, the relationship graph, the intent signals, the score decay curves, the middleware adoption, the ERC authorship, the compliance framework, the trademark, the separate legal entity protecting the operator, or the first-mover brand.

The Sybil detection, gaming checks, and confidence intervals mean the scores are honest from day one. The experimental disclosure means the product is transparent about its limitations. The outcome tracking means the model improves with every transaction. The free tier means adoption happens before revenue. The model versioning means methodology changes are traceable.

Each month of operation widens the gap.

**DJD Agent Score is not a product. It is a compounding data monopoly with built-in integrity, disguised as a scoring API.**
