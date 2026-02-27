/**
 * Shared SVG badge generator — shields.io-style badges used by
 * both the score badge and certification badge routes.
 */
import { TIER_COLORS } from '../config/constants.js'

// Re-export for consumers that import from here
export { TIER_COLORS }

// Approximate character width for DejaVu Sans 11px
function approxWidth(str: string): number {
  return Math.ceil(str.length * 6.8 + 14)
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Generate a shields.io-style SVG badge with a left label and right value section.
 */
export function makeBadge(label: string, value: string, color: string): string {
  const lw = approxWidth(label)
  const rw = approxWidth(value)
  const total = lw + rw
  const lx = Math.round(lw / 2)
  const rx = lw + Math.round(rw / 2)

  const safeLabel = escapeXml(label)
  const safeValue = escapeXml(value)

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

