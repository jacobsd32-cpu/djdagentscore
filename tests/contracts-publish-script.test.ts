import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publishEvaluatorStackDeployment } from '../scripts/publish-evaluator-stack.mjs'

describe('publish evaluator stack script', () => {
  it('writes and replaces the canonical deployment registry entry for a network', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'djd-publish-script-'))
    const registryPath = join(fixtureDir, 'evaluator-deployments.json')

    const first = await publishEvaluatorStackDeployment({
      registryPath,
      deploymentResult: {
        standard: 'djd-evaluator-deploy-result-v1',
        network: {
          key: 'base-sepolia',
          chain_id: 84532,
          chain_name: 'Base Sepolia',
          caip2: 'eip155:84532',
          environment: 'testnet',
        },
        verdict_id: 'verdict_publish_1',
        deployer: '0x1234567890abcdef1234567890abcdef12345678',
        contracts: {
          verifier: {
            contract: 'DJDEvaluatorVerdictVerifier',
            address: '0x1234567890abcdef1234567890abcdef12345678',
            tx_hash: '0x' + '1'.repeat(64),
            action: 'deploy',
          },
          escrow: {
            contract: 'DJDEvaluatorEscrowSettlementExample',
            address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            tx_hash: '0x' + '2'.repeat(64),
            action: 'deploy',
          },
        },
        verification: {
          oracle_signer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
          escrow_verifier: '0x1234567890abcdef1234567890abcdef12345678',
          escrow_provider: '0x1234567890abcdef1234567890abcdef12345678',
          escrow_counterparty: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          escrow_id_hash: '0x' + '3'.repeat(64),
        },
        inputs: {
          network_key: 'base-sepolia',
          provider: '0x1234567890abcdef1234567890abcdef12345678',
          counterparty: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          escrow_id: 'escrow-publish-1',
        },
        explorer: {
          verifier_address: 'https://sepolia.basescan.org/address/0x1234567890abcdef1234567890abcdef12345678',
          verifier_transaction: `https://sepolia.basescan.org/tx/${'0x' + '1'.repeat(64)}`,
          escrow_address: 'https://sepolia.basescan.org/address/0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          escrow_transaction: `https://sepolia.basescan.org/tx/${'0x' + '2'.repeat(64)}`,
        },
        links: {
          verifier_package: 'https://api.example.test/v1/score/evaluator/verifier?network=base-sepolia',
          verifier_proof: 'https://api.example.test/v1/score/evaluator/proof?id=verdict_publish_1&network=base-sepolia',
          escrow_settlement:
            'https://api.example.test/v1/score/evaluator/escrow?id=verdict_publish_1&network=base-sepolia',
          bundle: 'https://api.example.test/v1/score/evaluator/deploy/bundle?id=verdict_publish_1&network=base-sepolia',
        },
      },
      checks: {
        preflight: true,
        verified: true,
        smoked: true,
        health: null,
        staged: true,
      },
      publishedAt: '2026-03-16T04:00:00.000Z',
    })

    const second = await publishEvaluatorStackDeployment({
      registryPath,
      deploymentResult: {
        ...first.deployment,
        standard: 'djd-evaluator-deploy-result-v1',
        network: {
          key: 'base-sepolia',
          chain_id: 84532,
          chain_name: 'Base Sepolia',
          caip2: 'eip155:84532',
          environment: 'testnet',
        },
        contracts: {
          ...first.deployment.contracts,
          verifier: {
            ...first.deployment.contracts.verifier,
            address: '0x9999999999999999999999999999999999999999',
          },
        },
        published_at: undefined,
      },
      checks: {
        preflight: true,
        verified: true,
        smoked: true,
        health: true,
        staged: true,
      },
      publishedAt: '2026-03-16T05:00:00.000Z',
    })

    expect(first.ok).toBe(true)
    expect(first.replacing).toBe(false)
    expect(second.ok).toBe(true)
    expect(second.replacing).toBe(true)
    expect(second.registry_summary.deployment_count).toBe(1)

    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      standard?: string
      updated_at?: string
      deployments?: Record<string, { published_at?: string; contracts?: { verifier?: { address?: string } } }>
    }
    expect(registry.standard).toBe('djd-evaluator-deployment-registry-v1')
    expect(registry.updated_at).toBe('2026-03-16T05:00:00.000Z')
    expect(registry.deployments?.['base-sepolia']?.published_at).toBe('2026-03-16T05:00:00.000Z')
    expect(registry.deployments?.['base-sepolia']?.contracts?.verifier?.address).toBe(
      '0x9999999999999999999999999999999999999999',
    )
  })
})
