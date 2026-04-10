import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPublicUrl } from '../config/public.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ARTIFACTS_DIR = join(__dirname, '..', '..', 'artifacts', 'contracts')
const ARTIFACT_MANIFEST_PATH = join(ARTIFACTS_DIR, 'manifest.json')

export interface ContractArtifactManifestEntry {
  contract: string
  artifact_kind: 'contract' | 'interface'
  artifact_path: string
  source_path: string
  source_sha256: string
  bytecode_sha256: string
  deployed_bytecode_sha256: string
}

export interface ContractArtifactManifest {
  standard: 'djd-solidity-artifacts-v1'
  compiler: {
    name: 'solc'
    version: string
    via_ir: boolean
  }
  contracts: ContractArtifactManifestEntry[]
}

export interface CompiledContractArtifact {
  contract: string
  artifact_kind: 'contract' | 'interface'
  source_path: string
  source_sha256: string
  compiler: {
    name: 'solc'
    version: string
    optimizer: {
      enabled: boolean
      runs: number
    }
    via_ir: boolean
  }
  abi: unknown[]
  bytecode: string
  deployed_bytecode: string
  method_identifiers: Record<string, string>
  constructor: {
    inputs: unknown[]
  } | null
  metadata: Record<string, unknown>
}

export interface EvaluatorArtifactPackageView {
  standard: 'djd-evaluator-artifact-package-v1'
  available: boolean
  compiler: ContractArtifactManifest['compiler'] | null
  summary: {
    total: number
    deployable: number
    interfaces: number
  }
  contracts: Array<{
    contract: string
    artifact_kind: 'contract' | 'interface'
    deployable: boolean
    artifact_path: string
    source_path: string
    source_sha256: string
    bytecode_sha256: string
    deployed_bytecode_sha256: string
    constructor: CompiledContractArtifact['constructor']
    abi: unknown[]
    bytecode: string
    deployed_bytecode: string
    method_identifiers: Record<string, string>
  }>
  links: {
    verifier_package: string
    deploy_plan: string
    docs: string
  }
  notes: string[]
}

export function loadArtifactManifest(): ContractArtifactManifest | null {
  try {
    return JSON.parse(readFileSync(ARTIFACT_MANIFEST_PATH, 'utf8')) as ContractArtifactManifest
  } catch {
    return null
  }
}

export function loadArtifact(contract: string): CompiledContractArtifact | null {
  try {
    return JSON.parse(readFileSync(join(ARTIFACTS_DIR, `${contract}.json`), 'utf8')) as CompiledContractArtifact
  } catch {
    return null
  }
}

export function getEvaluatorArtifactPackageView(): EvaluatorArtifactPackageView {
  const manifest = loadArtifactManifest()
  if (!manifest) {
    return {
      standard: 'djd-evaluator-artifact-package-v1',
      available: false,
      compiler: null,
      summary: {
        total: 0,
        deployable: 0,
        interfaces: 0,
      },
      contracts: [],
      links: {
        verifier_package: buildPublicUrl('/v1/score/evaluator/verifier'),
        deploy_plan: buildPublicUrl('/v1/score/evaluator/deploy?id=verdict_...'),
        docs: buildPublicUrl('/docs'),
      },
      notes: [
        'Compiled Solidity artifacts are not available in this runtime yet.',
        'Run npm run contracts:compile before depending on the artifact package endpoint.',
      ],
    }
  }

  const contracts = manifest.contracts
    .map((entry) => {
      const artifact = loadArtifact(entry.contract)
      if (!artifact) {
        return null
      }

      return {
        contract: entry.contract,
        artifact_kind: entry.artifact_kind,
        deployable: entry.artifact_kind === 'contract',
        artifact_path: entry.artifact_path,
        source_path: entry.source_path,
        source_sha256: entry.source_sha256,
        bytecode_sha256: entry.bytecode_sha256,
        deployed_bytecode_sha256: entry.deployed_bytecode_sha256,
        constructor: artifact.constructor,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        deployed_bytecode: artifact.deployed_bytecode,
        method_identifiers: artifact.method_identifiers,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  return {
    standard: 'djd-evaluator-artifact-package-v1',
    available: true,
    compiler: manifest.compiler,
    summary: {
      total: contracts.length,
      deployable: contracts.filter((entry) => entry.deployable).length,
      interfaces: contracts.filter((entry) => !entry.deployable).length,
    },
    contracts,
    links: {
      verifier_package: buildPublicUrl('/v1/score/evaluator/verifier'),
      deploy_plan: buildPublicUrl('/v1/score/evaluator/deploy?id=verdict_...'),
      docs: buildPublicUrl('/docs'),
    },
    notes: [
      'Artifacts are compiled with solc optimizer runs=200 and viaIR enabled so the verifier contract compiles cleanly.',
      'Use deployable contract entries for constructor bytecode and interface entries for ABI-only integrations.',
    ],
  }
}

export function getEvaluatorArtifactContractEntry(
  contract: string,
): EvaluatorArtifactPackageView['contracts'][number] | null {
  return getEvaluatorArtifactPackageView().contracts.find((entry) => entry.contract === contract) ?? null
}
