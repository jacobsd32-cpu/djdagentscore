import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bootstrapEvaluatorStackEnv } from '../scripts/bootstrap-evaluator-env.mjs'

describe('bootstrap evaluator env script', () => {
  it('emits a dotenv template for the selected network even when preflight is not ready', async () => {
    const result = await bootstrapEvaluatorStackEnv({
      network: 'base-sepolia',
    })

    expect(result.standard).toBe('djd-evaluator-env-bootstrap-v1')
    expect(result.ok).toBe(true)
    expect(result.ready).toBe(false)
    expect(result.network.key).toBe('base-sepolia')
    expect(result.preflight.missing.bundle?.recommended_envs).toEqual(['DJD_API_BASE_URL', 'DJD_VERDICT_ID'])
    expect(result.outputs.selected_format).toBe('dotenv')
    expect(result.outputs.selected_contents).toContain('DJD_NETWORK=base-sepolia')
    expect(result.outputs.selected_contents).toContain('DJD_BASE_SEPOLIA_RPC_URL=')
  })

  it('writes the requested output format to disk', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-bootstrap-env-'))
    const outputPath = join(fixtureDir, 'bootstrap.sh')

    const result = await bootstrapEvaluatorStackEnv({
      network: 'base',
      format: 'shell',
      outputPath,
    })

    expect(result.file).toBe(outputPath)
    expect(result.outputs.selected_format).toBe('shell')
    expect(readFileSync(outputPath, 'utf8')).toContain("export DJD_NETWORK='base'")
    expect(readFileSync(outputPath, 'utf8')).toContain("export DJD_BASE_RPC_URL=''")
  })
})
