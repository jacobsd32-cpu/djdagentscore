# DJD AgentScore Audit Remediation Design

## Goal

Eliminate the highest-risk issues from the April 10, 2026 audit of `djdagentscore.dev`, starting with production parity and public-exposure risks, then repairing crawl/discovery surfaces, docs/spec consistency, and public product-surface coherence.

## Source Of Truth

- GitHub repo: `jacobsd32-cpu/djdagentscore`
- Working copy: `/Users/drewjacobs32/.config/superpowers/worktrees/djd-agent-score-runtime-phase2-integration/codex-audit-remediation`
- Live app target: `djd-agent-score` on Fly, serving `https://djdagentscore.dev`

The audit showed clear repo-to-production drift. The remediation therefore starts by treating deployment parity as a first-class problem, not a side note.

## Baseline On Entry

- `npm install`: completed successfully in the remediation worktree.
- `npm run lint`: failing with broad pre-existing Biome formatting/import issues across the repo.
- `npm test`: failing in multiple route suites, including `tests/routes/admin.test.ts` and `tests/routes/score.test.ts`.
- Live-site observations still matter because the repo does not appear to match production exactly.

## Remediation Strategy

### Phase 1: Production Parity

Establish what branch/commit/config most likely backs `djdagentscore.dev`, and compare it with the checked-out runtime repo. The purpose is to prevent shipping fixes into a branch that does not control production.

### Phase 2: High-Risk Public Surface Fixes

Address the issues that create the largest immediate risk:

- lock down public operational telemetry surfaces
- restore intended behavior for health/detail exposure
- restore crawl and machine-discovery routes that are missing in production

This phase is prioritized ahead of broader polish because public telemetry and discovery-route failures have immediate security, SEO, and operational cost.

### Phase 3: Discovery, Spec, And Docs Consistency

Normalize the machine-readable and developer-facing surfaces:

- `openapi.json`
- `/docs`
- `/.well-known/x402`
- examples and model/version strings
- metadata emitted by shared public page helpers

The objective is to ensure developers see one coherent story across the live API, docs, discovery documents, and public examples.

### Phase 4: Public Product Surface Cleanup

Clean up the homepage/docs/pricing/blog/status experience so the product consistently leads with the screening wedge and no longer mixes incompatible positioning or inconsistent UI/navigation patterns.

## Parallelization Plan

The work splits cleanly into parallel domains with mostly disjoint write sets:

1. Production parity and ops exposure
   - likely files: `src/routes/metrics.ts`, `src/routes/health.ts`, `src/services/opsService.ts`, deployment config, route registration

2. Crawl/discovery and metadata
   - likely files: `src/routes/legal.ts`, `src/routes/wellKnown.ts`, `src/templates/publicPage.ts`, possible sitemap implementation

3. Docs/spec/example consistency
   - likely files: `openapi.json`, `src/services/discoveryService.ts`, `index.html`, route docs/tests

4. Public copy/nav coherence
   - likely files: `index.html`, `src/routes/blog.ts`, pricing/status/docs templates, shared nav/footer helpers

I will keep integration and final conflict resolution local, while subagents own their specific slices.

## Verification Plan

Verification will happen in layers:

1. Repo verification
   - targeted tests for touched routes/services
   - lint/typecheck only where meaningful, with explicit reporting of remaining pre-existing failures

2. Local smoke checks
   - static route/output inspection
   - direct command-line checks of generated responses where possible

3. Live smoke checks
   - confirm the target routes and headers behave correctly after the relevant fixes are in place

## Success Criteria

- public `/metrics` is no longer exposed without authorization
- `/health` only exposes detailed internals when intended
- `robots.txt` and agent discovery routes exist and return the intended content
- sitemap behavior is valid and no longer points crawlers at `openapi.json`
- OpenAPI/docs/discovery examples match current runtime behavior and versioning
- shared metadata includes the missing canonical/social essentials
- public positioning is more consistent around the screening-first wedge
- we finish with a clear residual-risk list if any repo-wide lint/test debt remains
