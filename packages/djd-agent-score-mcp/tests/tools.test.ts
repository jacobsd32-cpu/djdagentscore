import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { DJDClient } from '../src/client.js'
import { registerTools } from '../src/tools.js'

// ── Mock client ──────────────────────────────────────────────────────────────

function createMockClient(overrides: Partial<DJDClient> = {}): DJDClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as DJDClient
}

// ── Test harness ─────────────────────────────────────────────────────────────
// Capture tool registrations without spinning up a real MCP server.

interface RegisteredTool {
  name: string
  description: string
  schema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

function captureRegisteredTools(client: DJDClient): RegisteredTool[] {
  const tools: RegisteredTool[] = []
  const fakeServer = {
    tool: (name: string, description: string, schema: Record<string, unknown>, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      tools.push({ name, description, schema, handler })
    },
  } as unknown as McpServer

  registerTools(fakeServer, client)
  return tools
}

function findTool(tools: RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`Tool ${name} not found. Available: ${tools.map((t) => t.name).join(', ')}`)
  return tool
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('registerTools', () => {
  it('registers exactly 6 tools', () => {
    const tools = captureRegisteredTools(createMockClient())
    expect(tools).toHaveLength(6)
  })

  it('registers expected tool names', () => {
    const tools = captureRegisteredTools(createMockClient())
    const names = tools.map((t) => t.name)
    expect(names).toEqual([
      'get_score',
      'get_full_score',
      'get_score_history',
      'get_leaderboard',
      'get_economy_metrics',
      'batch_score',
    ])
  })
})

describe('get_score tool', () => {
  it('calls client.get with correct path', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      score: 80,
      tier: 'Trusted',
      confidence: 0.9,
      recommendation: 'Safe',
      modelVersion: '2.5.0',
      lastUpdated: '2026-02-28',
      computedAt: '2026-02-28',
      scoreFreshness: 0.95,
      dataSource: 'live',
    })
    const client = createMockClient({ get: mockGet } as unknown as Partial<DJDClient>)
    const tools = captureRegisteredTools(client)
    const tool = findTool(tools, 'get_score')

    const result = await tool.handler({ wallet: '0x1234567890abcdef1234567890abcdef12345678' })

    expect(mockGet).toHaveBeenCalledWith('/v1/score/basic?wallet=0x1234567890abcdef1234567890abcdef12345678')
    expect(result).toHaveProperty('content')
    expect((result as { content: Array<{ text: string }> }).content[0]?.text).toContain('80/100')
  })

  it('returns error result on API failure', async () => {
    const mockGet = vi.fn().mockRejectedValue(new Error('Network error'))
    const client = createMockClient({ get: mockGet } as unknown as Partial<DJDClient>)
    const tools = captureRegisteredTools(client)
    const tool = findTool(tools, 'get_score')

    const result = await tool.handler({ wallet: '0x1234567890abcdef1234567890abcdef12345678' }) as {
      content: Array<{ text: string }>
      isError: boolean
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('Network error')
  })
})

describe('get_leaderboard tool', () => {
  it('calls client.get for leaderboard', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      leaderboard: [],
      totalAgentsScored: 100,
      totalAgentsRegistered: 50,
      lastUpdated: '2026-02-28',
    })
    const client = createMockClient({ get: mockGet } as unknown as Partial<DJDClient>)
    const tools = captureRegisteredTools(client)
    const tool = findTool(tools, 'get_leaderboard')

    await tool.handler({})

    expect(mockGet).toHaveBeenCalledWith('/v1/leaderboard')
  })
})

describe('get_economy_metrics tool', () => {
  it('passes period and limit params', async () => {
    const mockGet = vi.fn().mockResolvedValue({ period: 'weekly', limit: 10, count: 0, metrics: [] })
    const client = createMockClient({ get: mockGet } as unknown as Partial<DJDClient>)
    const tools = captureRegisteredTools(client)
    const tool = findTool(tools, 'get_economy_metrics')

    await tool.handler({ period: 'weekly', limit: 10 })

    expect(mockGet).toHaveBeenCalledWith('/v1/data/economy?period=weekly&limit=10')
  })
})

describe('get_full_score tool', () => {
  it('calls full score endpoint', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      score: 82,
      tier: 'Trusted',
      confidence: 0.9,
      recommendation: 'Safe',
      sybilFlag: false,
      gamingIndicators: [],
      dimensions: {
        reliability: { score: 85, data: {} },
        viability: { score: 78, data: {} },
        identity: { score: 90, data: {} },
        capability: { score: 75, data: {} },
      },
      dataAvailability: {},
      scoreHistory: [],
      modelVersion: '2.5.0',
      lastUpdated: '2026-02-28',
      computedAt: '2026-02-28',
      scoreFreshness: 0.95,
      dataSource: 'live',
    })
    const client = createMockClient({ get: mockGet } as unknown as Partial<DJDClient>)
    const tools = captureRegisteredTools(client)
    const tool = findTool(tools, 'get_full_score')

    const result = await tool.handler({ wallet: '0x1234567890abcdef1234567890abcdef12345678' }) as {
      content: Array<{ text: string }>
    }

    expect(mockGet).toHaveBeenCalledWith('/v1/score/full?wallet=0x1234567890abcdef1234567890abcdef12345678')
    expect(result.content[0]?.text).toContain('reliability')
  })
})

describe('get_score_history tool', () => {
  it('builds URL with optional params', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      wallet: '0xabc',
      history: [],
      count: 0,
      returned: 0,
      period: { from: null, to: null },
    })
    const client = createMockClient({ get: mockGet } as unknown as Partial<DJDClient>)
    const tools = captureRegisteredTools(client)
    const tool = findTool(tools, 'get_score_history')

    await tool.handler({
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      limit: 20,
      after: '2026-01-01',
    })

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('limit=20'),
    )
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('after=2026-01-01'),
    )
  })
})

describe('batch_score tool', () => {
  it('posts wallets array', async () => {
    const mockPost = vi.fn().mockResolvedValue({ results: [], count: 0 })
    const client = createMockClient({ post: mockPost } as unknown as Partial<DJDClient>)
    const tools = captureRegisteredTools(client)
    const tool = findTool(tools, 'batch_score')

    const wallets = [
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xabcdef1234567890abcdef1234567890abcdef12',
    ]
    await tool.handler({ wallets })

    expect(mockPost).toHaveBeenCalledWith('/v1/score/batch', { wallets })
  })
})
