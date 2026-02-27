/**
 * GitHub Re-Verification Job
 *
 * Runs once per day. Re-fetches star counts and pushed_at timestamps for
 * every registered agent that has a github_url. Keeps identity scores
 * up to date as repos gain (or lose) stars over time.
 *
 * Rate-limited to one GitHub API call every 2 seconds to stay well within
 * GitHub's unauthenticated limit of 60 req/hr (or 5000 if GITHUB_TOKEN set).
 */

import { GITHUB_REVERIFY_CONFIG } from '../config/constants.js'
import { getAllRegistrationsWithGithub, updateGithubVerification } from '../db.js'
import { log } from '../logger.js'
import { withRetry } from '../utils/retry.js'

const { INTER_CALL_DELAY_MS } = GITHUB_REVERIFY_CONFIG

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return null
    const parts = u.pathname
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0]!, repo: parts[1]! }
  } catch {
    return null
  }
}

async function fetchGithubRepo(
  owner: string,
  repo: string,
): Promise<{ stars: number; pushedAt: string } | 'not_found' | null> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'djd-agent-score/1.0',
    }
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    }
    const resp = await withRetry(
      async () => {
        const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        })
        // Don't retry 4xx — they're deterministic, not transient
        if (r.status >= 400 && r.status < 500) return r
        if (!r.ok) throw new Error(`GitHub API ${r.status}`)
        return r
      },
      { attempts: 2, baseDelayMs: 2_000, tag: 'github-reverify' },
    )
    if (resp.status === 404 || resp.status === 451) return 'not_found'
    if (!resp.ok) return null
    const data = (await resp.json()) as { private: boolean; stargazers_count: number; pushed_at: string }
    if (data.private) return 'not_found'
    return { stars: data.stargazers_count ?? 0, pushedAt: data.pushed_at }
  } catch {
    return null
  }
}

export async function runGithubReverify(): Promise<void> {
  const registrations = getAllRegistrationsWithGithub()
  if (registrations.length === 0) return

  log.info('github-reverify', `Re-verifying ${registrations.length} registered wallet(s)`)
  let updated = 0

  for (const reg of registrations) {
    if (!reg.github_url) continue

    const parsed = parseGithubUrl(reg.github_url)
    if (!parsed) {
      updateGithubVerification(reg.wallet, false, null, null)
      continue
    }

    const result = await fetchGithubRepo(parsed.owner, parsed.repo)
    if (result === null) {
      // API error (rate limit, timeout, etc.) — skip, don't unverify
      log.info('github-reverify', `${reg.wallet.slice(0, 10)}… → API error, skipping`)
      continue
    }
    if (result === 'not_found') {
      updateGithubVerification(reg.wallet, false, null, null)
      continue
    }
    updateGithubVerification(reg.wallet, true, result.stars, result.pushedAt)
    updated++
    log.info('github-reverify', `${reg.wallet.slice(0, 10)}… → ${parsed.owner}/${parsed.repo} (${result.stars}★)`)

    await new Promise((r) => setTimeout(r, INTER_CALL_DELAY_MS))
  }

  log.info('github-reverify', `Done — ${updated}/${registrations.length} verified`)
}
