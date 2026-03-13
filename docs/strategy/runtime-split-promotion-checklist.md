# Runtime-Split Promotion Checklist

Use this checklist when promoting `codex/runtime-split-entrypoints` toward `main`.

## 1. Preview lane

- Confirm GitHub Actions variable `FLY_PREVIEW_APP` is set.
- Optionally set `FLY_PREVIEW_PUBLIC_BASE_URL` if the preview app uses a custom domain.
- Optionally set `FLY_PREVIEW_API_TOKEN` if the default `FLY_API_TOKEN` only has access to the production Fly app.
- Optionally set `FLY_PREVIEW_ADMIN_KEY` so deploy smoke checks can verify detailed runtime health.
- Confirm preview config rendering sets `CORS_ORIGINS` to the preview public base URL so new preview apps can boot cleanly.
- Confirm preview deploys use Fly's `immediate` strategy, since the preview app currently runs as a single SQLite-backed machine with one mounted volume.
- Confirm the preview Fly app has its own mounted SQLite volume named `djd_agent_score_data`.
- Confirm preview deploys render a dedicated `.fly/preview.toml` rather than overriding the production app name in place.
- Push to `codex/runtime-split-entrypoints` or run `Fly Preview` manually.

## 2. Preview verification

- Wait for `.github/workflows/fly-preview.yml` to pass:
  - app lint/typecheck/test
  - promotion audit
  - package verification
  - preview deploy
  - post-deploy smoke check
- Confirm preview `/health` reports:
  - `runtime.mode = combined`
  - `release.sha = <deployed commit>`
- Spot-check:
  - `/`
  - `/certify`
  - `/explorer`
  - `/agent/<wallet>`
  - `/v1/certification/readiness?wallet=<wallet>`
  - `/v1/score/erc8004?wallet=<wallet>`

## 3. Merge readiness

- Compare `main...codex/runtime-split-entrypoints` for config drift before merge.
- Confirm production-only values in `fly.toml` still point at `https://djdagentscore.dev`.
- Confirm public metadata routes and discovery responses use `PUBLIC_BASE_URL`, not hardcoded production URLs.
- Run `npm run audit:promotion`.
- Confirm `npm run lint`, `npm run typecheck`, and `npm test` pass on the merge candidate commit.

## 4. Production promotion

- Merge the runtime-split branch into `main`.
- Let `.github/workflows/fly-deploy.yml` deploy production.
- Confirm production smoke check verifies both runtime mode and release SHA.
