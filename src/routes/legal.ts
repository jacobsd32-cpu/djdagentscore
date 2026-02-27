import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { leaderboardHtml, privacyContent, tosContent, wrapHtml } from '../templates/legal.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const indexHtml = readFileSync(join(__dirname, '../../index.html'), 'utf8')

const legal = new Hono()

legal.get('/', (c) => c.html(indexHtml))

legal.get('/leaderboard', (c) => c.html(leaderboardHtml))

legal.get('/terms', (c) => {
  return c.html(wrapHtml('Terms of Service', tosContent))
})

legal.get('/privacy', (c) => {
  return c.html(wrapHtml('Privacy Policy', privacyContent))
})

export default legal
