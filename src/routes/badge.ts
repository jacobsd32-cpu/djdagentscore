import { Hono } from 'hono'
import { getScore } from '../db.js'
import type { Address } from '../types.js'

// ---------- Design tokens ----------

const TIER_COLORS: Record<string, string> = {
  Elite:       '#d97706',
  Trusted:     '#2563eb',
  Established: '#059669',
  Emerging:    '#7c3aed',
  Unverified:  '#6b7280',
}

// Approximate character width for DejaVu Sans 11px
function approxWidth(str: string): number {
  return Math.ceil(str.length * 6.8 + 14)
}

function makeBadge(score: number | null, tier: string): string {
  const label = 'djd score'
  const value = score !== null ? `${score} · ${tier}` : 'not scored'
  const color = TIER_COLORS[tier] ?? '#6b7280'

  const lw = approxWidth(label)
  const rw = approxWidth(value)
  const total = lw + rw
  const lx = Math.round(lw / 2)
  const rx = lw + Math.round(rw / 2)

  // Escape for safe XML embedding (scores/tiers are controlled strings but be explicit)
  const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${safeLabel}: ${safeValue}">
  <title>${safeLabel}: ${safeValue}</title>
  <clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#555"/>
    <rect x="${lw}" width="${rw}" height="20" fill="${color}"/>
  </g>
  <g text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11" fill="#fff">
    <text x="${lx}" y="14.5" fill="#010101" fill-opacity=".3">${safeLabel}</text>
    <text x="${lx}" y="14">${safeLabel}</text>
    <text x="${rx}" y="14.5" fill="#010101" fill-opacity=".3">${safeValue}</text>
    <text x="${rx}" y="14">${safeValue}</text>
  </g>
</svg>`
}

// ---------- Route ----------

const badge = new Hono()

// GET /v1/badge/0x<wallet>.svg
badge.get('/:filename', (c) => {
  const filename = c.req.param('filename')

  // Strip .svg suffix and validate address
  const wallet = filename.replace(/\.svg$/i, '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    return c.text('Invalid wallet address', 400)
  }

  const row = getScore(wallet as Address)
  const score = row?.composite_score ?? null
  const tier = row?.tier ?? 'Unverified'

  const svg = makeBadge(score, tier)

  c.header('Content-Type', 'image/svg+xml')
  c.header('Cache-Control', 'public, max-age=600')   // 10-min cache; scores refresh hourly
  c.header('X-Content-Type-Options', 'nosniff')      // prevent SVG script injection in old browsers
  return c.body(svg)
})

export default badge
