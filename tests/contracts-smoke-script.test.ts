import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createPublicClient, http, parseEther, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { encodeEvaluatorEscrowSettlement } from '../src/contracts/djdEvaluatorEscrowSettlementExample.js'
import { buildEscrowIdHash } from '../src/contracts/djdEvaluatorOracleCallback.js'
import { encodeEvaluatorVerdictVerification } from '../src/contracts/djdEvaluatorVerdictVerifier.js'
import { buildEvaluatorVerdictAttestation } from '../src/services/evaluatorAttestationService.js'
import { getEvaluatorArtifactPackageView } from '../src/services/contractArtifactService.js'
import { deployEvaluatorStackFromBundle } from '../scripts/deploy-evaluator-stack.mjs'
import { runEvaluatorStackSmoke } from '../scripts/smoke-evaluator-stack.mjs'
import ganache from './helpers/ganache.js'

const CHAIN_ID = 8453
const DEPLOYER_KEY = '0x8100000000000000000000000000000000000000000000000000000000000001' as const
const PROVIDER_KEY = '0x8200000000000000000000000000000000000000000000000000000000000002' as const
const COUNTERPARTY_KEY = '0x8300000000000000000000000000000000000000000000000000000000000003' as const
const ORACLE_KEY = '0x8400000000000000000000000000000000000000000000000000000000000004' as const

const deployerAccount = privateKeyToAccount(DEPLOYER_KEY)
const providerAccount = privateKeyToAccount(PROVIDER_KEY)
const counterpartyAccount = privateKeyToAccount(COUNTERPARTY_KEY)
const oracleAccount = privateKeyToAccount(ORACLE_KEY)
const ORIGINAL_ORACLE_KEY = process.env.ORACLE_SIGNER_PRIVATE_KEY

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

describe('evaluator stack smoke script', () => {
  const artifactPackage = getEvaluatorArtifactPackageView()
  const verifierArtifact = artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorVerdictVerifier')
  const escrowArtifact = artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorEscrowSettlementExample')

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
  })

  afterAll(async () => {
    server.provider.disconnect()
    await server.close()
  }, 30000)

  it('verifies a stored verdict against deployed verifier and escrow contracts using free proof surfaces', async () => {
    process.env.ORACLE_SIGNER_PRIVATE_KEY = ORACLE_KEY

    const bundle = {
      standard: 'djd-evaluator-deploy-bundle-v1' as const,
      network: {
        key: 'base',
        chain_id: CHAIN_ID,
        chain_name: 'Base',
        caip2: 'eip155:8453',
        environment: 'mainnet',
      },
      verdict_id: 'verdict_smoke_fixture',
      artifacts: {
        available: true,
        compiler: artifactPackage.compiler,
        verifier: verifierArtifact ?? null,
        escrow: escrowArtifact ?? null,
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
            escrow_id: 'escrow-smoke-script',
            escrow_id_hash: buildEscrowIdHash('escrow-smoke-script'),
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
        bundle: 'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_smoke_fixture&network=base',
      },
      notes: ['fixture'],
    }

    const deploymentResult = await deployEvaluatorStackFromBundle({
      bundle,
      rpcUrl,
      deployerPrivateKey: DEPLOYER_KEY,
    })

    const attestation = await buildEvaluatorVerdictAttestation(
      {
        verdict_id: bundle.verdict_id,
        wallet: providerAccount.address,
        counterparty_wallet: counterpartyAccount.address,
        escrow_id: 'escrow-smoke-script',
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
        forensic_trace_id: 'trace_smoke_fixture1234',
        packet_hash: '0x' + '9'.repeat(64),
        generated_at: '2026-03-15T11:00:00.000Z',
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
              to: deploymentResult.contracts.verifier.address,
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
              to: deploymentResult.contracts.escrow.address,
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
      report = await runEvaluatorStackSmoke({
        rpcUrl,
        deploymentResult,
        bundle,
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(report.standard).toBe('djd-evaluator-live-smoke-v1')
    expect(report.ok).toBe(true)
    expect(report.verifier.accepted).toBe(true)
    expect(report.verifier.digest_matches_attestation).toBe(true)
    expect(report.escrow.simulation_ok).toBe(true)
    expect(report.escrow.expected_outcome).toBe('release')

    const onchainAccepted = await publicClient.readContract({
      address: deploymentResult.contracts.verifier.address as `0x${string}`,
      abi: verifierArtifact?.abi as any,
      functionName: 'verifyVerdict',
      args: [verdict, attestation.signature],
    })
    expect(onchainAccepted).toBe(true)
  })

  it('resolves the active deployment from the published API registry and uses registry-backed proof routes', async () => {
    process.env.ORACLE_SIGNER_PRIVATE_KEY = ORACLE_KEY

    const bundle = {
      standard: 'djd-evaluator-deploy-bundle-v1' as const,
      network: {
        key: 'base',
        chain_id: CHAIN_ID,
        chain_name: 'Base',
        caip2: 'eip155:8453',
        environment: 'mainnet',
      },
      verdict_id: 'verdict_smoke_registry_fixture',
      artifacts: {
        available: true,
        compiler: artifactPackage.compiler,
        verifier: verifierArtifact ?? null,
        escrow: escrowArtifact ?? null,
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
            escrow_id: 'escrow-smoke-registry',
            escrow_id_hash: buildEscrowIdHash('escrow-smoke-registry'),
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
        bundle: 'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_smoke_registry_fixture&network=base',
      },
      notes: ['fixture'],
    }

    const deploymentResult = await deployEvaluatorStackFromBundle({
      bundle,
      rpcUrl,
      deployerPrivateKey: DEPLOYER_KEY,
    })

    const attestation = await buildEvaluatorVerdictAttestation(
      {
        verdict_id: bundle.verdict_id,
        wallet: providerAccount.address,
        counterparty_wallet: counterpartyAccount.address,
        escrow_id: 'escrow-smoke-registry',
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
        forensic_trace_id: 'trace_smoke_registry123',
        packet_hash: '0x' + 'a'.repeat(64),
        generated_at: '2026-03-15T12:00:00.000Z',
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

      if (url.pathname === '/v1/score/evaluator/deployments') {
        expect(url.searchParams.get('network')).toBe('base')
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            standard: 'djd-evaluator-deployments-v1',
            registry: {
              available: true,
              updated_at: '2026-03-16T07:00:00.000Z',
              deployment_count: 1,
              error: null,
            },
            filter: {
              network: 'base',
            },
            networks: [
              {
                key: 'base',
                chain_id: CHAIN_ID,
                chain_name: 'Base',
                caip2: 'eip155:8453',
                environment: 'mainnet',
                explorer: {
                  name: 'BaseScan',
                  base_url: 'https://basescan.org',
                },
                rpc_env_var: 'DJD_BASE_RPC_URL',
                deployed: true,
                deployment: {
                  published_at: '2026-03-16T07:00:00.000Z',
                  network: deploymentResult.network,
                  verdict_id: deploymentResult.verdict_id,
                  deployer: deploymentResult.deployer,
                  contracts: deploymentResult.contracts,
                  verification: deploymentResult.verification,
                  inputs: {
                    provider: deploymentResult.inputs.provider,
                    counterparty: deploymentResult.inputs.counterparty,
                    escrow_id: deploymentResult.inputs.escrow_id,
                  },
                  checks: {
                    preflight: true,
                    verified: true,
                    smoked: true,
                    health: null,
                    staged: true,
                  },
                  explorer: deploymentResult.explorer,
                  links: {
                    verifier_package: 'https://api.example.test/v1/score/evaluator/verifier?network=base',
                    deployment_registry: 'https://api.example.test/v1/score/evaluator/deployments?network=base',
                    verifier_proof: `https://api.example.test/v1/score/evaluator/proof?id=${bundle.verdict_id}&network=base`,
                    escrow_settlement: `https://api.example.test/v1/score/evaluator/escrow?id=${bundle.verdict_id}&network=base`,
                    deploy_bundle: bundle.links.bundle,
                  },
                },
              },
            ],
          }),
        }
      }

      if (url.pathname === '/v1/score/evaluator/proof') {
        expect(url.searchParams.get('target_contract')).toBe(null)
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
              to: deploymentResult.contracts.verifier.address,
              data: proofCalldata,
              value: '0',
            },
          }),
        }
      }

      if (url.pathname === '/v1/score/evaluator/escrow') {
        expect(url.searchParams.get('escrow_contract')).toBe(null)
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
              to: deploymentResult.contracts.escrow.address,
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
      report = await runEvaluatorStackSmoke({
        rpcUrl,
        bundle,
        network: 'base',
        apiBaseUrl: 'https://api.example.test',
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(report.ok).toBe(true)
    expect(report.deployment.source.kind).toBe('api_registry')
    expect(report.deployment.used_registry_address_resolution).toBe(true)
    expect(report.api.proof_url).not.toContain('target_contract=')
    expect(report.api.escrow_url).not.toContain('escrow_contract=')
  })
})
