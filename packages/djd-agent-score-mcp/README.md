# djd-agent-score-mcp

MCP server for [DJD Agent Score](https://djd-agent-score.fly.dev) — on-chain reputation scoring for AI agent wallets on Base L2.

Gives AI assistants (Claude Desktop, Cursor, Windsurf, etc.) native tools to look up wallet trust scores, sybil flags, and network-wide reputation metrics.

## Quick start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "djd-agent-score": {
      "command": "npx",
      "args": ["-y", "djd-agent-score-mcp"],
      "env": {
        "DJD_API_KEY": "djd_live_..."
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "djd-agent-score": {
      "command": "npx",
      "args": ["-y", "djd-agent-score-mcp"],
      "env": {
        "DJD_API_KEY": "djd_live_..."
      }
    }
  }
}
```

> **Free tier**: Leave out `DJD_API_KEY` to use the free tools (10 queries/day). Add a key to unlock paid tools and higher limits. Get one at [djd-agent-score.fly.dev](https://djd-agent-score.fly.dev).

## Tools

| Tool | Description | Price |
|------|-------------|-------|
| `get_score` | Basic trust score, tier, confidence, recommendation | Free (10/day) |
| `get_leaderboard` | Top-ranked agents and network stats | Free |
| `get_economy_metrics` | Network health and activity metrics | Free |
| `get_full_score` | Full breakdown: dimensions, sybil flags, trajectory, improvement path | $0.10 |
| `get_score_history` | Historical scores with trend analysis | $0.15 |
| `batch_score` | Score 2–20 wallets in one call | $0.50 |

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DJD_API_KEY` | No | — | API key (`djd_live_...`) for paid tools. Free tools work without it. |
| `DJD_API_URL` | No | `https://djd-agent-score.fly.dev` | API base URL (override for self-hosted instances) |

## Example usage

Once configured, ask your AI assistant:

- *"What's the trust score for 0x1234...?"*
- *"Is this wallet a sybil?"*
- *"Show me the top agents on the leaderboard"*
- *"Score these 5 wallets and compare them"*

## License

MIT
