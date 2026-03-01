#!/usr/bin/env node

/**
 * DJD Agent Score MCP Server
 *
 * Exposes DJD reputation scoring as MCP tools for AI assistants.
 *
 * Environment variables:
 *   DJD_API_URL  — API base URL (default: https://djd-agent-score.fly.dev)
 *   DJD_API_KEY  — API key for paid endpoints (optional; free tools work without it)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { DJDClient } from './client.js'
import { registerTools } from './tools.js'

const DEFAULT_API_URL = 'https://djd-agent-score.fly.dev'

const client = new DJDClient({
  baseUrl: process.env.DJD_API_URL ?? DEFAULT_API_URL,
  apiKey: process.env.DJD_API_KEY,
})

const server = new McpServer({
  name: 'djd-agent-score',
  version: '0.1.0',
})

registerTools(server, client)

const transport = new StdioServerTransport()
await server.connect(transport)
