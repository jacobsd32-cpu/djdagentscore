import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const entrypoint = resolve(repoRoot, 'runtime-entrypoint.mjs')

function runEntrypoint(env: Record<string, string | undefined>) {
  return execFileSync(process.execPath, [entrypoint], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DJD_RUNTIME_DRY_RUN: '1',
      ...env,
    },
    encoding: 'utf8',
  }).trim()
}

describe('runtime-entrypoint', () => {
  it('defaults to combined mode', () => {
    const output = JSON.parse(runEntrypoint({ DJD_RUNTIME_MODE: undefined })) as {
      mode: string
      target: string
    }

    expect(output).toEqual({
      mode: 'combined',
      target: './dist/index.js',
    })
  })

  it('selects api and worker modes explicitly', () => {
    const apiOutput = JSON.parse(runEntrypoint({ DJD_RUNTIME_MODE: 'api' })) as {
      mode: string
      target: string
    }
    const workerOutput = JSON.parse(runEntrypoint({ DJD_RUNTIME_MODE: 'worker' })) as {
      mode: string
      target: string
    }

    expect(apiOutput).toEqual({ mode: 'api', target: './dist/api.js' })
    expect(workerOutput).toEqual({ mode: 'worker', target: './dist/worker.js' })
  })

  it('fails fast on an invalid runtime mode', () => {
    expect(() =>
      execFileSync(process.execPath, [entrypoint], {
        cwd: repoRoot,
        env: {
          ...process.env,
          DJD_RUNTIME_DRY_RUN: '1',
          DJD_RUNTIME_MODE: 'not-a-mode',
        },
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).toThrow(/Invalid DJD_RUNTIME_MODE/)
  })
})
