import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { parseEther, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { buildEscrowIdHash } from '../src/contracts/djdEvaluatorOracleCallback.js'
import { getEvaluatorArtifactPackageView } from '../src/services/contractArtifactService.js'
import { runEvaluatorStackPreflight } from '../scripts/preflight-evaluator-stack.mjs'
import ganache from './helpers/ganache.js'

const CHAIN_ID = 84532
const DEPLOYER_KEY = '0xa100000000000000000000000000000000000000000000000000000000000001' as const
const PROVIDER_KEY = '0xa200000000000000000000000000000000000000000000000000000000000002' as const
const COUNTERPARTY_KEY = '0xa300000000000000000000000000000000000000000000000000000000000003' as const
const ORACLE_KEY = '0xa400000000000000000000000000000000000000000000000000000000000004' as const

const providerAccount = privateKeyToAccount(PROVIDER_KEY)
const counterpartyAccount = privateKeyToAccount(COUNTERPARTY_KEY)
const oracleAccount = privateKeyToAccount(ORACLE_KEY)
const ORIGINAL_BASE_SEPOLIA_RPC_URL = process.env.DJD_BASE_SEPOLIA_RPC_URL
const ORIGINAL_RPC_URL = process.env.DJD_RPC_URL
const ORIGINAL_DEPLOYER_KEY = process.env.DJD_DEPLOYER_PRIVATE_KEY

function fundedAccount(secretKey: `0x${string}`) {
  return {
    secretKey,
    balance: toHex(parseEther('1000')),
  }
}

describe('preflight evaluator stack script', () => {
  const artifactPackage = getEvaluatorArtifactPackageView()
  const verifierArtifact = artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorVerdictVerifier')
  const escrowArtifact = artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorEscrowSettlementExample')

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

  afterEach(() => {
    if (ORIGINAL_BASE_SEPOLIA_RPC_URL === undefined) {
      delete process.env.DJD_BASE_SEPOLIA_RPC_URL
    } else {
      process.env.DJD_BASE_SEPOLIA_RPC_URL = ORIGINAL_BASE_SEPOLIA_RPC_URL
    }

    if (ORIGINAL_RPC_URL === undefined) {
      delete process.env.DJD_RPC_URL
    } else {
      process.env.DJD_RPC_URL = ORIGINAL_RPC_URL
    }

    if (ORIGINAL_DEPLOYER_KEY === undefined) {
      delete process.env.DJD_DEPLOYER_PRIVATE_KEY
    } else {
      process.env.DJD_DEPLOYER_PRIVATE_KEY = ORIGINAL_DEPLOYER_KEY
    }
  })

  afterAll(async () => {
    server.provider.disconnect()
    await server.close()
  }, 30000)

  it('resolves bundle network metadata and network-specific RPC env vars before staging', async () => {
    process.env.DJD_BASE_SEPOLIA_RPC_URL = rpcUrl
    process.env.DJD_DEPLOYER_PRIVATE_KEY = DEPLOYER_KEY
    delete process.env.DJD_RPC_URL

    const report = await runEvaluatorStackPreflight({
      bundle: {
        standard: 'djd-evaluator-deploy-bundle-v1' as const,
        network: {
          key: 'base-sepolia',
          chain_id: CHAIN_ID,
          chain_name: 'Base Sepolia',
          caip2: 'eip155:84532',
          environment: 'testnet',
        },
        verdict_id: 'verdict_preflight_fixture',
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
              escrow_id: 'escrow-preflight-script',
              escrow_id_hash: buildEscrowIdHash('escrow-preflight-script'),
            },
            deployment_ready: true,
            reason: null,
          },
        },
        links: {
          verifier_package: 'https://api.example.test/v1/score/evaluator/verifier?network=base-sepolia',
          verifier_proof: 'https://api.example.test/v1/score/evaluator/proof',
          escrow_settlement: 'https://api.example.test/v1/score/evaluator/escrow',
          artifact_package: 'https://api.example.test/v1/score/evaluator/artifacts',
          bundle: 'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_preflight_fixture&network=base-sepolia',
        },
        notes: ['fixture'],
      },
    })

    expect(report.standard).toBe('djd-evaluator-preflight-v1')
    expect(report.ok).toBe(true)
    expect(report.network.key).toBe('base-sepolia')
    expect(report.bundle.ready).toBe(true)
    expect(report.bundle.validated).toBe(true)
    expect(report.rpc.source).toBe('DJD_BASE_SEPOLIA_RPC_URL')
    expect(report.rpc.reachable).toBe(true)
    expect(report.rpc.chain_id).toBe(CHAIN_ID)
    expect(report.rpc.chain_id_matches_expected).toBe(true)
    expect(report.deployer.ready).toBe(true)
    expect(report.deployer.source).toBe('DJD_DEPLOYER_PRIVATE_KEY')
    expect(report.guidance.ready).toBe(true)
    expect(report.guidance.recommended_env.DJD_NETWORK).toBe('base-sepolia')
    expect(report.guidance.recommended_env.DJD_BASE_SEPOLIA_RPC_URL).toBe('')
    expect(report.guidance.dotenv).toContain('DJD_NETWORK=base-sepolia')
    expect(report.guidance.shell).toContain("export DJD_NETWORK='base-sepolia'")
  })

  it('reports the exact missing inputs and emits a fill-in env template for the selected network', async () => {
    delete process.env.DJD_BASE_SEPOLIA_RPC_URL
    delete process.env.DJD_RPC_URL
    delete process.env.DJD_DEPLOYER_PRIVATE_KEY

    const report = await runEvaluatorStackPreflight({
      network: 'base-sepolia',
    })

    expect(report.ok).toBe(false)
    expect(report.network.key).toBe('base-sepolia')
    expect(report.bundle.ready).toBe(false)
    expect(report.rpc.ready).toBe(false)
    expect(report.deployer.ready).toBe(false)
    expect(report.guidance.ready).toBe(false)
    expect(report.guidance.missing.bundle?.recommended_envs).toEqual(['DJD_API_BASE_URL', 'DJD_VERDICT_ID'])
    expect(report.guidance.missing.rpc?.expected_envs).toEqual(['DJD_RPC_URL', 'DJD_BASE_SEPOLIA_RPC_URL'])
    expect(report.guidance.missing.deployer?.expected_envs).toEqual(['DJD_DEPLOYER_PRIVATE_KEY'])
    expect(report.guidance.recommended_env.DJD_NETWORK).toBe('base-sepolia')
    expect(report.guidance.recommended_env.DJD_BASE_SEPOLIA_RPC_URL).toBe('')
    expect(report.guidance.dotenv).toContain('DJD_BASE_SEPOLIA_RPC_URL=')
    expect(report.guidance.dotenv).toContain('DJD_DEPLOYER_PRIVATE_KEY=')
    expect(report.guidance.shell).toContain("export DJD_API_BASE_URL=''")
  })
})
