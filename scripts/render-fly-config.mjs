import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function replaceSetting(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Unable to find ${label} in fly config template`)
  }

  return source.replace(pattern, replacement)
}

export function renderFlyConfig(template, options) {
  const appName = options.appName?.trim()
  const publicBaseUrl = options.publicBaseUrl?.trim()

  if (!appName) {
    throw new Error('appName is required')
  }

  if (!publicBaseUrl) {
    throw new Error('publicBaseUrl is required')
  }

  let rendered = template

  rendered = replaceSetting(rendered, /^app\s*=\s*['"][^'"]+['"]$/m, `app = '${appName}'`, 'app name')
  rendered = replaceSetting(
    rendered,
    /^(\s*PUBLIC_BASE_URL\s*=\s*).+$/m,
    `$1"${publicBaseUrl.replace(/"/g, '\\"')}"`,
    'PUBLIC_BASE_URL',
  )

  return rendered
}

function parseArgs(argv) {
  const options = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--app') {
      options.appName = next
      index += 1
      continue
    }

    if (arg === '--public-base-url') {
      options.publicBaseUrl = next
      index += 1
      continue
    }

    if (arg === '--template') {
      options.templatePath = next
      index += 1
      continue
    }

    if (arg === '--output') {
      options.outputPath = next
      index += 1
    }
  }

  return options
}

export function renderFlyConfigFile(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? process.cwd())
  const templatePath = resolve(repoRoot, options.templatePath ?? 'fly.toml')
  const outputPath = resolve(repoRoot, options.outputPath ?? '.fly/preview.toml')

  const template = readFileSync(templatePath, 'utf8')
  const rendered = renderFlyConfig(template, options)

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, rendered)

  return outputPath
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const outputPath = renderFlyConfigFile(options)
    console.log(`[render-fly-config] Wrote ${outputPath}`)
  } catch (error) {
    console.error(`[render-fly-config] FAILED: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
