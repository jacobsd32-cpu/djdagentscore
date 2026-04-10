import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { runEvaluatorStackPreflight } from './preflight-evaluator-stack.mjs'

function normalizeFormat(value) {
  const normalized = String(value ?? 'dotenv')
    .trim()
    .toLowerCase()

  if (['dotenv', 'shell', 'json'].includes(normalized)) {
    return normalized
  }

  return 'dotenv'
}

function writeTextFile(outputPath, contents) {
  if (typeof outputPath !== 'string' || outputPath.trim().length === 0) {
    return null
  }

  writeFileSync(outputPath, contents)
  return outputPath
}

export async function bootstrapEvaluatorStackEnv(options = {}) {
  const preflight = await runEvaluatorStackPreflight(options)
  const selectedFormat = normalizeFormat(options.format ?? process.env.DJD_ENV_BOOTSTRAP_FORMAT)
  const json = JSON.stringify(preflight.guidance.recommended_env, null, 2) + '\n'
  const renderedByFormat = {
    dotenv: preflight.guidance.dotenv,
    shell: preflight.guidance.shell,
    json,
  }
  const rendered = renderedByFormat[selectedFormat]

  const result = {
    standard: 'djd-evaluator-env-bootstrap-v1',
    ok: true,
    ready: preflight.ok,
    network: preflight.network,
    preflight: {
      ok: preflight.ok,
      missing: preflight.guidance.missing,
    },
    outputs: {
      dotenv: preflight.guidance.dotenv,
      shell: preflight.guidance.shell,
      json,
      selected_format: selectedFormat,
      selected_contents: rendered,
    },
    file: null,
  }

  result.file = writeTextFile(
    options.outputPath ?? process.env.DJD_ENV_BOOTSTRAP_OUTPUT_PATH,
    rendered,
  )

  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrapEvaluatorStackEnv()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(`[contracts:bootstrap-env] FAILED: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
}
