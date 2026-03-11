import { getAllRegistrationsWithGithub, getRegistration, updateGithubVerification, upsertRegistration } from '../db.js'
import { queueWebhookEvent } from '../jobs/webhookDelivery.js'
import { log } from '../logger.js'
import type { Address, AgentRegistrationBody, AgentRegistrationResponse, AgentRegistrationRow } from '../types.js'
import { withRetry } from '../utils/retry.js'

export interface GithubVerificationResult {
  stars: number
  pushedAt: string
}

export function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'github.com') return null
    const parts = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0]!, repo: parts[1]! }
  } catch {
    return null
  }
}

export async function fetchGithubRepo(
  owner: string,
  repo: string,
): Promise<GithubVerificationResult | 'not_found' | null> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'djd-agent-score/1.0',
    }
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const response = await withRetry(
      async () => {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        })
        if (res.status >= 400 && res.status < 500) return res
        if (!res.ok) throw new Error(`GitHub API ${res.status}`)
        return res
      },
      { attempts: 2, baseDelayMs: 2_000, tag: 'github-verify' },
    )
    if (response.status === 404 || response.status === 451) return 'not_found'
    if (!response.ok) return null

    const data = (await response.json()) as {
      private: boolean
      stargazers_count: number
      pushed_at: string
    }
    if (data.private) return 'not_found'

    return {
      stars: data.stargazers_count ?? 0,
      pushedAt: data.pushed_at,
    }
  } catch {
    return null
  }
}

export async function syncGithubVerification(
  wallet: string,
  githubUrl: string,
  options?: { preserveOnFailure?: boolean },
): Promise<'verified' | 'not_found' | 'invalid' | 'api_error'> {
  const parsed = parseGithubUrl(githubUrl)
  if (!parsed) {
    updateGithubVerification(wallet, false, null, null)
    return 'invalid'
  }

  const result = await fetchGithubRepo(parsed.owner, parsed.repo)
  if (result === null) {
    if (!options?.preserveOnFailure) {
      updateGithubVerification(wallet, false, null, null)
    }
    return 'api_error'
  }

  if (result === 'not_found') {
    updateGithubVerification(wallet, false, null, null)
    return 'not_found'
  }

  updateGithubVerification(wallet, true, result.stars, result.pushedAt)
  log.info('register', `GitHub verified: ${wallet} → ${parsed.owner}/${parsed.repo} (${result.stars}★)`)
  return 'verified'
}

function buildRegistrationResponse(row: AgentRegistrationRow, status: 'registered' | 'updated'): AgentRegistrationResponse {
  return {
    wallet: row.wallet as Address,
    status,
    registeredAt: row.registered_at,
    name: row.name,
    description: row.description,
    github_url: row.github_url,
    website_url: row.website_url,
    github_verified: row.github_verified === 1,
    github_stars: row.github_stars ?? null,
    github_pushed_at: row.github_pushed_at ?? null,
  }
}

export function getRegistrationResponse(wallet: string): AgentRegistrationResponse | null {
  const row = getRegistration(wallet)
  if (!row) return null
  return buildRegistrationResponse(row, 'registered')
}

export function registerAgent(body: {
  wallet: string
  name?: string
  description?: string
  github_url?: string
  website_url?: string
}): { response: AgentRegistrationResponse; httpStatus: 200 | 201; githubUrlToVerify: string | null } {
  const existing = getRegistration(body.wallet)
  const isNew = !existing

  const newGithubUrl =
    body.github_url !== undefined ? (body.github_url?.slice(0, 200) ?? null) : (existing?.github_url ?? null)
  const githubUrlChanged = newGithubUrl !== (existing?.github_url ?? null)

  upsertRegistration({
    wallet: body.wallet,
    name: body.name !== undefined ? (body.name?.trim().slice(0, 100) ?? null) : (existing?.name ?? null),
    description:
      body.description !== undefined
        ? (body.description?.trim().slice(0, 500) ?? null)
        : (existing?.description ?? null),
    github_url: newGithubUrl,
    website_url:
      body.website_url !== undefined ? (body.website_url?.slice(0, 200) ?? null) : (existing?.website_url ?? null),
  })

  const row = getRegistration(body.wallet)!
  const neverVerified = !row.github_verified_at
  const githubUrlToVerify = newGithubUrl && (isNew || githubUrlChanged || neverVerified) ? newGithubUrl : null

  queueWebhookEvent('agent.registered', {
    wallet: body.wallet,
    status: isNew ? 'registered' : 'updated',
    registeredAt: row.registered_at,
    name: row.name ?? null,
    github_url: row.github_url ?? null,
  })

  return {
    response: buildRegistrationResponse(row, isNew ? 'registered' : 'updated'),
    httpStatus: isNew ? 201 : 200,
    githubUrlToVerify,
  }
}

export function getRegistrationsWithGithub(): AgentRegistrationRow[] {
  return getAllRegistrationsWithGithub()
}
