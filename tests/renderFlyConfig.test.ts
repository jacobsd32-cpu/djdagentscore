import { describe, expect, it } from 'vitest'
import { renderFlyConfig } from '../scripts/render-fly-config.mjs'

describe('renderFlyConfig', () => {
  it('replaces the app name and preview web config for preview deploys', () => {
    const template = `app = 'djd-agent-score'

[env]
  PUBLIC_BASE_URL = "https://djdagentscore.dev"
  PUBLIC_SUPPORT_EMAIL = "feedback@djdagentscore.dev"
`

    const rendered = renderFlyConfig(template, {
      appName: 'djd-agent-score-preview',
      publicBaseUrl: 'https://preview.djdagentscore.test',
    })

    expect(rendered).toContain("app = 'djd-agent-score-preview'")
    expect(rendered).toContain('PUBLIC_BASE_URL = "https://preview.djdagentscore.test"')
    expect(rendered).toContain('CORS_ORIGINS = "https://preview.djdagentscore.test"')
    expect(rendered).toContain('PUBLIC_SUPPORT_EMAIL = "feedback@djdagentscore.dev"')
  })

  it('fails if required fields are missing', () => {
    expect(() =>
      renderFlyConfig('app = \'djd-agent-score\'\n[env]\n  PUBLIC_BASE_URL = "https://djdagentscore.dev"\n', {
        appName: '',
        publicBaseUrl: 'https://preview.djdagentscore.test',
      }),
    ).toThrow(/appName is required/)

    expect(() =>
      renderFlyConfig('app = \'djd-agent-score\'\n[env]\n  PUBLIC_BASE_URL = "https://djdagentscore.dev"\n', {
        appName: 'djd-agent-score-preview',
        publicBaseUrl: '',
      }),
    ).toThrow(/publicBaseUrl is required/)
  })
})
