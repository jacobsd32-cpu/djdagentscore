# Audit Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the highest-priority audit issues from DJD AgentScore, starting with production parity and public-surface risks, then repair discovery/docs consistency and public positioning.

**Architecture:** Use the runtime repo as the implementation base, but treat production parity as a gating task because the live site appears to differ from the checked-in code. Split the remediation into parallel domains with disjoint write sets, then integrate and verify centrally.

**Tech Stack:** Node.js, TypeScript, Hono, Fly.io, Biome, Vitest

---

### Task 1: Capture Production Parity And Baseline

**Files:**
- Create: `docs/plans/2026-04-10-audit-remediation-design.md`
- Create: `docs/plans/2026-04-10-audit-remediation.md`
- Modify: `README.md` only if deployment-source notes belong there after investigation

**Step 1: Record the baseline state**

Run:

```bash
npm install
npm run lint
npm test
```

Expected:
- `npm install` succeeds
- `npm run lint` fails with pre-existing Biome issues
- `npm test` fails in pre-existing route suites

**Step 2: Confirm the repo-to-production mapping**

Run:

```bash
git remote -v
sed -n '1,120p' fly.toml
curl -I -L https://djdagentscore.dev/
curl -i https://djdagentscore.dev/metrics | sed -n '1,40p'
curl -i https://djdagentscore.dev/robots.txt | sed -n '1,40p'
```

Expected:
- repo points to `jacobsd32-cpu/djdagentscore`
- Fly config references `djd-agent-score`
- live responses expose the mismatch being remediated

**Step 3: Document the findings**

Write the confirmed baseline and parity notes into:

- `docs/plans/2026-04-10-audit-remediation-design.md`

**Step 4: Commit planning artifacts**

```bash
git add docs/plans/2026-04-10-audit-remediation-design.md docs/plans/2026-04-10-audit-remediation.md
git commit -m "docs: add audit remediation design and plan"
```

### Task 2: Lock Down Public Ops Exposure

**Files:**
- Modify: `src/routes/metrics.ts`
- Modify: `src/routes/health.ts`
- Modify: `src/services/opsService.ts`
- Modify: `src/app.ts`
- Test: `tests/routes/admin.test.ts`
- Test: add targeted tests if missing around metrics/health authorization behavior

**Step 1: Write or extend failing tests**

Cover:
- unauthenticated `/metrics` must not expose Prometheus output
- `/health` public response must be minimal
- admin-authenticated `/health` may expose detailed payload

**Step 2: Run the targeted tests**

Example:

```bash
npm test -- tests/routes/admin.test.ts
```

Expected:
- current behavior fails or is missing coverage

**Step 3: Implement the minimal route/auth fixes**

Ensure:
- `/metrics` is guarded as intended
- `/health` cannot leak detailed internals without valid admin authorization
- route registration does not accidentally bypass route-level auth

**Step 4: Re-run the targeted tests**

Expected:
- metrics/health authorization tests pass

**Step 5: Smoke-check locally**

Run:

```bash
curl -i http://localhost:3000/metrics
curl -i http://localhost:3000/health
```

Expected:
- unauthorized metrics blocked
- public health trimmed

### Task 3: Restore Crawl And Machine Discovery Surfaces

**Files:**
- Modify: `src/routes/legal.ts`
- Modify: `src/routes/wellKnown.ts`
- Modify: `src/app.ts`
- Create or Modify: sitemap route implementation file if absent
- Test: route tests covering `robots.txt`, agent discovery, and sitemap behavior

**Step 1: Write failing route tests**

Cover:
- `GET /robots.txt`
- `GET /.well-known/agent.json`
- valid sitemap endpoint
- correct route registration through `app.ts`

**Step 2: Run the focused tests**

Expected:
- current route behavior or registration gaps fail

**Step 3: Implement the route fixes**

Ensure:
- `robots.txt` returns `200`
- sitemap reference points to an actual XML sitemap, not `openapi.json`
- `/.well-known/agent.json` returns intended machine-readable metadata

**Step 4: Re-run the focused tests and CLI smoke checks**

Run:

```bash
curl -i http://localhost:3000/robots.txt
curl -i http://localhost:3000/.well-known/agent.json
curl -i http://localhost:3000/sitemap.xml
```

Expected:
- all three return `200` with valid content types

### Task 4: Normalize OpenAPI, Docs, And Discovery Examples

**Files:**
- Modify: `openapi.json`
- Modify: `src/services/discoveryService.ts`
- Modify: `index.html`
- Test: `tests/routes/openapi.test.ts`
- Test: add targeted docs/discovery example assertions if missing

**Step 1: Write failing assertions for version/example mismatches**

Cover:
- current service version strings
- basic score example payload shape
- model version/example freshness fields
- consistency between docs/openapi/x402 discovery output

**Step 2: Run the focused tests**

```bash
npm test -- tests/routes/openapi.test.ts
```

**Step 3: Update the machine-readable surfaces**

Fix:
- stale `info.version`
- stale example `modelVersion`
- any missing fields that current live/basic responses include
- x402 discovery examples that still reflect outdated semantics

**Step 4: Re-run focused tests and inspect rendered outputs**

Run:

```bash
curl -i http://localhost:3000/openapi.json | sed -n '1,80p'
curl -i http://localhost:3000/.well-known/x402 | sed -n '1,120p'
```

Expected:
- values line up with current runtime behavior

### Task 5: Repair Shared Metadata And Public SEO Essentials

**Files:**
- Modify: `src/templates/publicPage.ts`
- Modify: public route/template files that need explicit overrides
- Test: add targeted assertions for shared head output if missing

**Step 1: Write failing assertions or snapshot checks**

Cover:
- canonical link
- `og:image` and `twitter:image` support
- retained title/description/og url behavior

**Step 2: Implement the shared head improvements**

Add:
- canonical output
- image metadata plumbing
- safe defaults that do not require every page to hand-roll metadata

**Step 3: Re-run tests and inspect sample HTML**

Run:

```bash
curl -s http://localhost:3000/ | sed -n '1,40p'
curl -s http://localhost:3000/pricing | sed -n '1,40p'
```

Expected:
- canonical and social image metadata appear where intended

### Task 6: Unify Public Positioning And Navigation

**Files:**
- Modify: `index.html`
- Modify: `src/routes/blog.ts`
- Modify: pricing/docs/status/public templates as needed
- Test: add or update route/content assertions where practical

**Step 1: Audit the public copy against the screening-first wedge**

Focus on:
- homepage hero and CTA
- docs hero and quickstart framing
- pricing surface
- blog listing/nav
- status page linkage

**Step 2: Implement copy and nav consistency updates**

Keep:
- “screen wallets before payout or paid route execution” as the primary wedge

Reduce:
- mixed governance/trust-infrastructure messaging where it obscures the primary product
- inconsistent nav menus across major public pages

**Step 3: Re-run targeted route tests and CLI HTML checks**

Expected:
- primary public surfaces tell a coherent story

### Task 7: Integrate, Verify, And Prepare Live Smoke Checks

**Files:**
- Modify: any touched tests or docs from prior tasks

**Step 1: Run focused verification for every touched area**

Examples:

```bash
npm test -- tests/routes/admin.test.ts tests/routes/openapi.test.ts
```

**Step 2: Run broader repo verification**

Run:

```bash
npm run lint
npm test
```

Expected:
- either improved results or explicitly documented remaining unrelated failures

**Step 3: Start the app locally and smoke-check key routes**

Run:

```bash
npm run dev
curl -i http://localhost:3000/metrics
curl -i http://localhost:3000/health
curl -i http://localhost:3000/robots.txt
curl -i http://localhost:3000/.well-known/agent.json
curl -i http://localhost:3000/openapi.json
```

**Step 4: Commit the remediation**

```bash
git add .
git commit -m "fix: remediate audit findings across ops, discovery, and docs"
```

Plan complete and saved to `docs/plans/2026-04-10-audit-remediation.md`. The user already selected the subagent-driven execution approach in this session, so proceed with parallel subagents on disjoint write scopes and integrate centrally.
