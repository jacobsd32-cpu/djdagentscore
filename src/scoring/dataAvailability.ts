/**
 * Data Availability Module
 *
 * Produces human-readable assessments of data quality for each scoring dimension,
 * and generates a concrete improvement path for wallets with low data coverage.
 */

export interface DataAvailability {
  transactionHistory: string
  walletAge: string
  economicData: string
  identityData: string
  communityData: string
}

export interface DataAvailabilityInputs {
  txCount: number
  walletAgeDays: number
  usdcBalance: number // USDC float
  ratingCount: number
  uniquePartners: number
}

export function buildDataAvailability(inputs: DataAvailabilityInputs): DataAvailability {
  const { txCount, walletAgeDays, usdcBalance, ratingCount, uniquePartners } =
    inputs

  // Transaction history
  let transactionHistory: string
  if (txCount === 0) {
    transactionHistory = 'none (0 transactions)'
  } else if (txCount < 5) {
    transactionHistory = `minimal (${txCount} transaction${txCount === 1 ? '' : 's'})`
  } else if (txCount < 20) {
    transactionHistory = `limited (${txCount} transactions)`
  } else if (txCount < 100) {
    transactionHistory = `moderate (${txCount} transactions)`
  } else {
    transactionHistory = `strong (${txCount} transactions)`
  }

  // Wallet age
  let walletAge: string
  if (walletAgeDays < 1) {
    walletAge = 'insufficient (<1 day)'
  } else if (walletAgeDays < 7) {
    walletAge = `insufficient (${Math.round(walletAgeDays)} day${walletAgeDays < 2 ? '' : 's'})`
  } else if (walletAgeDays < 30) {
    walletAge = `limited (${Math.round(walletAgeDays)} days)`
  } else if (walletAgeDays < 90) {
    walletAge = `sufficient (${Math.round(walletAgeDays)} days)`
  } else {
    walletAge = `strong (${Math.round(walletAgeDays)} days)`
  }

  // Economic data
  let economicData: string
  if (usdcBalance === 0 && txCount === 0) {
    economicData = 'none'
  } else if (usdcBalance < 1 && txCount < 5) {
    economicData = 'minimal'
  } else if (usdcBalance < 10 || txCount < 20) {
    economicData = 'limited'
  } else if (usdcBalance < 100 || txCount < 100) {
    economicData = 'good'
  } else {
    economicData = 'strong'
  }

  // Identity data
  // Note: erc8004Registered is always false (registry not deployed on Base).
  // Identity assessment is based on partner diversity and other signals instead.
  let identityData: string
  if (uniquePartners === 0) {
    identityData = 'none'
  } else if (uniquePartners < 3) {
    identityData = 'minimal'
  } else if (uniquePartners < 10) {
    identityData = 'partial'
  } else {
    identityData = 'strong'
  }

  // Community data
  let communityData: string
  if (ratingCount === 0) {
    communityData = 'none (no ratings yet)'
  } else if (ratingCount < 5) {
    communityData = `minimal (${ratingCount} rating${ratingCount === 1 ? '' : 's'})`
  } else if (ratingCount < 10) {
    communityData = `limited (${ratingCount} ratings)`
  } else {
    communityData = `good (${ratingCount} ratings)`
  }

  return { transactionHistory, walletAge, economicData, identityData, communityData }
}

export interface ImprovementPathInputs {
  txCount: number
  walletAgeDays: number
  uniquePartners: number
  hasBasename: boolean
  githubVerified: boolean
  confidence: number
}

/**
 * Returns an ordered list of concrete improvement suggestions.
 * Empty if the wallet already has strong data coverage (confidence >= 0.7).
 */
export function buildImprovementPath(inputs: ImprovementPathInputs): string[] {
  const { txCount, walletAgeDays, uniquePartners, hasBasename, githubVerified, confidence } = inputs

  if (confidence >= 0.7) return []

  const path: string[] = []

  if (txCount < 10) {
    path.push('Complete 10+ transactions to improve reliability data')
  } else if (txCount < 100) {
    path.push('Reach 100+ transactions for a strong reliability signal')
  }

  if (walletAgeDays < 7) {
    path.push('Maintain wallet activity for 7+ days')
  } else if (walletAgeDays < 30) {
    path.push('Maintain wallet activity for 30+ days for a stronger age signal')
  }

  if (uniquePartners < 3) {
    path.push('Transact with 3+ unique partners to demonstrate network diversity')
  } else if (uniquePartners < 10) {
    path.push('Expand to 10+ unique partners to maximize diversity signal')
  }

  // Suggest achievable identity signals the wallet hasn't claimed yet
  if (!hasBasename && !githubVerified) {
    path.push('Register a Basename (*.base.eth) or verify a GitHub repo to strengthen identity')
  } else if (!hasBasename) {
    path.push('Register a Basename (*.base.eth) for additional identity verification')
  } else if (!githubVerified) {
    path.push('Verify a GitHub repo to strengthen your identity signal')
  }

  if (path.length === 0 && confidence < 0.5) {
    path.push('Increase transaction frequency and partner diversity to improve confidence')
  }

  return path
}
