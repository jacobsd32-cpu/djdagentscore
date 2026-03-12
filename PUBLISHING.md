# Publishing

Publish from package directories only. The repo root is the application/service package and is intentionally private.

## Canonical npm packages

| Package | Directory | Purpose |
|---|---|---|
| `djd-agent-score` | `packages/djd-agent-score-client` | TypeScript/JavaScript SDK |
| `djd-agent-score-mcp` | `packages/djd-agent-score-mcp` | MCP server |
| `x402-agent-score` | `packages/x402-agent-score` | Hono middleware for x402 gating |

## Pre-publish checks

Run these before publishing:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Then verify the package surfaces:

```bash
cd packages/djd-agent-score-client && npm run typecheck && npm run build && npm pack --dry-run
cd packages/djd-agent-score-mcp && npm run typecheck && npm test && npm run build && npm pack --dry-run
cd packages/x402-agent-score && npm run typecheck && npm test && npm run build && npm pack --dry-run
```

## Publish

Publish from inside the package directory you are releasing:

```bash
cd packages/djd-agent-score-client && npm publish --access public
cd packages/djd-agent-score-mcp && npm publish --access public
cd packages/x402-agent-score && npm publish --access public
```
