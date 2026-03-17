import { mkdtempSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseEther, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { buildEscrowIdHash } from '../src/contracts/djdEvaluatorOracleCallback.js'
import { getEvaluatorArtifactPackageView } from '../src/services/contractArtifactService.js'
import { deployEvaluatorStackFromBundle } from '../scripts/deploy-evaluator-stack.mjs'
import { verifyEvaluatorStackDeployment } from '../scripts/verify-evaluator-stack.mjs'
import ganache from './helpers/ganache.js'

const CHAIN_ID = 8453
const DEPLOYER_KEY = '0x7100000000000000000000000000000000000000000000000000000000000001' as const
const PROVIDER_KEY = '0x7200000000000000000000000000000000000000000000000000000000000002' as const
const COUNTERPARTY_KEY = '0x7300000000000000000000000000000000000000000000000000000000000003' as const
const ORACLE_KEY = '0x7400000000000000000000000000000000000000000000000000000000000004' as const

const providerAccount = privateKeyToAccount(PROVIDER_KEY)
const counterpartyAccount = privateKeyToAccount(COUNTERPARTY_KEY)
const oracleAccount = privateKeyToAccount(ORACLE_KEY)

function fundedAccount(secretKey: `0x${string}`) {
  return {
    secretKey,
    balance: toHex(parseEther('1000')),
  }
}

describe('verify evaluator stack script', () => {
  const artifactPackage = getEvaluatorArtifactPackageView()
  const verifierArtifact = artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorVerdictVerifier')
  const escrowArtifact = artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorEscrowSettlementExample')
  const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-verify-script-'))

  let server: Awaited<ReturnType<typeof ganache.server>>
  let rpcUrl: string

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
  })

  afterAll(async () => {
    server.provider.disconnect()
    await server.close()
  }, 30000)

  it('audits a deployed verifier and escrow stack against the bundle and saved result', async () => {
    const bundle = {
      standard: 'djd-evaluator-deploy-bundle-v1' as const,
      network: {
        chain_id: CHAIN_ID,
        chain_name: 'Base',
      },
      verdict_id: 'verdict_verify_script_fixture',
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
            escrow_id: 'escrow-verify-script',
            escrow_id_hash: buildEscrowIdHash('escrow-verify-script'),
          },
          deployment_ready: true,
          reason: null,
        },
      },
      links: {
        verifier_package: 'https://example.test/v1/score/evaluator/verifier',
        verifier_proof: 'https://example.test/v1/score/evaluator/proof?id=verdict_verify_script_fixture',
        escrow_settlement: 'https://example.test/v1/score/evaluator/escrow?id=verdict_verify_script_fixture',
        artifact_package: 'https://example.test/v1/score/evaluator/artifacts',
        bundle: 'https://example.test/v1/score/evaluator/deploy/bundle?id=verdict_verify_script_fixture',
      },
      notes: ['fixture'],
    }

    const deploymentResult = await deployEvaluatorStackFromBundle({
      bundle,
      rpcUrl,
      deployerPrivateKey: DEPLOYER_KEY,
    })

    const deploymentPath = join(fixtureDir, 'deploy-result.json')
    const bundlePath = join(fixtureDir, 'deploy-bundle.json')
    await writeFile(deploymentPath, JSON.stringify(deploymentResult, null, 2) + '\n')
    await writeFile(bundlePath, JSON.stringify(bundle, null, 2) + '\n')

    const report = await verifyEvaluatorStackDeployment({
      rpcUrl,
      deploymentResult,
      bundle,
    })

    expect(report.standard).toBe('djd-evaluator-deploy-verification-v1')
    expect(report.ok).toBe(true)
    expect(report.failed_checks).toEqual([])
    expect(report.checks.oracle_signer_matches).toBe(true)
    expect(report.checks.escrow_verifier_matches).toBe(true)
    expect(report.bundle_checks?.verifier_constructor_matches).toBe(true)
    expect(report.bundle_checks?.escrow_constructor_matches).toBe(true)
    expect(report.onchain.settled).toBe(false)
    expect(report.links.bundle).toBe(bundle.links.bundle)

    const reportFromFiles = await verifyEvaluatorStackDeployment({
      rpcUrl,
      deploymentResultPath: deploymentPath,
      bundlePath,
    })

    expect(reportFromFiles.ok).toBe(true)
    expect(reportFromFiles.links.bundle).toBe(bundle.links.bundle)
    expect(JSON.parse(readFileSync(deploymentPath, 'utf8')).standard).toBe('djd-evaluator-deploy-result-v1')
  })

  it('resolves the active deployment from a published registry file when no deploy result path is provided', async () => {
    const bundle = {
      standard: 'djd-evaluator-deploy-bundle-v1' as const,
      network: {
        key: 'base',
        chain_id: CHAIN_ID,
        chain_name: 'Base',
        caip2: 'eip155:8453',
        environment: 'mainnet',
      },
      verdict_id: 'verdict_verify_registry_fixture',
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
            escrow_id: 'escrow-verify-registry',
            escrow_id_hash: buildEscrowIdHash('escrow-verify-registry'),
          },
          deployment_ready: true,
          reason: null,
        },
      },
      links: {
        verifier_package: 'https://example.test/v1/score/evaluator/verifier?network=base',
        verifier_proof: 'https://example.test/v1/score/evaluator/proof?id=verdict_verify_registry_fixture&network=base',
        escrow_settlement:
          'https://example.test/v1/score/evaluator/escrow?id=verdict_verify_registry_fixture&network=base',
        artifact_package: 'https://example.test/v1/score/evaluator/artifacts',
        bundle:
          'https://example.test/v1/score/evaluator/deploy/bundle?id=verdict_verify_registry_fixture&network=base',
      },
      notes: ['fixture'],
    }

    const deploymentResult = await deployEvaluatorStackFromBundle({
      bundle,
      rpcUrl,
      deployerPrivateKey: DEPLOYER_KEY,
    })

    const registryPath = join(fixtureDir, 'deployments-registry.json')
    await writeFile(
      registryPath,
      JSON.stringify(
        {
          standard: 'djd-evaluator-deployment-registry-v1',
          updated_at: '2026-03-16T06:00:00.000Z',
          deployments: {
            base: {
              published_at: '2026-03-16T06:00:00.000Z',
              network: deploymentResult.network,
              verdict_id: deploymentResult.verdict_id,
              deployer: deploymentResult.deployer,
              contracts: deploymentResult.contracts,
              verification: deploymentResult.verification,
              inputs: deploymentResult.inputs,
              explorer: deploymentResult.explorer,
              links: deploymentResult.links,
              checks: {
                preflight: true,
                verified: true,
                smoked: true,
                health: null,
                staged: true,
              },
            },
          },
        },
        null,
        2,
      ) + '\n',
    )

    const report = await verifyEvaluatorStackDeployment({
      rpcUrl,
      bundle,
      registryPath,
      network: 'base',
    })

    expect(report.ok).toBe(true)
    expect(report.deployment.kind).toBe('registry_file')
    expect(report.deployment.location).toBe(registryPath)
    expect(report.links.bundle).toBe(bundle.links.bundle)
  })

  it('resolves the active deployment from the API promotion bundle when available', async () => {
    const bundle = {
      standard: 'djd-evaluator-deploy-bundle-v1' as const,
      network: {
        key: 'base',
        chain_id: CHAIN_ID,
        chain_name: 'Base',
        caip2: 'eip155:8453',
        environment: 'mainnet',
      },
      verdict_id: 'verdict_verify_promotion_fixture',
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
            escrow_id: 'escrow-verify-promotion',
            escrow_id_hash: buildEscrowIdHash('escrow-verify-promotion'),
          },
          deployment_ready: true,
          reason: null,
        },
      },
      links: {
        verifier_package: 'https://api.example.test/v1/score/evaluator/verifier?network=base',
        verifier_proof:
          'https://api.example.test/v1/score/evaluator/proof?id=verdict_verify_promotion_fixture&network=base',
        escrow_settlement:
          'https://api.example.test/v1/score/evaluator/escrow?id=verdict_verify_promotion_fixture&network=base',
        artifact_package: 'https://api.example.test/v1/score/evaluator/artifacts',
        bundle:
          'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_verify_promotion_fixture&network=base',
      },
      notes: ['fixture'],
    }

    const deploymentResult = await deployEvaluatorStackFromBundle({
      bundle,
      rpcUrl,
      deployerPrivateKey: DEPLOYER_KEY,
    })

    const originalFetch = globalThis.fetch
    // @ts-expect-error test fetch stub
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.hostname === '127.0.0.1') {
        return await originalFetch(input, init)
      }

      if (url.toString() === 'https://api.example.test/v1/score/evaluator/promotion?network=base') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            standard: 'djd-evaluator-promotion-bundle-v1',
            ready: true,
            reason: null,
            source: 'published_registry',
            registry: {
              available: true,
              updated_at: '2026-03-17T01:00:00.000Z',
              error: null,
            },
            network: {
              key: 'base',
              chain_id: CHAIN_ID,
              chain_name: 'Base',
              caip2: 'eip155:8453',
              environment: 'mainnet',
              rpc_env_var: 'DJD_BASE_RPC_URL',
              explorer: {
                name: 'Basescan',
                base_url: 'https://basescan.org',
              },
            },
            deployment: {
              published_at: '2026-03-17T01:00:00.000Z',
              network: deploymentResult.network,
              verdict_id: deploymentResult.verdict_id,
              deployer: deploymentResult.deployer,
              contracts: deploymentResult.contracts,
              verification: deploymentResult.verification,
              inputs: deploymentResult.inputs,
              checks: {
                preflight: true,
                verified: true,
                smoked: true,
                health: true,
                staged: true,
              },
              explorer: deploymentResult.explorer,
              links: {
                verifier_package: bundle.links.verifier_package,
                deployment_registry: 'https://api.example.test/v1/score/evaluator/deployments?network=base',
                verifier_proof: bundle.links.verifier_proof,
                escrow_settlement: bundle.links.escrow_settlement,
                deploy_bundle: bundle.links.bundle,
              },
            },
            outputs: {
              variables: {
                DJD_NETWORK: 'base',
                DJD_VERIFIER_CONTRACT: deploymentResult.contracts.verifier.address,
                DJD_ESCROW_CONTRACT: deploymentResult.contracts.escrow.address,
                DJD_ARTIFACT_PACKAGE_URL: bundle.links.artifact_package,
              },
              generic: {
                DJD_NETWORK: 'base',
                DJD_VERIFIER_CONTRACT: deploymentResult.contracts.verifier.address,
                DJD_ARTIFACT_PACKAGE_URL: bundle.links.artifact_package,
              },
              network_scoped: {
                DJD_BASE_VERIFIER_CONTRACT: deploymentResult.contracts.verifier.address,
              },
              dotenv: 'DJD_NETWORK=base',
              shell: `export DJD_VERIFIER_CONTRACT='${deploymentResult.contracts.verifier.address}'`,
              github_output: `DJD_VERIFIER_CONTRACT=${deploymentResult.contracts.verifier.address}`,
            },
          }),
        }
      }

      if (url.toString() === bundle.links.bundle) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => bundle,
        }
      }

      throw new Error(`Unexpected fetch URL: ${url.toString()}`)
    }

    let report
    try {
      report = await verifyEvaluatorStackDeployment({
        rpcUrl,
        apiBaseUrl: 'https://api.example.test',
        network: 'base',
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(report.ok).toBe(true)
    expect(report.deployment.kind).toBe('api_promotion_bundle')
    expect(report.deployment.location).toBe('https://api.example.test/v1/score/evaluator/promotion?network=base')
    expect(report.links.bundle).toBe(bundle.links.bundle)
  })
})
