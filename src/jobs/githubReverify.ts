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

import { getAllRegistrationsWithGithub, updateGithubVerification } from '../db.js'
import { log } from '../logger.js'

const INTER_CALL_DELAY_MS = 2_000

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return null
    const parts = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0]!, repo: parts[1]! }
  } catch {
    return null
  }
}

async function fetchGithubRepo(
  owner: string,
  repo: string,
): Promise<{ stars: number; pushedAt: string } | null> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'djd-agent-score/1.0',
    }
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    }
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    })
    if (!resp.ok) return null
    const data = await resp.json() as { private: boolean; stargazers_count: number; pushed_at: string }
    if (data.private) return null
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
    if (result) {
      updateGithubVerification(reg.wallet, true, result.stars, result.pushedAt)
      updated++
      log.info('github-reverify', `${reg.wallet.slice(0, 10)}… → ${parsed.owner}/${parsed.repo} (${result.stars}★)`)
    } else {
      updateGithubVerification(reg.wallet, false, null, null)
    }

    await new Promise((r) => setTimeout(r, INTER_CALL_DELAY_MS))
  }

  log.info('github-reverify', `Done — ${updated}/${registrations.length} verified`)
}
