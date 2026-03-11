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
import { log } from '../logger.js'
import { getRegistrationsWithGithub, syncGithubVerification } from '../services/registrationService.js'

const { INTER_CALL_DELAY_MS } = GITHUB_REVERIFY_CONFIG

export async function runGithubReverify(): Promise<void> {
  const registrations = getRegistrationsWithGithub()
  if (registrations.length === 0) return

  log.info('github-reverify', `Re-verifying ${registrations.length} registered wallet(s)`)
  let updated = 0

  for (const reg of registrations) {
    if (!reg.github_url) continue

    const result = await syncGithubVerification(reg.wallet, reg.github_url!, { preserveOnFailure: true })
    if (result === 'api_error') {
      // API error (rate limit, timeout, etc.) — skip, don't unverify
      log.info('github-reverify', `${reg.wallet.slice(0, 10)}… → API error, skipping`)
      continue
    }
    if (result === 'verified') {
      updated++
    }

    await new Promise((r) => setTimeout(r, INTER_CALL_DELAY_MS))
  }

  log.info('github-reverify', `Done — ${updated}/${registrations.length} verified`)
}
