# Draft PR Body: runtime-split-entrypoints -> main

## Summary

Promotes the Phase 2 runtime split branch to `main` and carries the broader trust-surface expansion that now sits on top of it.

This includes:

- runtime-aware entrypoints for combined/api/worker execution
- preview-safe and production-safe Fly deployment hardening
- post-deploy smoke verification with release/runtime checks
- Certify, directory, readiness, ERC-8004, and evaluator trust surfaces
- richer homepage/profile/explorer/pricing copy aligned with the current product reality
- additional governance/data APIs for risk, cluster, staking, and economy surfaces

## Why now

- `codex/runtime-split-entrypoints` is green in CI.
- The branch deploys successfully to Fly preview and passes post-deploy smoke checks.
- Preview now serves the exact branch head release metadata, proving the promotion path works end-to-end.

## Validation

- Latest preview-success run: GitHub Actions `23040711137`
- Preview URL: `https://djd-agent-score-preview.fly.dev`
- Preview health confirms runtime release metadata and branch-head SHA
- Local lint is clean
- Local typecheck is clean
- Full route/package validation is already exercised by the preview workflow

## Operational notes

- Preview uses a dedicated Fly app and volume.
- Preview deploys use Fly's `immediate` strategy because the service is currently a single-machine SQLite deployment with one attached volume.
- Preview config now derives `CORS_ORIGINS` from the preview public base URL automatically.
- Preview deploys can use a preview-scoped Fly token when the default `FLY_API_TOKEN` is production-scoped.

## Risks

- This is a broad promotion, not a tiny runtime-only merge.
- Public positioning and product surface area have moved materially beyond the old `main` snapshot.
- The service still operates on a single SQLite volume, so production promotion should preserve that assumption.

## Suggested rollout

1. Merge to `main`.
2. Let the production Fly workflow deploy with the existing post-deploy smoke gate.
3. Confirm production `/health` reports the expected release SHA and runtime mode.
4. Spot-check homepage, `/certify`, `/explorer`, `/agent`, and `/v1/score/erc8004`.
