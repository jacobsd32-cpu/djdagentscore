import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import solc from 'solc'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTRACTS_DIR = join(ROOT, 'contracts')
const ARTIFACTS_DIR = join(ROOT, 'artifacts', 'contracts')
const CHECK_ONLY = process.argv.includes('--check')

const CONTRACT_FILES = [
  'IDJDEvaluatorOracleCallback.sol',
  'DJDEvaluatorVerdictVerifier.sol',
  'DJDEvaluatorEscrowSettlementExample.sol',
]

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeHex(value) {
  return value && value.length > 0 ? `0x${value}` : '0x'
}

function loadSources() {
  return Object.fromEntries(
    CONTRACT_FILES.map((file) => [
      file,
      {
        content: readFileSync(join(CONTRACTS_DIR, file), 'utf8'),
      },
    ]),
  )
}

function buildCompilerInput(sources) {
  return {
    language: 'Solidity',
    sources,
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': [
            'abi',
            'evm.bytecode.object',
            'evm.deployedBytecode.object',
            'evm.methodIdentifiers',
            'metadata',
          ],
        },
      },
    },
  }
}

function compileContracts() {
  const sources = loadSources()
  const input = buildCompilerInput(sources)
  const output = JSON.parse(solc.compile(JSON.stringify(input)))

  const errors = (output.errors ?? []).filter((entry) => entry.severity === 'error')
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => entry.formattedMessage).join('\n\n'))
  }

  const artifacts = []
  for (const file of CONTRACT_FILES) {
    const compiledContracts = output.contracts?.[file] ?? {}
    for (const [contractName, artifact] of Object.entries(compiledContracts)) {
      const source = sources[file].content
      const metadata = JSON.parse(artifact.metadata)
      const constructorAbi = (artifact.abi ?? []).find((entry) => entry.type === 'constructor') ?? null

      artifacts.push({
        contract: contractName,
        artifact_kind: normalizeHex(artifact.evm?.bytecode?.object ?? '') === '0x' ? 'interface' : 'contract',
        source_path: `contracts/${file}`,
        source_sha256: sha256(source),
        compiler: {
          name: 'solc',
          version: solc.version(),
          optimizer: {
            enabled: true,
            runs: 200,
          },
          via_ir: true,
        },
        abi: artifact.abi ?? [],
        bytecode: normalizeHex(artifact.evm?.bytecode?.object ?? ''),
        deployed_bytecode: normalizeHex(artifact.evm?.deployedBytecode?.object ?? ''),
        method_identifiers: artifact.evm?.methodIdentifiers ?? {},
        constructor: constructorAbi
          ? {
              inputs: constructorAbi.inputs ?? [],
            }
          : null,
        metadata,
      })
    }
  }

  artifacts.sort((left, right) => left.contract.localeCompare(right.contract))

  return {
    standard: 'djd-solidity-artifacts-v1',
    compiler: {
      name: 'solc',
      version: solc.version(),
      via_ir: true,
    },
    contracts: artifacts.map((artifact) => ({
      contract: artifact.contract,
      artifact_kind: artifact.artifact_kind,
      artifact_path: `artifacts/contracts/${artifact.contract}.json`,
      source_path: artifact.source_path,
      source_sha256: artifact.source_sha256,
      bytecode_sha256: sha256(artifact.bytecode),
      deployed_bytecode_sha256: sha256(artifact.deployed_bytecode),
    })),
    artifacts,
  }
}

function writeIfChanged(filePath, nextContents) {
  let currentContents = null
  try {
    currentContents = readFileSync(filePath, 'utf8')
  } catch {}

  if (currentContents === nextContents) {
    return false
  }

  if (CHECK_ONLY) {
    throw new Error(`Artifact out of date: ${filePath}`)
  }

  writeFileSync(filePath, nextContents)
  return true
}

function main() {
  const compiled = compileContracts()
  const manifest = {
    standard: compiled.standard,
    compiler: compiled.compiler,
    contracts: compiled.contracts,
  }

  if (!CHECK_ONLY) {
    rmSync(ARTIFACTS_DIR, { recursive: true, force: true })
    mkdirSync(ARTIFACTS_DIR, { recursive: true })
  }

  let wroteAny = false
  for (const artifact of compiled.artifacts) {
    const artifactPath = join(ARTIFACTS_DIR, `${artifact.contract}.json`)
    const contents = JSON.stringify(artifact, null, 2) + '\n'
    if (writeIfChanged(artifactPath, contents)) {
      wroteAny = true
    }
  }

  const manifestPath = join(ARTIFACTS_DIR, 'manifest.json')
  if (writeIfChanged(manifestPath, JSON.stringify(manifest, null, 2) + '\n')) {
    wroteAny = true
  }

  if (CHECK_ONLY) {
    console.log(`[contracts] OK ${compiled.artifacts.length} artifacts are up to date`)
  } else {
    console.log(
      `[contracts] ${wroteAny ? 'Wrote' : 'Verified'} ${compiled.artifacts.length} artifacts with ${compiled.compiler.version}`,
    )
  }
}

main()
