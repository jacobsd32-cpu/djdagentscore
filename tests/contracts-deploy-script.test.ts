import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPublicClient, http, parseEther, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { buildEscrowIdHash } from '../src/contracts/djdEvaluatorOracleCallback.js'
import { getEvaluatorArtifactPackageView } from '../src/services/contractArtifactService.js'
import { buildDeploymentBundleUrl, deployEvaluatorStackFromBundle } from '../scripts/deploy-evaluator-stack.mjs'
import ganache from './helpers/ganache.js'

const CHAIN_ID = 8453
const DEPLOYER_KEY = '0x6100000000000000000000000000000000000000000000000000000000000001' as const
const PROVIDER_KEY = '0x6200000000000000000000000000000000000000000000000000000000000002' as const
const COUNTERPARTY_KEY = '0x6300000000000000000000000000000000000000000000000000000000000003' as const
const ORACLE_KEY = '0x6400000000000000000000000000000000000000000000000000000000000004' as const

const deployerAccount = privateKeyToAccount(DEPLOYER_KEY)
const providerAccount = privateKeyToAccount(PROVIDER_KEY)
const counterpartyAccount = privateKeyToAccount(COUNTERPARTY_KEY)
const oracleAccount = privateKeyToAccount(ORACLE_KEY)

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

describe('deploy evaluator stack script', () => {
  const artifactPackage = getEvaluatorArtifactPackageView()
  const verifierArtifact = artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorVerdictVerifier')
  const escrowArtifact = artifactPackage.contracts.find((entry) => entry.contract === 'DJDEvaluatorEscrowSettlementExample')

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

  it('deploys verifier and escrow contracts from a bundle payload', async () => {
    const bundle = {
      standard: 'djd-evaluator-deploy-bundle-v1' as const,
      network: {
        chain_id: CHAIN_ID,
        chain_name: 'Base',
      },
      verdict_id: 'verdict_deploy_script_fixture',
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
            escrow_id: 'escrow-deploy-script',
            escrow_id_hash: buildEscrowIdHash('escrow-deploy-script'),
          },
          deployment_ready: true,
          reason: null,
        },
      },
      links: {
        verifier_package: 'https://example.test/v1/score/evaluator/verifier',
        verifier_proof: 'https://example.test/v1/score/evaluator/proof?id=verdict_deploy_script_fixture',
        escrow_settlement: 'https://example.test/v1/score/evaluator/escrow?id=verdict_deploy_script_fixture',
        artifact_package: 'https://example.test/v1/score/evaluator/artifacts',
        bundle: 'https://example.test/v1/score/evaluator/deploy/bundle?id=verdict_deploy_script_fixture',
      },
      notes: ['fixture'],
    }

    const result = await deployEvaluatorStackFromBundle({
      bundle,
      rpcUrl,
      deployerPrivateKey: DEPLOYER_KEY,
    })

    expect(result.standard).toBe('djd-evaluator-deploy-result-v1')
    expect(result.deployer).toBe(deployerAccount.address)
    expect(result.contracts.verifier.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(result.contracts.escrow.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(result.verification.oracle_signer).toBe(oracleAccount.address)
    expect(result.verification.escrow_provider).toBe(providerAccount.address)
    expect(result.verification.escrow_counterparty).toBe(counterpartyAccount.address)
    expect(result.verification.escrow_id_hash).toBe(buildEscrowIdHash('escrow-deploy-script'))
    expect(result.inputs.escrow_id).toBe('escrow-deploy-script')
    expect(result.explorer?.verifier_address).toContain('/address/')
    expect(result.explorer?.verifier_transaction).toContain('/tx/')
    expect(result.explorer?.escrow_address).toContain('/address/')
    expect(result.explorer?.escrow_transaction).toContain('/tx/')

    const settled = await publicClient.readContract({
      address: result.contracts.escrow.address as `0x${string}`,
      abi: escrowArtifact?.abi as any,
      functionName: 'settled',
    })
    expect(settled).toBe(false)
  })

  it('builds a deployment bundle URL from API base, verdict id, and network', () => {
    const url = buildDeploymentBundleUrl({
      apiBaseUrl: 'https://api.example.test',
      verdictId: 'verdict_bundle_123',
      network: 'base-sepolia',
      verifierContract: oracleAccount.address,
    })

    expect(url).toBe(
      `https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_bundle_123&network=base-sepolia&verifier_contract=${oracleAccount.address}`,
    )
  })
})
