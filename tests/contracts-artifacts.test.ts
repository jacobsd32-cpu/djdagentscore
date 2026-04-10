import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('compiled contract artifacts', () => {
  it('ships a manifest with verifier and escrow artifacts', () => {
    const manifest = JSON.parse(readFileSync(new URL('../artifacts/contracts/manifest.json', import.meta.url), 'utf8')) as {
      compiler?: { name?: string; version?: string; via_ir?: boolean }
      contracts?: Array<{ contract?: string; artifact_kind?: string }>
    }

    expect(manifest.compiler?.name).toBe('solc')
    expect(manifest.compiler?.version).toContain('0.8.34')
    expect(manifest.compiler?.via_ir).toBe(true)
    expect(manifest.contracts?.some((entry) => entry.contract === 'DJDEvaluatorVerdictVerifier')).toBe(true)
    expect(manifest.contracts?.some((entry) => entry.contract === 'DJDEvaluatorEscrowSettlementExample')).toBe(true)
    expect(manifest.contracts?.filter((entry) => entry.artifact_kind === 'contract').length).toBeGreaterThanOrEqual(2)
  })
})
