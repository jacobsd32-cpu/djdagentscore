# Runtime Split Merge Readiness

Date: 2026-03-13
Branch: `origin/codex/runtime-split-entrypoints`
Head: `375e92a`
Base: `origin/main` at `0797460`

## Status

`codex/runtime-split-entrypoints` is now promotion-ready from an infrastructure perspective:

- The branch deploys successfully to the dedicated Fly preview app.
- Preview health is live at `https://djd-agent-score-preview.fly.dev/health`.
- The latest successful preview workflow run is GitHub Actions run `23040756056`.
- Preview runtime metadata reports release `375e92a`, confirming the live preview matches branch head.

## What changed versus main

This branch is `12` commits ahead of `origin/main` and touches `94` files.

The meaningful deltas are:

- Runtime split hardening:
  - explicit runtime entrypoints for `combined`, `api`, and `worker`
  - release/runtime metadata surfaced in `/health`
  - post-deploy smoke verification
  - preview Fly workflow and promotion audit tooling
- Trust/product surface expansion:
  - Certify overview page and readiness flow
  - certification directory
  - ERC-8004-compatible score document
  - evaluator preview surface
  - richer agent profile, homepage, explorer, and pricing/copy updates
- Governance/data surface expansion:
  - data products
  - risk/cluster APIs
  - staking support
  - analytics and discovery additions
- Test and packaging expansion:
  - route coverage for new trust/data surfaces
  - runtime entrypoint tests
  - preview config and promotion audit tests

## Preview lessons captured on branch

The preview rehearsal flushed out three real deployment issues and all three are now encoded into the branch:

1. Preview needed its own Fly deploy token.
2. Fresh SQLite volumes exposed a schema bootstrap bug around `score_outcomes`.
3. Preview needed preview-safe defaults for `CORS_ORIGINS` and an in-place Fly update strategy for a single-volume machine.

Those fixes are all on `375e92a`, not just applied manually.

## Remaining risks

No current blocker was found in the branch deploy path, but there are still promotion risks worth treating explicitly:

- Scope risk: this is a broad branch, not a tiny runtime-only promotion.
- Product risk: public positioning has moved toward trust infrastructure, Certify, standards, and governance surfaces; that should be an intentional `main` promotion decision.
- Data model risk: the app still runs as a single SQLite-backed service, so production promotion should preserve the current single-volume operational assumptions.
- Change-set size: this is still a large merge, so reviewer focus should stay on promotion risk and product framing rather than trying to read it as a tiny infrastructure patch.

## Recommendation

The next move should be a merge-to-`main` decision thread, not more preview plumbing.

Recommended checklist for that thread:

1. Treat `375e92a` as the candidate promotion head.
2. Review the product-positioning delta, not just the runtime changes.
3. Decide whether to merge the full trust-surface expansion in one shot or split follow-up cleanup PRs after promotion.
4. If approved, merge to `main` and let the existing production Fly workflow perform the same release/runtime smoke verification now proven on preview.
