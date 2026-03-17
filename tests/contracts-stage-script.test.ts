import type { AddressInfo } from 'node:net'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createPublicClient, http, parseEther, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { encodeEvaluatorEscrowSettlement } from '../src/contracts/djdEvaluatorEscrowSettlementExample.js'
import { buildEscrowIdHash } from '../src/contracts/djdEvaluatorOracleCallback.js'
import { encodeEvaluatorVerdictVerification } from '../src/contracts/djdEvaluatorVerdictVerifier.js'
import { buildEvaluatorVerdictAttestation } from '../src/services/evaluatorAttestationService.js'
import { getEvaluatorArtifactPackageView } from '../src/services/contractArtifactService.js'
import { runEvaluatorStackStage } from '../scripts/stage-evaluator-stack.mjs'
import ganache from './helpers/ganache.js'

const CHAIN_ID = 8453
const DEPLOYER_KEY = '0x9100000000000000000000000000000000000000000000000000000000000001' as const
const PROVIDER_KEY = '0x9200000000000000000000000000000000000000000000000000000000000002' as const
const COUNTERPARTY_KEY = '0x9300000000000000000000000000000000000000000000000000000000000003' as const
const ORACLE_KEY = '0x9400000000000000000000000000000000000000000000000000000000000004' as const

const providerAccount = privateKeyToAccount(PROVIDER_KEY)
const counterpartyAccount = privateKeyToAccount(COUNTERPARTY_KEY)
const oracleAccount = privateKeyToAccount(ORACLE_KEY)
const ORIGINAL_ORACLE_KEY = process.env.ORACLE_SIGNER_PRIVATE_KEY
const ORIGINAL_BASE_RPC_URL = process.env.DJD_BASE_RPC_URL
const ORIGINAL_RPC_URL = process.env.DJD_RPC_URL
const ORIGINAL_DEPLOYMENTS_PATH = process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH
const ORIGINAL_GITHUB_OUTPUT = process.env.GITHUB_OUTPUT

function fundedAccount(secretKey: `0x${string}`) {
  return {
    secretKey,
    balance: toHex(parseEther('1000')),
  }
}

function buildLocalBase(url: string) {
  return {
    ...base,
    id: CHAIN_ID,
    rpcUrls: {
      default: { http: [url] },
      public: { http: [url] },
    },
  }
}

describe('stage evaluator stack script', () => {
  const artifactPackage = getEvaluatorArtifactPackageView()
  const verifierArtifact = artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorVerdictVerifier')

  let server: Awaited<ReturnType<typeof ganache.server>>
  let rpcUrl: string
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
    publicClient = createPublicClient({
      chain: buildLocalBase(rpcUrl),
      transport: http(rpcUrl),
    })
  })

  afterEach(() => {
    if (ORIGINAL_ORACLE_KEY === undefined) {
      delete process.env.ORACLE_SIGNER_PRIVATE_KEY
    } else {
      process.env.ORACLE_SIGNER_PRIVATE_KEY = ORIGINAL_ORACLE_KEY
    }

    if (ORIGINAL_BASE_RPC_URL === undefined) {
      delete process.env.DJD_BASE_RPC_URL
    } else {
      process.env.DJD_BASE_RPC_URL = ORIGINAL_BASE_RPC_URL
    }

    if (ORIGINAL_RPC_URL === undefined) {
      delete process.env.DJD_RPC_URL
    } else {
      process.env.DJD_RPC_URL = ORIGINAL_RPC_URL
    }

    if (ORIGINAL_DEPLOYMENTS_PATH === undefined) {
      delete process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH
    } else {
      process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = ORIGINAL_DEPLOYMENTS_PATH
    }

    if (ORIGINAL_GITHUB_OUTPUT === undefined) {
      delete process.env.GITHUB_OUTPUT
    } else {
      process.env.GITHUB_OUTPUT = ORIGINAL_GITHUB_OUTPUT
    }
  })

  afterAll(async () => {
    server.provider.disconnect()
    await server.close()
  }, 30000)

  it('runs deploy, verify, and smoke as a single staging flow', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-stage-script-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')
    const promotionOutputPath = join(fixtureDir, 'promotion.json')
    const promotionDotenvPath = join(fixtureDir, 'promotion.env')
    const promotionShellPath = join(fixtureDir, 'promotion.sh')

    process.env.ORACLE_SIGNER_PRIVATE_KEY = ORACLE_KEY
    process.env.DJD_BASE_RPC_URL = rpcUrl
    process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH = registryPath
    delete process.env.DJD_RPC_URL
    delete process.env.GITHUB_OUTPUT

    const bundle = {
      standard: 'djd-evaluator-deploy-bundle-v1' as const,
      network: {
        key: 'base',
        chain_id: CHAIN_ID,
        chain_name: 'Base',
        caip2: 'eip155:8453',
        environment: 'mainnet',
      },
      verdict_id: 'verdict_stage_fixture',
      artifacts: {
        available: true,
        compiler: artifactPackage.compiler,
        verifier: artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorVerdictVerifier') ?? null,
        escrow: artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorEscrowSettlementExample') ?? null,
      },
      deployment: {
        order: ['verifier', 'escrow'] as const,
        verifier: {
          action: 'deploy' as const,
          contract: 'DJDEvaluatorVerdictVerifier' as const,
          current_address: null,
          constructor: {
            initial_signer: oracleAccount.address,
          },
          deployment_ready: true,
          reason: null,
        },
        escrow: {
          action: 'deploy' as const,
          contract: 'DJDEvaluatorEscrowSettlementExample' as const,
          constructor: {
            verifier: null,
            verifier_source: 'deployment_output' as const,
            provider: providerAccount.address,
            counterparty: counterpartyAccount.address,
            escrow_id: 'escrow-stage-script',
            escrow_id_hash: buildEscrowIdHash('escrow-stage-script'),
          },
          deployment_ready: true,
          reason: null,
        },
      },
      links: {
        verifier_package: 'https://api.example.test/v1/score/evaluator/verifier?network=base',
        verifier_proof: 'https://api.example.test/v1/score/evaluator/proof',
        escrow_settlement: 'https://api.example.test/v1/score/evaluator/escrow',
        artifact_package: 'https://api.example.test/v1/score/evaluator/artifacts',
        bundle: 'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_stage_fixture&network=base',
      },
      notes: ['fixture'],
    }

    const attestation = await buildEvaluatorVerdictAttestation(
      {
        verdict_id: bundle.verdict_id,
        wallet: providerAccount.address,
        counterparty_wallet: counterpartyAccount.address,
        escrow_id: 'escrow-stage-script',
        decision: 'approve',
        recommendation: 'release',
        approved: true,
        confidence: 90,
        agent_score_provider: 86,
        score_model_version: '2.0.0',
        certification_valid: true,
        certification_tier: 'Transactional',
        risk_level: 'clear',
        risk_score: 6,
        forensic_trace_id: 'trace_stage_fixture1234',
        packet_hash: '0x' + '8'.repeat(64),
        generated_at: '2026-03-16T00:00:00.000Z',
      },
      {
        chainId: CHAIN_ID,
      },
    )

    const verdict = attestation.typed_data.message
    const proofCalldata = encodeEvaluatorVerdictVerification({
      verdict,
      signature: attestation.signature as `0x${string}`,
    })
    const escrowCalldata = encodeEvaluatorEscrowSettlement({
      verdict,
      signature: attestation.signature as `0x${string}`,
    })

    const originalFetch = globalThis.fetch
    // @ts-expect-error test fetch stub
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.hostname === '127.0.0.1') {
        return await originalFetch(input, init)
      }

      if (url.pathname === '/v1/score/evaluator/proof') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            standard: 'djd-evaluator-verifier-proof-v1',
            ready: true,
            reason: null,
            verdict_id: bundle.verdict_id,
            verifier: {
              contract: 'DJDEvaluatorVerdictVerifier',
              function: 'verifyVerdict',
              selector: '0xdeadbeef',
              chain_id: CHAIN_ID,
            },
            attestation: {
              status: 'signed',
              signer: attestation.signer,
              digest: attestation.digest,
              signature: attestation.signature,
              scheme: 'eip712',
            },
            verdict,
            call: {
              selector: proofCalldata.slice(0, 10),
              calldata: proofCalldata,
              args: {
                verdict,
                signature: attestation.signature,
              },
            },
            transaction: {
              to: url.searchParams.get('target_contract'),
              data: proofCalldata,
              value: '0',
            },
          }),
        }
      }

      if (url.pathname === '/v1/score/evaluator/escrow') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            standard: 'djd-evaluator-escrow-settlement-v1',
            ready: true,
            reason: null,
            verdict_id: bundle.verdict_id,
            escrow: {
              contract: 'DJDEvaluatorEscrowSettlementExample',
              function: 'settleWithDJDVerdict',
              selector: '0xbeadfeed',
              chain_id: CHAIN_ID,
            },
            verifier: {
              contract: 'DJDEvaluatorVerdictVerifier',
              function: 'verifyVerdict',
            },
            attestation: {
              status: 'signed',
              signer: attestation.signer,
              digest: attestation.digest,
              signature: attestation.signature,
              scheme: 'eip712',
            },
            settlement: {
              recommendation: 'release',
              approved: true,
              outcome: 'release',
              release_authorized: true,
            },
            verdict,
            call: {
              selector: escrowCalldata.slice(0, 10),
              calldata: escrowCalldata,
              args: {
                verdict,
                signature: attestation.signature,
              },
            },
            transaction: {
              to: url.searchParams.get('escrow_contract'),
              data: escrowCalldata,
              value: '0',
            },
          }),
        }
      }

      throw new Error(`Unexpected fetch URL: ${url.toString()}`)
    }

    let report
    try {
      report = await runEvaluatorStackStage({
        bundle,
        deployerPrivateKey: DEPLOYER_KEY,
        runHealth: false,
        publishRegistry: true,
        promotionOutputPath,
        promotionDotenvPath,
        promotionShellPath,
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(report.standard).toBe('djd-evaluator-stage-report-v1')
    expect(report.ok).toBe(true)
    expect(report.steps.preflight.ok).toBe(true)
    expect(report.steps.preflight.result.rpc.source).toBe('DJD_BASE_RPC_URL')
    expect(report.steps.deploy.ok).toBe(true)
    expect(report.steps.verify.ok).toBe(true)
    expect(report.steps.smoke.ok).toBe(true)
    expect(report.steps.health.skipped).toBe(true)
    expect(report.steps.publish.ok).toBe(true)
    expect(report.steps.publish.result.registry_summary.deployment_count).toBe(1)
    expect(report.steps.promote.ok).toBe(true)
    expect(report.steps.promote.result.deployment.source.kind).toBe('registry_file')
    expect(report.steps.promote.result.files.json).toBe(promotionOutputPath)
    expect(report.steps.promote.result.files.dotenv).toBe(promotionDotenvPath)
    expect(report.steps.promote.result.files.shell).toBe(promotionShellPath)
    expect(report.steps.promote.result.outputs.variables.DJD_VERIFIER_CONTRACT).toBe(
      report.steps.deploy.result.contracts.verifier.address,
    )

    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      deployments: Record<string, { verdict_id?: string; checks?: { smoked?: boolean } }>
    }
    const promotionOutput = JSON.parse(readFileSync(promotionOutputPath, 'utf8')) as {
      outputs?: { variables?: Record<string, string> }
    }
    const promotionDotenv = readFileSync(promotionDotenvPath, 'utf8')
    const promotionShell = readFileSync(promotionShellPath, 'utf8')

    expect(registry.deployments.base.verdict_id).toBe(bundle.verdict_id)
    expect(registry.deployments.base.checks?.smoked).toBe(true)
    expect(promotionOutput.outputs?.variables?.DJD_NETWORK).toBe('base')
    expect(promotionDotenv).toContain(`DJD_VERIFIER_CONTRACT=${report.steps.deploy.result.contracts.verifier.address}`)
    expect(promotionShell).toContain(
      `export DJD_BASE_ESCROW_CONTRACT='${report.steps.deploy.result.contracts.escrow.address}'`,
    )

    const onchainSigner = await publicClient.readContract({
      address: report.steps.deploy.result.contracts.verifier.address as `0x${string}`,
      abi: verifierArtifact?.abi as any,
      functionName: 'oracleSigner',
    })
    expect(onchainSigner).toBe(oracleAccount.address)
  })
})
