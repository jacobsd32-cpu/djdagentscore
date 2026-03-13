import { describe, expect, it } from 'vitest'
import { collectHardcodedProductionReferences } from '../scripts/promotion-audit.mjs'

describe('promotion audit', () => {
  it('ignores configured defaults in src/config/public.ts', () => {
    const findings = collectHardcodedProductionReferences([
      {
        path: 'src/config/public.ts',
        contents:
          "const DEFAULT_PUBLIC_BASE_URL = 'https://djdagentscore.dev'\nconst DEFAULT_SUPPORT_EMAIL = 'drewjacobs32@gmail.com'\n",
      },
    ])

    expect(findings).toEqual([])
  })

  it('reports preview-unsafe production URLs in app-facing files', () => {
    const findings = collectHardcodedProductionReferences([
      {
        path: 'index.html',
        contents:
          '<meta property="og:url" content="https://djdagentscore.dev/">\n<a href="mailto:drewjacobs32@gmail.com">Email</a>\n',
      },
    ])

    expect(findings).toHaveLength(2)
    expect(findings[0]).toMatchObject({
      path: 'index.html',
      line: 1,
      label: 'production base URL',
    })
    expect(findings[1]).toMatchObject({
      path: 'index.html',
      line: 2,
      label: 'production support email',
    })
  })

  it('passes placeholder-based public surfaces', () => {
    const findings = collectHardcodedProductionReferences([
      {
        path: 'index.html',
        contents:
          '<meta property="og:url" content="__DJD_PUBLIC_BASE_URL__/">\n<a href="mailto:__DJD_SUPPORT_EMAIL__">Email</a>\n',
      },
      {
        path: 'src/routes/legal.ts',
        contents:
          "return indexHtmlTemplate.replaceAll('__DJD_PUBLIC_BASE_URL__', buildPublicUrl()).replaceAll('__DJD_SUPPORT_EMAIL__', getSupportEmail())\n",
      },
    ])

    expect(findings).toEqual([])
  })
})
