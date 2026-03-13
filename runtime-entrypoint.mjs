const MODE_TO_TARGET = {
  combined: './dist/index.js',
  api: './dist/api.js',
  worker: './dist/worker.js',
}

const rawMode = (process.env.DJD_RUNTIME_MODE ?? 'combined').toLowerCase()

if (!(rawMode in MODE_TO_TARGET)) {
  console.error(
    `[entrypoint] Invalid DJD_RUNTIME_MODE "${rawMode}". Expected one of: ${Object.keys(MODE_TO_TARGET).join(', ')}`,
  )
  process.exit(1)
}

process.env.DJD_RUNTIME_MODE = rawMode

const target = MODE_TO_TARGET[rawMode]

if (process.env.DJD_RUNTIME_DRY_RUN === '1') {
  console.log(JSON.stringify({ mode: rawMode, target }))
  process.exit(0)
}

try {
  await import(target)
} catch (error) {
  console.error(`[entrypoint] Failed to start runtime mode "${rawMode}" from ${target}`)
  throw error
}
