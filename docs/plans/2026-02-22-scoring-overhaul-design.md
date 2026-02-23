# Scoring System Overhaul — Design Document

**Date:** 2026-02-22
**Status:** Approved
**Model Version:** 1.0.0 → 2.0.0

## Goal

Transform DJD Agent Score from a generic wallet scorer (novelty: 5/10) into a novel AI agent reputation system with proprietary behavioral analysis, calibrated scoring, and transparent explainability.

## Five Priorities

### P1: Hybrid USDC Transfer Indexer

**Problem:** Scoring relies on per-request RPC queries. No historical data persists between requests, and scoring a single wallet requires multiple getLogs calls.

**Solution:** Forward-index ALL Base USDC transfers (not just x402) into a local SQLite table, with RPC fallback for wallets not yet covered.

**New files:**
- `src/jobs/usdcTransferIndexer.ts` — continuous forward indexer (mirrors `blockchainIndexer.ts` pattern)
- `src/jobs/usdcBackfill.ts` — one-time backfill of top-10K wallets from `wallet_index`

**New tables:**
- `usdc_transfers`: `tx_hash (UNIQUE), block_number, from_wallet, to_wallet, amount_usdc, timestamp`
- `wallet_transfer_stats`: `wallet (PK), total_tx_count, total_volume_in, total_volume_out, unique_partners, first_seen, last_seen, updated_at`

**Key details:**
- Separate from `raw_transactions` (which stays x402-only for gaming/sybil checks)
- State key: `'usdc_last_indexed_block'` in `indexer_state`
- Transfer events only (no AuthorizationUsed filter, no amount cap)
- Rate-limited: 10 getLogs/second to stay within BlastAPI free tier (40 req/s, 100K req/day)
- Forward indexing: ~7,200 calls/day. Backfill: ~2,000 calls one-time. Cost: $0/month.
- `wallet_transfer_stats` updated on each batch insert via SQL aggregation
- Engine falls back to direct RPC if wallet has no indexed data

### P2: Behavior Dimension (Temporal Behavioral Fingerprints)

**Problem:** Current 4 dimensions measure what a wallet has, not how it acts. Bots and humans have measurably different temporal patterns.

**Solution:** New 5th "Behavior" dimension using three temporal signals from transaction timestamps.

**New file:** `src/scoring/behavior.ts`

**Signals (100 points max):**

| Signal | Points | What it measures |
|--------|--------|-----------------|
| Inter-arrival CV | 35 | Coefficient of variation of time gaps between transactions. Low CV (robotic regularity) → low score. High CV (organic variability) → high score. |
| Hourly entropy | 35 | Shannon entropy of transaction hour-of-day distribution. Low entropy (single-hour bursts) → low score. High entropy (spread across hours) → high score. |
| Max gap (hours) | 30 | Longest period between any two consecutive transactions. No gap = suspicious constant activity. Multi-day gaps = organic downtime. |

**Minimum threshold:** Requires ≥10 transactions. Below that, returns `score: 50` (neutral) with `classification: 'insufficient_data'`.

**Classifications:** `organic`, `mixed`, `automated`, `suspicious`, `insufficient_data`

**New composite weights:**
```
reliability: 0.30  (was 0.35)
viability:   0.25  (was 0.30)
identity:    0.20  (unchanged)
behavior:    0.15  (new)
capability:  0.10  (was 0.15)
```

**Type changes:**
- New `BehaviorData` interface in `types.ts`
- `ScoreDimensions` gets `behavior?: { score: number; data: BehaviorData }`
- `ScoreRow` gets `behavior_score` column
- `model_versions` updated to `'2.0.0'` with new weights

### P3: Outcome Calibration

**Problem:** No feedback loop — scores are generated but never validated against real-world outcomes. No way to know if a "Trusted" agent actually behaves trustworthily.

**Solution:** Track post-score outcomes and generate weekly calibration reports. Human-in-the-loop only (no automatic weight adjustment).

**New/modified files:**
- `src/scoring/outcomeMatcher.ts` (enhanced) — match wallets to outcome labels
- `src/scoring/calibrationReport.ts` (new) — weekly aggregation job
- `src/routes/admin.ts` (new endpoint)

**Outcome labels:**
- `reliable_transactor` — continued healthy tx activity 30d post-score
- `growing` — score improved >5 pts in 30d
- `declining` — score dropped >5 pts in 30d
- `dormant` — zero transactions in 30d post-score
- `reported` — received fraud report
- `new` — scored <30d ago, insufficient data

**New table:** `calibration_reports`
```sql
id INTEGER PRIMARY KEY,
generated_at TEXT,
period_start TEXT, period_end TEXT,
total_scored INTEGER,
avg_score_by_outcome TEXT,  -- JSON: { reliable: 72, growing: 65, ... }
tier_accuracy TEXT,         -- JSON: { Elite: 0.85, Trusted: 0.72, ... }
recommendations TEXT,       -- JSON string[]
model_version TEXT
```

**New endpoint:** `GET /admin/calibration` — returns latest report. Protected by admin key.

### P4: Multiplicative Integrity Modifiers

**Problem:** Current sybil/gaming handling uses additive caps and penalties — confusing, creates dead zones, and can be gamed to specific caps.

**Solution:** Replace Steps 5-8 in `computeScore()` with a single multiplicative pass.

**Formula:**
```
finalScore = rawComposite * integrityMultiplier
```

Where `integrityMultiplier` starts at 1.0 and each detected indicator multiplies by a dampening factor:

**Sybil factors:**
| Indicator | Factor |
|-----------|--------|
| `wash_trading` | ×0.50 |
| `self_funding_loop` | ×0.60 |
| `coordinated_creation` | ×0.65 |
| `single_source_funding` | ×0.75 |
| `zero_organic_activity` | ×0.70 |
| `velocity_anomaly` | ×0.80 |
| `fan_out_funding` | ×0.60 |

**Gaming factors:**
| Indicator | Factor |
|-----------|--------|
| `balance_window_dressing` | ×0.85 |
| `burst_and_stop` | ×0.80 |
| `nonce_inflation` | ×0.75 |
| `artificial_partner_diversity` | ×0.70 |
| `revenue_recycling` | ×0.80 |

**Fraud reports:** `Math.pow(0.90, reportCount)` — each report applies 10% additional dampening.

**Floor:** `integrityMultiplier` never goes below 0.10 (scores floored at 10% of raw).

**What gets removed:**
- `sybil.caps` object (Step 5)
- `gaming.penalties` object (Step 6)
- `PENALTY_PER_REPORT` / `MAX_REPORT_PENALTY` constants
- Additive penalty application (Step 8)

**New response field:** `integrityMultiplier?: number` in `FullScoreResponse`

### P5: Score Explainability

**Problem:** API returns an opaque composite score. Developers can't understand why a wallet scored 62 or how to improve it.

**Solution:** Each dimension calculator returns per-sub-signal breakdown. API response includes contributors, detractors, and confidence-derived score range.

**Changes to dimension calculators:**
Each `calc*()` function returns `{ score, signals }` where `signals: Record<string, number>` maps sub-signal names to their point contributions.

Example for reliability:
```json
{
  "score": 72,
  "signals": {
    "txSuccessRate": 28,
    "txCountLog": 20,
    "nonceAlignment": 15,
    "uptimeEstimate": 9,
    "recencyBonus": 0
  }
}
```

**New response fields (all optional):**
```typescript
breakdown?: Record<string, Record<string, number>>  // dimension → signal → points
scoreRange?: { low: number; high: number }           // confidence interval
topContributors?: string[]                            // e.g., ["txSuccessRate (28 pts)", ...]
topDetractors?: string[]                              // e.g., ["recencyBonus (0/20 pts)", ...]
```

**Score range formula:**
```
halfWidth = Math.round((1 - confidence) * 15)
low = Math.max(0, score - halfWidth)
high = Math.min(100, score + halfWidth)
```

At confidence 1.0: range is ±0. At confidence 0.0: range is ±15.

## Backward Compatibility

All new API fields are optional (`?`). Existing integrations continue working unchanged. `BasicScoreResponse` is untouched. New fields only appear in `FullScoreResponse`.

## Verification Criteria

1. `npm run build` exits 0
2. All 5 dimension scores appear in full response
3. `integrityMultiplier` replaces sybil caps / gaming penalties
4. `breakdown` field shows per-signal contributions
5. Behavior dimension returns `insufficient_data` for wallets with <10 tx
6. USDC indexer runs alongside existing x402 indexer without interference
7. No domain references to old fly.dev or conway.tech URLs
