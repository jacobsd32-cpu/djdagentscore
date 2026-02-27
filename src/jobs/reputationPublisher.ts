/**
 * ERC-8004 Reputation Publisher
 *
 * Periodically publishes high-confidence DJD Agent Scores to the on-chain
 * ERC-8004 Reputation Registry on Base mainnet via `giveFeedback()`.
 *
 * Each published score creates a verifiable on-chain record:
 *   - agentId  = uint256(uint160(walletAddress))
 *   - value    = composite_score (0-100 int128, 0 decimals)
 *   - tag1     = "djd-composite" (identifies the score type)
 *   - tag2     = model_version  (scoring model that produced it)
 *   - endpoint = DJD full-score API endpoint
 *   - feedbackURI  = empty (all data is on the endpoint)
 *   - feedbackHash = keccak256 of JSON payload (tamper-evident link)
 */

import type { Account, Chain, Transport, WalletClient } from 'viem'
import { createWalletClient, formatEther, http, keccak256, parseAbi, stringToHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { ERC8004_REPUTATION_REGISTRY, getPublicClient } from '../blockchain.js'
import { REPUTATION_PUBLISHER_CONFIG } from '../config/constants.js'
import { getScoresNeedingPublication, upsertPublication } from '../db.js'
import { log } from '../logger.js'
import { withRetry } from '../utils/retry.js'

// ---------- Constants ----------

const TAG = 'erc8004-publisher'

const { MIN_CONFIDENCE, SCORE_DELTA, BATCH_LIMIT, TX_TIMEOUT_MS, INTER_TX_DELAY_MS, MIN_ETH_BALANCE, SCORE_ENDPOINT } =
  REPUTATION_PUBLISHER_CONFIG

const GIVE_FEEDBACK_ABI = parseAbi([
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
])

// ---------- Lazy wallet client ----------

let _walletClient: WalletClient<Transport, Chain, Account> | null = null

function getWalletClient(): WalletClient<Transport, Chain, Account> | null {
  if (_walletClient) return _walletClient
  const pk = process.env.PUBLISHER_PRIVATE_KEY
  if (!pk) return null

  const account = privateKeyToAccount(pk as `0x${string}`)
  const rpcUrl = process.env.BASE_RPC_URL ?? 'https://base-mainnet.public.blastapi.io'

  _walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  })

  log.info(TAG, `Wallet client initialized — publisher address: ${account.address}`)
  return _walletClient
}

// ---------- Helpers ----------

/**
 * Map an Ethereum address to an ERC-8004 agentId.
 * The registry uses uint256(uint160(address)) as the identifier.
 */
function walletToAgentId(wallet: string): bigint {
  return BigInt(wallet)
}

/**
 * Build a keccak256 hash of the off-chain score payload.
 * This creates a tamper-evident link: on-chain hash ↔ off-chain data.
 */
function buildFeedbackHash(payload: Record<string, unknown>): `0x${string}` {
  const json = JSON.stringify(payload)
  return keccak256(stringToHex(json))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------- Main ----------

export async function runReputationPublisher(): Promise<void> {
  const wallet = getWalletClient()
  if (!wallet) {
    log.info(TAG, 'PUBLISHER_PRIVATE_KEY not set — skipping on-chain publication')
    return
  }

  const publicClient = getPublicClient()

  // Check ETH balance for gas
  const balance = await publicClient.getBalance({ address: wallet.account.address })
  if (balance < MIN_ETH_BALANCE) {
    log.warn(TAG, `Low ETH balance (${formatEther(balance)} ETH) — skipping publication run`, {
      balance: formatEther(balance),
      address: wallet.account.address,
    })
    return
  }

  // Find scores eligible for publication
  const candidates = getScoresNeedingPublication(MIN_CONFIDENCE, SCORE_DELTA, BATCH_LIMIT)
  if (candidates.length === 0) {
    log.info(TAG, 'No scores need publication — all up to date')
    return
  }

  log.info(TAG, `Publishing ${candidates.length} score(s) to ERC-8004 Reputation Registry`)

  let published = 0
  let failed = 0

  for (const score of candidates) {
    try {
      const agentId = walletToAgentId(score.wallet)
      const modelVersion = score.model_version ?? 'v1'

      // Build the off-chain payload that feedbackHash commits to
      const offChainPayload = {
        wallet: score.wallet,
        composite_score: score.composite_score,
        model_version: modelVersion,
        confidence: score.confidence,
        tier: score.tier,
        calculated_at: score.calculated_at,
      }
      const feedbackHash = buildFeedbackHash(offChainPayload)

      log.info(TAG, `Publishing score for ${score.wallet}: ${score.composite_score} (confidence: ${score.confidence})`)

      // Submit transaction (retry on transient RPC errors)
      const txHash = await withRetry(
        () =>
          wallet.writeContract({
            address: ERC8004_REPUTATION_REGISTRY,
            abi: GIVE_FEEDBACK_ABI,
            functionName: 'giveFeedback',
            args: [
              agentId,
              BigInt(score.composite_score),
              0, // valueDecimals — score is an integer 0-100
              'djd-composite',
              modelVersion,
              SCORE_ENDPOINT,
              '', // feedbackURI — all data available at the endpoint
              feedbackHash,
            ],
          }),
        { attempts: 2, baseDelayMs: 3_000, tag: 'erc8004-publisher' },
      )

      log.info(TAG, `Tx submitted: ${txHash} — waiting for receipt...`)

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: TX_TIMEOUT_MS,
      })

      if (receipt.status === 'success') {
        upsertPublication({
          wallet: score.wallet,
          composite_score: score.composite_score,
          model_version: modelVersion,
          tx_hash: txHash,
        })
        published++
        log.info(TAG, `✓ Published ${score.wallet} → tx ${txHash} (block ${receipt.blockNumber})`)
      } else {
        failed++
        log.warn(TAG, `✗ Tx reverted for ${score.wallet}: ${txHash}`, { receipt })
      }
    } catch (err) {
      failed++
      log.error(TAG, `Error publishing score for ${score.wallet}`, err)
    }

    // Throttle between transactions to avoid nonce issues
    if (candidates.indexOf(score) < candidates.length - 1) {
      await sleep(INTER_TX_DELAY_MS)
    }
  }

  log.info(TAG, `Publication run complete: ${published} published, ${failed} failed`)
}
