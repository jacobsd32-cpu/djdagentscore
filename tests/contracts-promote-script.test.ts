import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { promoteEvaluatorStackDeployment } from '../scripts/promote-evaluator-stack.mjs'

const ORIGINAL_API_BASE_URL = process.env.DJD_API_BASE_URL
const ORIGINAL_PROMOTION_URL = process.env.DJD_PROMOTION_URL

afterEach(() => {
  if (ORIGINAL_API_BASE_URL === undefined) {
    delete process.env.DJD_API_BASE_URL
  } else {
    process.env.DJD_API_BASE_URL = ORIGINAL_API_BASE_URL
  }

  if (ORIGINAL_PROMOTION_URL === undefined) {
    delete process.env.DJD_PROMOTION_URL
  } else {
    process.env.DJD_PROMOTION_URL = ORIGINAL_PROMOTION_URL
  }
})

describe('promote evaluator stack script', () => {
  it('emits env-ready outputs from a local published registry entry', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-promote-script-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')
    const outputPath = join(fixtureDir, 'promotion.json')
    const dotenvPath = join(fixtureDir, 'promotion.env')
    const shellPath = join(fixtureDir, 'promotion.sh')
    const githubOutputPath = join(fixtureDir, 'github-output.txt')

    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          standard: 'djd-evaluator-deployment-registry-v1',
          updated_at: '2026-03-16T10:00:00.000Z',
          deployments: {
            'base-sepolia': {
              published_at: '2026-03-16T10:00:00.000Z',
              network: {
                key: 'base-sepolia',
                chain_id: 84532,
                chain_name: 'Base Sepolia',
                caip2: 'eip155:84532',
                environment: 'testnet',
              },
              verdict_id: 'verdict_promote_registry_1',
              deployer: '0x1111111111111111111111111111111111111111',
              contracts: {
                verifier: {
                  contract: 'DJDEvaluatorVerdictVerifier',
                  address: '0x2222222222222222222222222222222222222222',
                  tx_hash: '0x' + '2'.repeat(64),
                  action: 'deploy',
                },
                escrow: {
                  contract: 'DJDEvaluatorEscrowSettlementExample',
                  address: '0x3333333333333333333333333333333333333333',
                  tx_hash: '0x' + '3'.repeat(64),
                  action: 'deploy',
                },
              },
              verification: {
                oracle_signer: '0x4444444444444444444444444444444444444444',
                escrow_verifier: '0x2222222222222222222222222222222222222222',
                escrow_provider: '0x5555555555555555555555555555555555555555',
                escrow_counterparty: '0x6666666666666666666666666666666666666666',
                escrow_id_hash: '0x' + '7'.repeat(64),
              },
              inputs: {
                network_key: 'base-sepolia',
                provider: '0x5555555555555555555555555555555555555555',
                counterparty: '0x6666666666666666666666666666666666666666',
                escrow_id: 'escrow-promote-1',
              },
              explorer: {
                verifier_address: 'https://sepolia.basescan.org/address/0x2222222222222222222222222222222222222222',
                verifier_transaction: `https://sepolia.basescan.org/tx/${'0x' + '2'.repeat(64)}`,
                escrow_address: 'https://sepolia.basescan.org/address/0x3333333333333333333333333333333333333333',
                escrow_transaction: `https://sepolia.basescan.org/tx/${'0x' + '3'.repeat(64)}`,
              },
              links: {
                verifier_package: 'https://api.example.test/v1/score/evaluator/verifier?network=base-sepolia',
                verifier_proof:
                  'https://api.example.test/v1/score/evaluator/proof?id=verdict_promote_registry_1&network=base-sepolia',
                escrow_settlement:
                  'https://api.example.test/v1/score/evaluator/escrow?id=verdict_promote_registry_1&network=base-sepolia',
                bundle:
                  'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_promote_registry_1&network=base-sepolia',
              },
              checks: {
                preflight: true,
                verified: true,
                smoked: true,
                health: true,
                staged: true,
              },
            },
          },
        },
        null,
        2,
      ) + '\n',
    )

    const result = await promoteEvaluatorStackDeployment({
      registryPath,
      network: 'base-sepolia',
      apiBaseUrl: 'https://api.example.test',
      outputPath,
      dotenvPath,
      shellPath,
      githubOutputPath,
    })

    expect(result.standard).toBe('djd-evaluator-promotion-env-v1')
    expect(result.ok).toBe(true)
    expect(result.deployment.source.kind).toBe('registry_file')
    expect(result.outputs.variables.DJD_NETWORK).toBe('base-sepolia')
    expect(result.outputs.variables.DJD_VERIFIER_CONTRACT).toBe('0x2222222222222222222222222222222222222222')
    expect(result.outputs.variables.DJD_DEPLOYMENTS_URL).toBe(
      'https://api.example.test/v1/score/evaluator/deployments?network=base-sepolia',
    )
    expect(result.outputs.variables.DJD_BASE_SEPOLIA_VERIFIER_CONTRACT).toBe(
      '0x2222222222222222222222222222222222222222',
    )
    expect(result.outputs.variables.DJD_BASE_SEPOLIA_DEPLOY_BUNDLE_URL).toBe(
      'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_promote_registry_1&network=base-sepolia',
    )

    const jsonOutput = JSON.parse(readFileSync(outputPath, 'utf8')) as {
      files?: { dotenv?: string; shell?: string; github_output?: string }
    }
    const dotenvOutput = readFileSync(dotenvPath, 'utf8')
    const shellOutput = readFileSync(shellPath, 'utf8')
    const githubOutput = readFileSync(githubOutputPath, 'utf8')

    expect(jsonOutput.files?.dotenv).toBe(dotenvPath)
    expect(jsonOutput.files?.shell).toBe(shellPath)
    expect(jsonOutput.files?.github_output).toBe(githubOutputPath)
    expect(dotenvOutput).toContain('DJD_NETWORK=base-sepolia')
    expect(dotenvOutput).toContain(
      'DJD_DEPLOY_BUNDLE_URL="https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_promote_registry_1&network=base-sepolia"',
    )
    expect(shellOutput).toContain(
      "export DJD_BASE_SEPOLIA_ESCROW_CONTRACT='0x3333333333333333333333333333333333333333'",
    )
    expect(githubOutput).toContain('DJD_ESCROW_ID=escrow-promote-1')
  })

  it('resolves the active deployment from the API registry and infers the API base from deployment links', async () => {
    const deploymentsUrl = 'https://registry.example.test/v1/score/evaluator/deployments?network=base'
    const originalFetch = globalThis.fetch

    // @ts-expect-error test fetch stub
    globalThis.fetch = async (input) => {
      const url = new URL(String(input))
      expect(url.toString()).toBe(deploymentsUrl)

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          standard: 'djd-evaluator-deployments-v1',
          registry: {
            available: true,
            updated_at: '2026-03-16T11:00:00.000Z',
            deployment_count: 1,
            error: null,
          },
          filter: {
            network: 'base',
          },
          networks: [
            {
              key: 'base',
              chain_id: 8453,
              chain_name: 'Base',
              caip2: 'eip155:8453',
              environment: 'mainnet',
              explorer: {
                name: 'Basescan',
                base_url: 'https://basescan.org',
              },
              rpc_env_var: 'DJD_BASE_RPC_URL',
              deployed: true,
              deployment: {
                published_at: '2026-03-16T11:00:00.000Z',
                network: {
                  key: 'base',
                  chain_id: 8453,
                  chain_name: 'Base',
                  caip2: 'eip155:8453',
                  environment: 'mainnet',
                },
                verdict_id: 'verdict_promote_api_1',
                deployer: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                contracts: {
                  verifier: {
                    contract: 'DJDEvaluatorVerdictVerifier',
                    address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    tx_hash: '0x' + 'b'.repeat(64),
                    action: 'deploy',
                  },
                  escrow: {
                    contract: 'DJDEvaluatorEscrowSettlementExample',
                    address: '0xcccccccccccccccccccccccccccccccccccccccc',
                    tx_hash: '0x' + 'c'.repeat(64),
                    action: 'deploy',
                  },
                },
                verification: {
                  oracle_signer: '0xdddddddddddddddddddddddddddddddddddddddd',
                  escrow_verifier: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                  escrow_provider: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                  escrow_counterparty: '0xffffffffffffffffffffffffffffffffffffffff',
                  escrow_id_hash: '0x' + 'd'.repeat(64),
                },
                inputs: {
                  provider: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                  counterparty: '0xffffffffffffffffffffffffffffffffffffffff',
                  escrow_id: 'escrow-promote-api',
                },
                checks: {
                  preflight: true,
                  verified: true,
                  smoked: true,
                  health: null,
                  staged: true,
                },
                explorer: null,
                links: {
                  verifier_package: 'https://api.example.test/v1/score/evaluator/verifier?network=base',
                  verifier_proof:
                    'https://api.example.test/v1/score/evaluator/proof?id=verdict_promote_api_1&network=base',
                  escrow_settlement:
                    'https://api.example.test/v1/score/evaluator/escrow?id=verdict_promote_api_1&network=base',
                  deploy_bundle:
                    'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_promote_api_1&network=base',
                },
              },
            },
          ],
        }),
      }
    }

    let result: Awaited<ReturnType<typeof promoteEvaluatorStackDeployment>>
    try {
      result = await promoteEvaluatorStackDeployment({
        deploymentsUrl,
        network: 'base',
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(result.deployment.source.kind).toBe('api_registry')
    expect(result.outputs.variables.DJD_DEPLOYMENT_SOURCE_LOCATION).toBe(deploymentsUrl)
    expect(result.outputs.variables.DJD_API_BASE_URL).toBe('https://api.example.test')
    expect(result.outputs.variables.DJD_DEPLOYMENTS_URL).toBe(deploymentsUrl)
    expect(result.outputs.variables.DJD_BASE_VERIFIER_PROOF_URL).toBe(
      'https://api.example.test/v1/score/evaluator/proof?id=verdict_promote_api_1&network=base',
    )
    expect(result.outputs.shell).toContain(
      "export DJD_BASE_ESCROW_CONTRACT='0xcccccccccccccccccccccccccccccccccccccccc'",
    )
  })

  it('prefers the API promotion bundle when it is available', async () => {
    const originalFetch = globalThis.fetch

    process.env.DJD_API_BASE_URL = 'https://api.example.test'

    // @ts-expect-error test fetch stub
    globalThis.fetch = async (input) => {
      const url = new URL(String(input))
      expect(url.toString()).toBe('https://api.example.test/v1/score/evaluator/promotion?network=base-sepolia')

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
            updated_at: '2026-03-16T12:00:00.000Z',
            error: null,
          },
          network: {
            key: 'base-sepolia',
            chain_id: 84532,
            chain_name: 'Base Sepolia',
            caip2: 'eip155:84532',
            environment: 'testnet',
            rpc_env_var: 'DJD_BASE_SEPOLIA_RPC_URL',
            explorer: {
              name: 'Basescan',
              base_url: 'https://sepolia.basescan.org',
            },
          },
          deployment: {
            published_at: '2026-03-16T12:00:00.000Z',
            verdict_id: 'verdict_promote_bundle_1',
            deployer: '0x1111111111111111111111111111111111111111',
            contracts: {
              verifier: {
                contract: 'DJDEvaluatorVerdictVerifier',
                address: '0x2222222222222222222222222222222222222222',
                tx_hash: '0x' + '2'.repeat(64),
                action: 'deploy',
              },
              escrow: {
                contract: 'DJDEvaluatorEscrowSettlementExample',
                address: '0x3333333333333333333333333333333333333333',
                tx_hash: '0x' + '3'.repeat(64),
                action: 'deploy',
              },
            },
            verification: {
              oracle_signer: '0x4444444444444444444444444444444444444444',
              escrow_verifier: '0x2222222222222222222222222222222222222222',
              escrow_provider: '0x5555555555555555555555555555555555555555',
              escrow_counterparty: '0x6666666666666666666666666666666666666666',
              escrow_id_hash: '0x' + '7'.repeat(64),
            },
            inputs: {
              provider: '0x5555555555555555555555555555555555555555',
              counterparty: '0x6666666666666666666666666666666666666666',
              escrow_id: 'escrow-promote-bundle',
            },
            checks: {
              preflight: true,
              verified: true,
              smoked: true,
              health: true,
              staged: true,
            },
            explorer: null,
            links: {
              verifier_package: 'https://api.example.test/v1/score/evaluator/verifier?network=base-sepolia',
              deployment_registry: 'https://api.example.test/v1/score/evaluator/deployments?network=base-sepolia',
              verifier_proof:
                'https://api.example.test/v1/score/evaluator/proof?id=verdict_promote_bundle_1&network=base-sepolia',
              escrow_settlement:
                'https://api.example.test/v1/score/evaluator/escrow?id=verdict_promote_bundle_1&network=base-sepolia',
              deploy_bundle:
                'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_promote_bundle_1&network=base-sepolia',
            },
          },
          outputs: {
            variables: {
              DJD_NETWORK: 'base-sepolia',
              DJD_CHAIN_ID: '84532',
              DJD_VERIFIER_CONTRACT: '0x2222222222222222222222222222222222222222',
              DJD_BASE_SEPOLIA_VERIFIER_CONTRACT: '0x2222222222222222222222222222222222222222',
            },
            generic: {
              DJD_NETWORK: 'base-sepolia',
              DJD_CHAIN_ID: '84532',
              DJD_VERIFIER_CONTRACT: '0x2222222222222222222222222222222222222222',
            },
            network_scoped: {
              DJD_BASE_SEPOLIA_VERIFIER_CONTRACT: '0x2222222222222222222222222222222222222222',
            },
            dotenv: 'DJD_NETWORK=base-sepolia',
            shell: "export DJD_VERIFIER_CONTRACT='0x2222222222222222222222222222222222222222'",
            github_output: 'DJD_VERIFIER_CONTRACT=0x2222222222222222222222222222222222222222',
          },
        }),
      }
    }

    let result: Awaited<ReturnType<typeof promoteEvaluatorStackDeployment>>
    try {
      result = await promoteEvaluatorStackDeployment({
        network: 'base-sepolia',
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(result.deployment.source.kind).toBe('api_promotion_bundle')
    expect(result.deployment.source.location).toBe(
      'https://api.example.test/v1/score/evaluator/promotion?network=base-sepolia',
    )
    expect(result.outputs.variables.DJD_NETWORK).toBe('base-sepolia')
    expect(result.outputs.variables.DJD_BASE_SEPOLIA_VERIFIER_CONTRACT).toBe(
      '0x2222222222222222222222222222222222222222',
    )
    expect(result.outputs.dotenv.endsWith('\n')).toBe(true)
    expect(result.outputs.shell.endsWith('\n')).toBe(true)
    expect(result.outputs.github_output.endsWith('\n')).toBe(true)
  })

  it('falls back to the local registry when the API promotion bundle is not ready', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-promote-fallback-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')
    const originalFetch = globalThis.fetch

    process.env.DJD_API_BASE_URL = 'https://api.example.test'

    writeFileSync(
      registryPath,
      JSON.stringify(
        {
          standard: 'djd-evaluator-deployment-registry-v1',
          updated_at: '2026-03-16T13:00:00.000Z',
          deployments: {
            'base-sepolia': {
              published_at: '2026-03-16T13:00:00.000Z',
              network: {
                key: 'base-sepolia',
                chain_id: 84532,
                chain_name: 'Base Sepolia',
                caip2: 'eip155:84532',
                environment: 'testnet',
              },
              verdict_id: 'verdict_promote_fallback_1',
              deployer: '0x1111111111111111111111111111111111111111',
              contracts: {
                verifier: {
                  contract: 'DJDEvaluatorVerdictVerifier',
                  address: '0x2222222222222222222222222222222222222222',
                  tx_hash: '0x' + '2'.repeat(64),
                  action: 'deploy',
                },
                escrow: {
                  contract: 'DJDEvaluatorEscrowSettlementExample',
                  address: '0x3333333333333333333333333333333333333333',
                  tx_hash: '0x' + '3'.repeat(64),
                  action: 'deploy',
                },
              },
              verification: {
                oracle_signer: '0x4444444444444444444444444444444444444444',
                escrow_verifier: '0x2222222222222222222222222222222222222222',
                escrow_provider: '0x5555555555555555555555555555555555555555',
                escrow_counterparty: '0x6666666666666666666666666666666666666666',
                escrow_id_hash: '0x' + '7'.repeat(64),
              },
              inputs: {
                network_key: 'base-sepolia',
                provider: '0x5555555555555555555555555555555555555555',
                counterparty: '0x6666666666666666666666666666666666666666',
                escrow_id: 'escrow-promote-fallback',
              },
              explorer: null,
              links: {
                verifier_package: 'https://api.example.test/v1/score/evaluator/verifier?network=base-sepolia',
              },
              checks: {
                preflight: true,
                verified: true,
                smoked: true,
                health: true,
                staged: true,
              },
            },
          },
        },
        null,
        2,
      ) + '\n',
    )

    // @ts-expect-error test fetch stub
    globalThis.fetch = async (input) => {
      const url = new URL(String(input))
      expect(url.toString()).toBe('https://api.example.test/v1/score/evaluator/promotion?network=base-sepolia')

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          standard: 'djd-evaluator-promotion-bundle-v1',
          ready: false,
          reason: 'deployment_not_published',
          source: 'published_registry',
          registry: {
            available: true,
            updated_at: '2026-03-16T13:00:00.000Z',
            error: null,
          },
          network: {
            key: 'base-sepolia',
            chain_id: 84532,
            chain_name: 'Base Sepolia',
            caip2: 'eip155:84532',
            environment: 'testnet',
            rpc_env_var: 'DJD_BASE_SEPOLIA_RPC_URL',
            explorer: {
              name: 'Basescan',
              base_url: 'https://sepolia.basescan.org',
            },
          },
          deployment: null,
          outputs: null,
        }),
      }
    }

    let result: Awaited<ReturnType<typeof promoteEvaluatorStackDeployment>>
    try {
      result = await promoteEvaluatorStackDeployment({
        network: 'base-sepolia',
        registryPath,
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(result.deployment.source.kind).toBe('registry_file')
    expect(result.outputs.variables.DJD_VERIFIER_CONTRACT).toBe('0x2222222222222222222222222222222222222222')
    expect(result.outputs.variables.DJD_DEPLOYMENTS_URL).toBe(
      'https://api.example.test/v1/score/evaluator/deployments?network=base-sepolia',
    )
  })
})
