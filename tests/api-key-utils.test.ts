import { describe, expect, it } from 'vitest'

import { createApiKeyMaterial, getNextUsageResetAt } from '../src/utils/apiKeyUtils.js'

describe('apiKeyUtils', () => {
  it('creates a raw key plus derived hash and prefix', () => {
    const material = createApiKeyMaterial()

    expect(material.rawKey.startsWith('djd_live_')).toBe(true)
    expect(material.keyHash).toMatch(/^[a-f0-9]{64}$/)
    expect(material.keyPrefix.endsWith('...')).toBe(true)
  })

  it('calculates the next monthly reset timestamp', () => {
    const resetAt = getNextUsageResetAt(new Date('2026-03-12T15:45:30.000Z'))
    expect(resetAt).toBe('2026-04-01T00:00:00.000Z')
  })
})
