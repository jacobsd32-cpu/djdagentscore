import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'

const __dirname = dirname(fileURLToPath(import.meta.url))
// openapi.json sits at the repo root, two levels up from src/routes/
const specPath = join(__dirname, '..', '..', 'openapi.json')
const spec = readFileSync(specPath, 'utf8')

const openapi = new Hono()

openapi.get('/', (c) => {
  c.header('Content-Type', 'application/json')
  c.header('Cache-Control', 'public, max-age=3600')
  return c.body(spec)
})

export default openapi
