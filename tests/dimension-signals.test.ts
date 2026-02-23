import { describe, it, expect } from 'vitest'

describe('dimension signal breakdowns', () => {
  it('calcReliability returns score and signals', async () => {
    const { calcReliability } = await import('../src/scoring/dimensions.js')
    expect(typeof calcReliability).toBe('function')

    // Call with minimal data (zero transfers)
    const result = calcReliability(
      {
        balance: 0n,
        inflows30d: 0n, outflows30d: 0n,
        inflows7d: 0n, outflows7d: 0n,
        totalInflows: 0n, totalOutflows: 0n,
        transferCount: 0,
        firstBlockSeen: null, lastBlockSeen: null,
      },
      100000n,
      0,
    )
    expect(result.score).toBe(0)
    expect(result.signals).toBeDefined()
    expect(typeof result.signals).toBe('object')
    // All signals should be 0 for an empty wallet
    for (const val of Object.values(result.signals)) {
      expect(val).toBe(0)
    }
  })

  it('calcViability returns score and signals', async () => {
    const { calcViability } = await import('../src/scoring/dimensions.js')

    const result = calcViability(
      {
        balance: 10_000_000n, // 10 USDC
        inflows30d: 50_000_000n, outflows30d: 20_000_000n,
        inflows7d: 10_000_000n, outflows7d: 5_000_000n,
        totalInflows: 100_000_000n, totalOutflows: 50_000_000n,
        transferCount: 10,
        firstBlockSeen: 1000n, lastBlockSeen: 99000n,
      },
      30,
      BigInt(1e16), // 0.01 ETH
    )
    expect(result.score).toBeGreaterThan(0)
    expect(result.signals).toBeDefined()
    expect(result.signals.ethBalance).toBeGreaterThan(0)
    expect(result.signals.usdcBalance).toBeGreaterThan(0)
  })

  it('calcCapability returns score and signals', async () => {
    const { calcCapability } = await import('../src/scoring/dimensions.js')

    const result = calcCapability(
      {
        balance: 0n,
        inflows30d: 0n, outflows30d: 0n,
        inflows7d: 0n, outflows7d: 0n,
        totalInflows: 1_000_000n, totalOutflows: 0n,
        transferCount: 10,
        firstBlockSeen: null, lastBlockSeen: null,
      },
      { x402TxCount: 25, x402InflowsUsd: 100, x402OutflowsUsd: 10, x402FirstSeen: undefined as unknown as string },
    )
    expect(result.score).toBeGreaterThan(0)
    expect(result.signals).toBeDefined()
    expect(result.signals.x402Services).toBeGreaterThan(0)
    expect(result.signals.revenue).toBeGreaterThan(0)
  })

  it('calcIdentity returns score and signals', async () => {
    const { calcIdentity } = await import('../src/scoring/dimensions.js')

    const result = await calcIdentity(
      '0x0000000000000000000000000000000000000001',
      90, null, true, true, 10, new Date().toISOString(), true,
    )
    expect(result.score).toBeGreaterThan(0)
    expect(result.signals).toBeDefined()
    expect(result.signals.registration).toBeGreaterThan(0)
    expect(result.signals.basename).toBeGreaterThan(0)
    expect(result.signals.githubVerified).toBeGreaterThan(0)
    expect(result.signals.walletAge).toBeGreaterThan(0)
  })
})
