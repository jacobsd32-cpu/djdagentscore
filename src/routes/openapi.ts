import { Hono } from 'hono'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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
