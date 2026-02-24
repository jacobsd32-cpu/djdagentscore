# DJD Agent Score — Deployment Checklist

Model version: **2.0.0**
Network: **Base Mainnet**
Experimental status: **true** (scores are informational, not financial advice)

---

## Pre-Deployment

### 1. Environment

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `PAY_TO` | `0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528` | Wallet that receives x402 payments |
| `FACILITATOR_URL` | `https://x402.org/facilitator` | x402 payment facilitator |
| `BASE_RPC_URL` | `https://base-mainnet.public.blastapi.io` | Base RPC endpoint |

No `.env` file is required — all variables have working defaults. Set `PAY_TO` to your deployment wallet before going live.

### 2. Node.js Version

Requires **Node.js v22** (tested on v22.22.0).

> **Known issue**: On first boot with Node.js 22, `tsx` may throw `ERR_INVALID_PACKAGE_CONFIG` for `viem` or `hono`. The process restarts automatically and starts cleanly. This is a one-time ESM cache warm-up artifact — not a bug.

### 3. Build

```bash
npm install
npm run build        # tsc — must exit 0 with no errors
```

### 4. Data Directory

The server creates `./data/scores.db` automatically on first start. No manual DB setup needed.

---

## Fly.io Deployment

The app is deployed on Fly.io with CI/CD via GitHub Actions (`fly-deploy.yml`). On merge to `main`, the pipeline runs tests, builds, and deploys automatically.

### Manual deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install --production

# 3. Build
npm run build

# 4. Deploy to Fly.io
fly deploy
```

For process management (PM2, systemd, Docker) use `npm run start` (`node dist/index.js`). Do not use `npm run dev` (`tsx watch`) in production.

---

## Post-Deployment Verification

Run these checks immediately after the server starts:

### Health Check
```bash
curl http://localhost:3000/health
```
Expected: `{"status":"ok","version":"2.0.0","modelVersion":"2.0.0",...}`

Key fields to verify:
- `status` = `"ok"`
- `modelVersion` = `"2.0.0"`
- `database.indexedWallets` > 0 (after indexer runs)
- `indexer.running` = `true`

### Database Tables (25 tables)
```bash
node -e "
const db = require('better-sqlite3')('./data/scores.db');
const t = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();
console.log(t.length, 'tables:', t.map(r=>r.name).join(', '));
"
```
Expected: 25+ tables including `scores`, `score_history`, `wallet_index`, `wallet_metrics`, `query_log`, `model_versions`, `api_keys`, `webhooks`, `certifications`.

### model_versions Seed
```bash
node -e "
const db = require('better-sqlite3')('./data/scores.db');
console.log(db.prepare('SELECT version, notes FROM model_versions').all());
"
```
Expected: `[{ version: '2.0.0', notes: '...' }]`

### Endpoint Smoke Tests
```bash
# Free endpoints — expect 200
curl -s http://localhost:3000/health | grep '"status":"ok"'
curl -s "http://localhost:3000/v1/leaderboard?limit=1" | grep '"leaderboard"'
curl -s "http://localhost:3000/v1/score/basic?wallet=0x0000000000000000000000000000000000000001" | grep '"modelVersion"'

# Paid endpoints — expect 402
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/v1/score/full?wallet=0x0000000000000000000000000000000000000001"
# → 402
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/v1/score/refresh?wallet=0x0000000000000000000000000000000000000001"
# → 402
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/v1/data/fraud/blacklist"
# → 402
```

### Response Headers
Every response must include:
```
x-djd-disclaimer: Scores are informational and experimental. Not financial advice.
x-djd-model-version: 2.0.0
x-djd-status: experimental
```

### Background Jobs
Within 2 minutes of startup, `/health` should show `intentMatcher.lastRun` and `outcomeMatcher.lastRun` populated with ISO timestamps (they fire 60s and 90s after startup).

Within 15 minutes: `anomalyDetector.lastRun` populated.

---

## First 24 Hours Checklist

- [ ] Blockchain indexer is advancing (`indexer.lastBlockIndexed` increasing over time)
- [ ] `query_log` is accumulating entries (check `database.totalQueryLogEntries` in `/health`)
- [ ] No crash loops in process logs
- [ ] `hourlyRefresh` fires within 1 hour (check `jobs.hourlyRefresh.lastRun` in `/health`)
- [ ] `dailyAggregator` fires within 24 hours
- [ ] x402 payment flow: attempt a `/v1/score/full` request with a valid x402 payment header and verify it returns 200 (requires a funded wallet and the x402 facilitator to be reachable)
- [ ] Fraud report endpoint: `POST /v1/report` with a test payload returns 200
- [ ] `/v1/leaderboard` returns wallets after the indexer has processed several hundred blocks

---

## Rollback

If the server fails to start:

1. Check `data/scores.db` is not locked by another process
2. Confirm Node.js v22: `node --version`
3. Rebuild: `npm run build`
4. If DB is corrupt: delete `data/scores.db` — the server recreates it on next start (all on-chain data will be re-indexed from the genesis block)

---

## Monitoring

- **Uptime**: `/health` → `uptime` (seconds since last start)
- **Indexer lag**: `/health` → `indexer.lastBlockIndexed` vs current Base block number
- **Query volume**: `/health` → `database.totalQueryLogEntries`
- **Fraud activity**: `/health` → `database.totalFraudReports`
- **Metrics**: `/metrics` → Prometheus-compatible endpoint for Grafana/Datadog
- **Anomalies**: `jobs.anomalyDetector.anomaliesFound` increments when score drops >10pts, balance freefalls, or new sybil flags are detected — subscribers are notified via webhook
