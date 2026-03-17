import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPublicClient, createWalletClient, http, parseEther, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { buildEscrowIdHash } from '../src/contracts/djdEvaluatorOracleCallback.js'
import { buildEvaluatorVerdictTypedData } from '../src/services/evaluatorAttestationService.js'
import ganache from './helpers/ganache.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ARTIFACTS_DIR = join(ROOT, 'artifacts', 'contracts')
const CHAIN_ID = 8453

const DEPLOYER_KEY = '0x1000000000000000000000000000000000000000000000000000000000000001' as const
const PROVIDER_KEY = '0x2000000000000000000000000000000000000000000000000000000000000002' as const
const COUNTERPARTY_KEY = '0x3000000000000000000000000000000000000000000000000000000000000003' as const
const RELAYER_KEY = '0x4000000000000000000000000000000000000000000000000000000000000004' as const
const ORACLE_KEY = '0x5000000000000000000000000000000000000000000000000000000000000005' as const

const deployerAccount = privateKeyToAccount(DEPLOYER_KEY)
const providerAccount = privateKeyToAccount(PROVIDER_KEY)
const counterpartyAccount = privateKeyToAccount(COUNTERPARTY_KEY)
const relayerAccount = privateKeyToAccount(RELAYER_KEY)
const oracleAccount = privateKeyToAccount(ORACLE_KEY)

function fundedAccount(secretKey: `0x${string}`) {
  return {
    secretKey,
    balance: toHex(parseEther('1000')),
  }
}

function loadArtifact(contract: string) {
  return JSON.parse(readFileSync(join(ARTIFACTS_DIR, `${contract}.json`), 'utf8')) as {
    abi: unknown[]
    bytecode: `0x${string}`
  }
}

function buildLocalBase(url: string) {
  return {
    ...base,
    rpcUrls: {
      default: { http: [url] },
      public: { http: [url] },
    },
  }
}

describe('compiled DJD contracts on a local EVM', () => {
  const verifierArtifact = loadArtifact('DJDEvaluatorVerdictVerifier')
  const escrowArtifact = loadArtifact('DJDEvaluatorEscrowSettlementExample')

  let server: Awaited<ReturnType<typeof ganache.server>>
  let rpcUrl: string
  let chain: ReturnType<typeof buildLocalBase>
  let publicClient: ReturnType<typeof createPublicClient>

  beforeAll(async () => {
    server = ganache.server({
      chain: {
        chainId: CHAIN_ID,
      },
      logging: {
        quiet: true,
      },
      wallet: {
        accounts: [
          fundedAccount(DEPLOYER_KEY),
          fundedAccount(PROVIDER_KEY),
          fundedAccount(COUNTERPARTY_KEY),
          fundedAccount(RELAYER_KEY),
        ],
      },
    })

    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', (error: Error | null) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })

    const address = server.address() as AddressInfo
    rpcUrl = `http://127.0.0.1:${address.port}`
    chain = buildLocalBase(rpcUrl)
    publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    })
  })

  afterAll(async () => {
    server.provider.disconnect()
    await server.close()
  }, 30000)

  async function deployFixture(escrowId: string) {
    const deployerClient = createWalletClient({
      account: deployerAccount,
      chain,
      transport: http(rpcUrl),
    })

    const verifierDeployHash = await deployerClient.deployContract({
      abi: verifierArtifact.abi as any,
      bytecode: verifierArtifact.bytecode,
      args: [oracleAccount.address],
      account: deployerAccount,
      chain,
    })
    const verifierReceipt = await publicClient.waitForTransactionReceipt({ hash: verifierDeployHash })
    const verifierAddress = verifierReceipt.contractAddress
    if (!verifierAddress) {
      throw new Error('Verifier deployment did not return a contract address')
    }

    const escrowDeployHash = await deployerClient.deployContract({
      abi: escrowArtifact.abi as any,
      bytecode: escrowArtifact.bytecode,
      args: [verifierAddress, providerAccount.address, counterpartyAccount.address, buildEscrowIdHash(escrowId)],
      account: deployerAccount,
      chain,
    })
    const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowDeployHash })
    const escrowAddress = escrowReceipt.contractAddress
    if (!escrowAddress) {
      throw new Error('Escrow deployment did not return a contract address')
    }

    return { verifierAddress, escrowAddress }
  }

  function buildVerdict(overrides: Partial<Parameters<typeof buildEvaluatorVerdictTypedData>[0]> = {}) {
    const verdict = {
      verdict_id: 'verdict_e2e_fixture',
      wallet: providerAccount.address,
      counterparty_wallet: counterpartyAccount.address,
      escrow_id: 'escrow-e2e',
      decision: 'approve',
      recommendation: 'release',
      approved: true,
      confidence: 92,
      agent_score_provider: 87,
      score_model_version: '2.0.0',
      certification_valid: true,
      certification_tier: 'Transactional',
      risk_level: 'clear',
      risk_score: 8,
      forensic_trace_id: 'trace_e2e_fixture',
      packet_hash: `0x${'1'.repeat(64)}` as `0x${string}`,
      generated_at: '2026-03-15T00:00:00.000Z',
      ...overrides,
    }

    return buildEvaluatorVerdictTypedData(verdict)
  }

  it('verifies a signed verdict and settles the escrow release path', async () => {
    const { verifierAddress, escrowAddress } = await deployFixture('escrow-e2e')
    const { digest, typed_data } = buildVerdict()
    const signature = await oracleAccount.signTypedData(typed_data)

    const relayerClient = createWalletClient({
      account: relayerAccount,
      chain,
      transport: http(rpcUrl),
    })

    const settleHash = await relayerClient.writeContract({
      address: escrowAddress,
      abi: escrowArtifact.abi as any,
      functionName: 'settleWithDJDVerdict',
      args: [typed_data.message, signature],
      account: relayerAccount,
      chain,
    })
    await publicClient.waitForTransactionReceipt({ hash: settleHash })

    const [settled, outcome, releaseAuthorized, lastVerdictDigest, lastPacketHash, verifierAccepted] = await Promise.all([
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowArtifact.abi as any,
        functionName: 'settled',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowArtifact.abi as any,
        functionName: 'outcome',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowArtifact.abi as any,
        functionName: 'releaseAuthorized',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowArtifact.abi as any,
        functionName: 'lastVerdictDigest',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowArtifact.abi as any,
        functionName: 'lastPacketHash',
      }),
      publicClient.readContract({
        address: verifierAddress,
        abi: verifierArtifact.abi as any,
        functionName: 'verifyVerdict',
        args: [typed_data.message, signature],
      }),
    ])

    expect(settled).toBe(true)
    expect(Number(outcome)).toBe(1)
    expect(releaseAuthorized).toBe(true)
    expect(lastVerdictDigest).toBe(digest)
    expect(lastPacketHash).toBe(typed_data.message.packetHash)
    expect(verifierAccepted).toBe(true)
  })

  it('maps a signed manual-review verdict into the non-release escrow outcome', async () => {
    const { escrowAddress } = await deployFixture('escrow-e2e')
    const { typed_data } = buildVerdict({
      verdict_id: 'verdict_e2e_manual_review',
      decision: 'review',
      recommendation: 'manual_review',
      approved: false,
      confidence: 64,
      certification_valid: false,
      certification_tier: null,
      risk_level: 'elevated',
      risk_score: 41,
      packet_hash: `0x${'2'.repeat(64)}` as `0x${string}`,
    })
    const signature = await oracleAccount.signTypedData(typed_data)

    const relayerClient = createWalletClient({
      account: relayerAccount,
      chain,
      transport: http(rpcUrl),
    })

    const settleHash = await relayerClient.writeContract({
      address: escrowAddress,
      abi: escrowArtifact.abi as any,
      functionName: 'settleWithDJDVerdict',
      args: [typed_data.message, signature],
      account: relayerAccount,
      chain,
    })
    await publicClient.waitForTransactionReceipt({ hash: settleHash })

    const [outcome, releaseAuthorized] = await Promise.all([
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowArtifact.abi as any,
        functionName: 'outcome',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowArtifact.abi as any,
        functionName: 'releaseAuthorized',
      }),
    ])

    expect(Number(outcome)).toBe(2)
    expect(releaseAuthorized).toBe(false)
  })

  it('rejects a tampered verdict payload even when the signature was valid for the original message', async () => {
    const { verifierAddress, escrowAddress } = await deployFixture('escrow-e2e')
    const { typed_data } = buildVerdict({
      verdict_id: 'verdict_e2e_invalid_signature',
      packet_hash: `0x${'3'.repeat(64)}` as `0x${string}`,
    })
    const signature = await oracleAccount.signTypedData(typed_data)

    const relayerClient = createWalletClient({
      account: relayerAccount,
      chain,
      transport: http(rpcUrl),
    })

    const tamperedVerdict = {
      ...typed_data.message,
      packetHash: `0x${'4'.repeat(64)}` as `0x${string}`,
    }

    await expect(
      relayerClient.writeContract({
        address: escrowAddress,
        abi: escrowArtifact.abi as any,
        functionName: 'settleWithDJDVerdict',
        args: [tamperedVerdict, signature],
        account: relayerAccount,
        chain,
      }),
    ).rejects.toThrow()

    const [settled, verifierAccepted] = await Promise.all([
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowArtifact.abi as any,
        functionName: 'settled',
      }),
      publicClient.readContract({
        address: verifierAddress,
        abi: verifierArtifact.abi as any,
        functionName: 'verifyVerdict',
        args: [tamperedVerdict, signature],
      }),
    ])

    expect(settled).toBe(false)
    expect(verifierAccepted).toBe(false)
  })
})
