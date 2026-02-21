/**
 * DJD Agent Score — Demo Agent
 *
 * Demonstrates the full x402 client flow:
 *   1. Derives a wallet from DEMO_PRIVATE_KEY (or generates an ephemeral one)
 *   2. Self-registers via POST /v1/agent/register (free)
 *   3. Fetches its own score via GET /v1/score/basic (x402 micropayment on Base)
 *   4. Prints a score badge to stdout
 *
 * Usage:
 *   DEMO_PRIVATE_KEY=0x... npx tsx examples/demo-agent.ts
 *   BASE_URL=https://djdagentscore.xyz npx tsx examples/demo-agent.ts
 *
 * Notes:
 *   - The first 10 /v1/score/basic calls per IP per day are served free (no USDC needed).
 *   - After the free tier is exhausted, the script pays $0.03 USDC via x402.
 *     Your wallet must hold USDC on Base mainnet for paid calls.
 *   - If no DEMO_PRIVATE_KEY is set, a random wallet is generated (ephemeral, no funds).
 */

import { createWalletClient, generatePrivateKey, http, privateKeyToAccount } from 'viem'
import { base } from 'viem/chains'
import { createPaymentHeader, selectPaymentRequirements } from 'x402/client'

// ---------- Config ----------

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const DEMO_PRIVATE_KEY = process.env.DEMO_PRIVATE_KEY as `0x${string}` | undefined

// ---------- Setup wallet ----------

const privateKey: `0x${string}` = DEMO_PRIVATE_KEY ?? generatePrivateKey()
const account = privateKeyToAccount(privateKey)
const wallet = account.address.toLowerCase() as `0x${string}`

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
})

console.log(`\n[demo] Wallet: ${account.address}`)
if (!DEMO_PRIVATE_KEY) {
  console.log('[demo] No DEMO_PRIVATE_KEY set — using ephemeral wallet (no funds, free-tier only)')
}

// ---------- Step 1: Self-register ----------

console.log('\n[1/3] Registering agent...')

const registerRes = await fetch(`${BASE_URL}/v1/agent/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet: account.address,
    name: 'DJD Demo Agent',
    description: 'Reference x402 client demo — see examples/demo-agent.ts',
    github_url: 'https://github.com/jacobsd32-cpu/djdagentscore',
  }),
})

if (!registerRes.ok && registerRes.status !== 200 && registerRes.status !== 201) {
  console.error(`[register] Failed: HTTP ${registerRes.status}`)
  const body = await registerRes.text()
  console.error('[register]', body)
  process.exit(1)
}

const regBody = (await registerRes.json()) as { status: string; registeredAt: string }
console.log(`[1/3] ${registerRes.status === 201 ? 'Registered ✓' : 'Updated ✓'}  (${regBody.registeredAt})`)

// ---------- Step 2: Fetch score (x402-aware) ----------

console.log('\n[2/3] Fetching score...')

const scoreUrl = `${BASE_URL}/v1/score/basic?wallet=${account.address}`

// First attempt — may succeed (free tier) or return 402
const firstRes = await fetch(scoreUrl)

let scoreBody: Record<string, unknown>

if (firstRes.ok) {
  // Free tier hit — no payment needed
  console.log('[2/3] Served via free tier (no payment required)')
  scoreBody = (await firstRes.json()) as Record<string, unknown>
} else if (firstRes.status === 402) {
  // Need to pay — parse payment requirements from the 402 response
  const paymentInfo = (await firstRes.json()) as {
    x402Version: number
    accepts: unknown[]
  }

  if (!paymentInfo.accepts || paymentInfo.accepts.length === 0) {
    console.error('[2/3] 402 received but no payment requirements in response')
    process.exit(1)
  }

  const selected = selectPaymentRequirements(
    paymentInfo.accepts as Parameters<typeof selectPaymentRequirements>[0],
    'base',
    'exact',
  )

  if (!selected) {
    console.error('[2/3] No suitable payment requirement found (need base/exact)')
    process.exit(1)
  }

  console.log(
    `[2/3] 402 — paying ${Number(selected.maxAmountRequired) / 1_000_000} USDC via x402...`,
  )

  let paymentHeader: string
  try {
    paymentHeader = await createPaymentHeader(walletClient, paymentInfo.x402Version, selected)
  } catch (err) {
    console.error('[2/3] Payment signing failed:', (err as Error).message)
    console.error(
      '      If using an ephemeral wallet, fund it with USDC on Base or set DEMO_PRIVATE_KEY.',
    )
    process.exit(1)
  }

  // Retry with payment header
  const paidRes = await fetch(scoreUrl, {
    headers: { 'X-PAYMENT': paymentHeader },
  })

  if (!paidRes.ok) {
    const errBody = await paidRes.text()
    console.error(`[2/3] Paid request failed: HTTP ${paidRes.status}`)
    console.error('[2/3]', errBody)
    process.exit(1)
  }

  console.log('[2/3] Payment accepted ✓')
  scoreBody = (await paidRes.json()) as Record<string, unknown>
} else {
  const errBody = await firstRes.text()
  console.error(`[2/3] Unexpected HTTP ${firstRes.status}:`, errBody)
  process.exit(1)
}

// ---------- Step 3: Print badge ----------

const score = scoreBody.score as number
const tier = scoreBody.tier as string
const stale = (scoreBody.stale as boolean | undefined) ? ' [stale]' : ''

const tierEmoji: Record<string, string> = {
  Elite: '⭐',
  Trusted: '✅',
  Established: '🔵',
  Emerging: '🟡',
  Unverified: '⚪',
}

const emoji = tierEmoji[tier] ?? '❓'

console.log('\n[3/3] Score badge:')
console.log('─'.repeat(48))
console.log(`  ${emoji} ${tier.padEnd(14)} score=${String(score).padStart(3)}/100${stale}`)
console.log(`  wallet: ${account.address}`)
console.log(`  registered: true`)
console.log('─'.repeat(48))
console.log()
