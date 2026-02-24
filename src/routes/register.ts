import { Hono } from 'hono'
import { upsertRegistration, getRegistration, updateGithubVerification } from '../db.js'
import { isValidAddress } from '../types.js'
import type { Address, AgentRegistrationBody, AgentRegistrationResponse } from '../types.js'
import { log } from '../logger.js'

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Parse a GitHub URL and return { owner, repo } or null if not a valid GitHub repo URL.
 * Accepts: https://github.com/owner/repo  (with or without .git)
 */
function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return null
    const parts = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1] }
  } catch {
    return null
  }
}

/**
 * Verify a GitHub repo exists and is public.
 * Returns null if the repo doesn't exist or the request fails.
 */
async function verifyGithubRepo(
  owner: string,
  repo: string,
): Promise<{ stars: number; pushedAt: string } | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'djd-agent-score/1.0',
    }
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    })

    if (!resp.ok) return null // 404 = doesn't exist, 403 = private

    const data = await resp.json() as {
      private: boolean
      stargazers_count: number
      pushed_at: string
    }

    if (data.private) return null // private repo doesn't count

    return {
      stars: data.stargazers_count ?? 0,
      pushedAt: data.pushed_at,
    }
  } catch {
    return null
  }
}

/**
 * Fire-and-forget GitHub verification. Runs after the HTTP response is sent.
 * Updates the DB with verification results.
 */
async function verifyAndStoreGithub(wallet: string, githubUrl: string): Promise<void> {
  const parsed = parseGithubUrl(githubUrl)
  if (!parsed) {
    updateGithubVerification(wallet, false, null, null)
    return
  }

  const result = await verifyGithubRepo(parsed.owner, parsed.repo)
  if (result) {
    updateGithubVerification(wallet, true, result.stars, result.pushedAt)
    log.info('register', `GitHub verified: ${wallet} → ${parsed.owner}/${parsed.repo} (${result.stars}★)`)
  } else {
    updateGithubVerification(wallet, false, null, null)
    log.warn('register', `GitHub not verified: ${wallet} → ${githubUrl}`)
  }
}

const register = new Hono()

// GET /v1/agent/register?wallet=0x...
register.get('/', (c) => {
  const wallet = c.req.query('wallet')
  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
  }

  const row = getRegistration(wallet.toLowerCase())
  if (!row) {
    return c.json({ error: 'Wallet not registered' }, 404)
  }

  const response: AgentRegistrationResponse = {
    wallet: row.wallet as Address,
    status: 'registered',
    registeredAt: row.registered_at,
    name: row.name,
    description: row.description,
    github_url: row.github_url,
    website_url: row.website_url,
    github_verified: row.github_verified === 1,
    github_stars: row.github_stars ?? null,
    github_pushed_at: row.github_pushed_at ?? null,
  }

  return c.json(response)
})

// POST /v1/agent/register
register.post('/', async (c) => {
  let body: AgentRegistrationBody
  try {
    body = await c.req.json<AgentRegistrationBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { wallet, name, description, github_url, website_url } = body

  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
  }

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    return c.json({ error: 'name must be a non-empty string' }, 400)
  }
  if (description !== undefined && typeof description !== 'string') {
    return c.json({ error: 'description must be a string' }, 400)
  }
  if (github_url !== undefined && !isValidUrl(github_url)) {
    return c.json({ error: 'github_url must be a valid URL' }, 400)
  }
  if (website_url !== undefined && !isValidUrl(website_url)) {
    return c.json({ error: 'website_url must be a valid URL' }, 400)
  }

  const normalizedWallet = wallet.toLowerCase()
  const existing = getRegistration(normalizedWallet)
  const isNew = !existing

  const newGithubUrl = github_url !== undefined ? (github_url?.slice(0, 200) ?? null) : (existing?.github_url ?? null)
  const githubUrlChanged = newGithubUrl !== (existing?.github_url ?? null)

  // Merge: omitted fields retain existing values; explicit null/empty clears them
  upsertRegistration({
    wallet: normalizedWallet,
    name:        name        !== undefined ? (name?.trim().slice(0, 100) ?? null)        : (existing?.name ?? null),
    description: description !== undefined ? (description?.trim().slice(0, 500) ?? null) : (existing?.description ?? null),
    github_url:  newGithubUrl,
    website_url: website_url !== undefined ? (website_url?.slice(0, 200) ?? null)        : (existing?.website_url ?? null),
  })

  const row = getRegistration(normalizedWallet)!

  // Kick off GitHub verification asynchronously (doesn't block the response).
  // Trigger on: new registration, URL changed, or never verified yet.
  const neverVerified = !row.github_verified_at
  if (newGithubUrl && (isNew || githubUrlChanged || neverVerified)) {
    verifyAndStoreGithub(normalizedWallet, newGithubUrl).catch(() => { /* ignore */ })
  }

  const response: AgentRegistrationResponse = {
    wallet: normalizedWallet as Address,
    status: isNew ? 'registered' : 'updated',
    registeredAt: row.registered_at,
    name: row.name,
    description: row.description,
    github_url: row.github_url,
    website_url: row.website_url,
    github_verified: row.github_verified === 1,
    github_stars: row.github_stars ?? null,
    github_pushed_at: row.github_pushed_at ?? null,
  }

  return c.json(response, isNew ? 201 : 200)
})

export default register
