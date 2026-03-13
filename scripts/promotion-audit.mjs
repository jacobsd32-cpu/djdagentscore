import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const HARD_CODED_REFERENCES = [
  { needle: 'https://djdagentscore.dev', label: 'production base URL' },
  { needle: 'drewjacobs32@gmail.com', label: 'production support email' },
]

const ALLOWED_RELATIVE_PATHS = new Set(['src/config/public.ts'])

function walkFiles(currentPath) {
  const entries = readdirSync(currentPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = join(currentPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath))
      continue
    }

    files.push(entryPath)
  }

  return files
}

export function collectHardcodedProductionReferences(entries) {
  const findings = []

  for (const entry of entries) {
    if (ALLOWED_RELATIVE_PATHS.has(entry.path)) {
      continue
    }

    const lines = entry.contents.split('\n')

    for (const reference of HARD_CODED_REFERENCES) {
      lines.forEach((line, index) => {
        if (!line.includes(reference.needle)) {
          return
        }

        findings.push({
          path: entry.path,
          line: index + 1,
          label: reference.label,
          snippet: line.trim(),
        })
      })
    }
  }

  return findings
}

export function runPromotionAudit(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? process.cwd())
  const roots = [resolve(repoRoot, 'src'), resolve(repoRoot, 'index.html')]
  const entries = []

  for (const root of roots) {
    const stats = statSync(root)

    if (stats.isDirectory()) {
      for (const filePath of walkFiles(root)) {
        entries.push({
          path: relative(repoRoot, filePath),
          contents: readFileSync(filePath, 'utf8'),
        })
      }
      continue
    }

    entries.push({
      path: relative(repoRoot, root),
      contents: readFileSync(root, 'utf8'),
    })
  }

  const findings = collectHardcodedProductionReferences(entries)

  if (findings.length > 0) {
    const message = findings
      .map((finding) => `${finding.path}:${finding.line} hardcodes ${finding.label}: ${finding.snippet}`)
      .join('\n')

    throw new Error(`Promotion audit found preview-unsafe references:\n${message}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runPromotionAudit()
    console.log('[promotion-audit] OK: no preview-unsafe production references found in src/ or index.html')
  } catch (error) {
    console.error(`[promotion-audit] FAILED: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
