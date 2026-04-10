import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const GANACHE_DIR = join(REPO_ROOT, 'node_modules', 'ganache')

function resolveGanacheCorePath(): string {
  const distDir = readdirSync(GANACHE_DIR).find((entry) => /^dist(\s+\d+)?$/.test(entry))
  if (!distDir) {
    throw new Error('Unable to locate Ganache dist directory')
  }

  return join(GANACHE_DIR, distDir, 'node', 'core.js')
}

const require = createRequire(import.meta.url)
const ganacheModule = require(resolveGanacheCorePath())

const ganache = ('default' in ganacheModule ? ganacheModule.default : ganacheModule) as typeof import('ganache')

export default ganache
