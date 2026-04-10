export const CERTIFICATION_TIER_KEYS = ['operational', 'transactional', 'autonomous'] as const

export type CertificationTierKey = (typeof CERTIFICATION_TIER_KEYS)[number]

export interface CertificationTierDefinition {
  key: CertificationTierKey
  label: 'Operational' | 'Transactional' | 'Autonomous'
  level: 1 | 2 | 3
  minimumScore: number
  priceUsd: number
  summary: string
  controls: string[]
}

const CERTIFICATION_TIERS: readonly CertificationTierDefinition[] = [
  {
    key: 'operational',
    label: 'Operational',
    level: 1,
    minimumScore: 60,
    priceUsd: 50,
    summary: 'Reliable execution for bounded tasks with a basic audit trail.',
    controls: ['Basic audit trail', 'Defined scope of work', 'Score >= 60'],
  },
  {
    key: 'transactional',
    label: 'Transactional',
    level: 2,
    minimumScore: 75,
    priceUsd: 200,
    summary: 'Financially sensitive work with monitoring, spend controls, and fuller logs.',
    controls: ['Transaction logging', 'Spend guardrails', 'Enhanced monitoring', 'Score >= 75'],
  },
  {
    key: 'autonomous',
    label: 'Autonomous',
    level: 3,
    minimumScore: 90,
    priceUsd: 500,
    summary: 'Consequential autonomy with strong evidence, escalation, and forensic expectations.',
    controls: ['Forensic trail', 'Escalation readiness', 'Autonomy review', 'Score >= 90'],
  },
] as const

const DEFAULT_CERTIFICATION_TIER_KEY: CertificationTierKey = 'transactional'

const CERTIFICATION_TIER_ALIAS_MAP = new Map<string, CertificationTierDefinition>()

for (const tier of CERTIFICATION_TIERS) {
  const aliases = [
    tier.key,
    tier.label,
    tier.label.toLowerCase(),
    `tier-${tier.level}`,
    `tier${tier.level}`,
    String(tier.level),
  ]

  for (const alias of aliases) {
    CERTIFICATION_TIER_ALIAS_MAP.set(alias.trim().toLowerCase(), tier)
  }
}

// Backward-compatible aliases for earlier single-tier certification records.
CERTIFICATION_TIER_ALIAS_MAP.set('trusted', CERTIFICATION_TIER_ALIAS_MAP.get('transactional')!)
CERTIFICATION_TIER_ALIAS_MAP.set('elite', CERTIFICATION_TIER_ALIAS_MAP.get('autonomous')!)
CERTIFICATION_TIER_ALIAS_MAP.set('established', CERTIFICATION_TIER_ALIAS_MAP.get('operational')!)

export function listCertificationTiers(): CertificationTierDefinition[] {
  return [...CERTIFICATION_TIERS]
}

export function getDefaultCertificationTier(): CertificationTierDefinition {
  return CERTIFICATION_TIER_ALIAS_MAP.get(DEFAULT_CERTIFICATION_TIER_KEY)!
}

export function getCertificationTier(rawTier: string | null | undefined): CertificationTierDefinition | null {
  const normalized = rawTier?.trim().toLowerCase()
  if (!normalized) return null
  return CERTIFICATION_TIER_ALIAS_MAP.get(normalized) ?? null
}

export function getCertificationTierByStoredValue(
  rawTier: string | null | undefined,
): CertificationTierDefinition | null {
  return getCertificationTier(rawTier)
}

export function getHighestEligibleCertificationTier(score: number): CertificationTierDefinition | null {
  for (const tier of [...CERTIFICATION_TIERS].sort((left, right) => right.minimumScore - left.minimumScore)) {
    if (score >= tier.minimumScore) {
      return tier
    }
  }

  return null
}

export function getCertificationApplyPath(tierKey: CertificationTierKey): string {
  return `/v1/certification/apply/${tierKey}`
}
