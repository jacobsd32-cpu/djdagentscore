import { Hono } from 'hono'
import { getScore } from '../db.js'
import type { Address } from '../types.js'
import { makeBadge, TIER_COLORS } from '../utils/badgeGenerator.js'

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

  const label = 'djd score'
  const value = score !== null ? `${score} · ${tier}` : 'not scored'
  const color = TIER_COLORS[tier] ?? '#6b7280'
  const svg = makeBadge(label, value, color)

  c.header('Content-Type', 'image/svg+xml')
  c.header('Cache-Control', 'public, max-age=600') // 10-min cache; scores refresh hourly
  c.header('X-Content-Type-Options', 'nosniff') // prevent SVG script injection in old browsers
  return c.body(svg)
})

export default badge
