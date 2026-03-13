import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runPostDeploySmokeCheck,
  validateDetailedHealthPayload,
  validatePublicHealthPayload,
} from '../scripts/post-deploy-smoke.mjs'

describe('post-deploy smoke helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts valid public health payloads', () => {
    expect(() =>
      validatePublicHealthPayload({
        status: 'ok',
        version: '2.5.0',
        uptime: 12,
        release: {
          sha: 'abcdef1234567890',
          shaShort: 'abcdef1',
          builtAt: '2026-03-13T02:30:00Z',
        },
      }),
    ).not.toThrow()
  })

  it('accepts valid detailed health payloads for combined runtime', () => {
    expect(() =>
      validateDetailedHealthPayload(
        {
          status: 'ok',
          modelVersion: '2.5.0',
          experimentalStatus: true,
          runtime: {
            mode: 'combined',
            apiEnabled: true,
            workerEnabled: true,
          },
        },
        'combined',
      ),
    ).not.toThrow()
  })

  it('retries through transient failures and succeeds once health is good', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    let callCount = 0
    const fetchMock = async (_url, init) => {
      callCount += 1
      if (callCount === 1) {
        return {
          ok: false,
          status: 503,
        }
      }

      if (init?.headers?.['x-admin-key']) {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            modelVersion: '2.5.0',
            experimentalStatus: true,
            warnings: [
              {
                code: 'github_token_missing',
                message: 'GITHUB_TOKEN not set — GitHub verification is limited to unauthenticated rate limits.',
              },
            ],
            runtime: {
              mode: 'combined',
              apiEnabled: true,
              workerEnabled: true,
            },
          }),
        }
      }

      return {
        ok: true,
        json: async () => ({
          status: 'ok',
          version: '2.5.0',
          uptime: 10,
          release: {
            sha: 'abcdef1234567890',
            shaShort: 'abcdef1',
            builtAt: '2026-03-13T02:30:00Z',
          },
        }),
      }
    }

    const originalFetch = globalThis.fetch
    // @ts-expect-error test stub
    globalThis.fetch = fetchMock

    await expect(
      runPostDeploySmokeCheck({
        healthUrl: 'https://example.test/health',
        adminKey: 'secret',
        expectedRuntimeMode: 'combined',
        expectedReleaseSha: 'abcdef1234567890',
        timeoutMs: 2000,
        intervalMs: 1,
      }),
    ).resolves.toBeUndefined()

    globalThis.fetch = originalFetch
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[smoke] Admin health warnings: github_token_missing: GITHUB_TOKEN not set — GitHub verification is limited to unauthenticated rate limits.',
      ),
    )
  })

  it('rejects a release SHA mismatch when one is expected', () => {
    expect(() =>
      validatePublicHealthPayload(
        {
          status: 'ok',
          version: '2.5.0',
          uptime: 12,
          release: {
            sha: 'deadbeef12345678',
            shaShort: 'deadbee',
            builtAt: '2026-03-13T02:30:00Z',
          },
        },
        'abcdef1234567890',
      ),
    ).toThrow(/Release SHA mismatch/)
  })
})
