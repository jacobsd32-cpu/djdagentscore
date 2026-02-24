export type AppEnv = {
  Variables: {
    freeTier: boolean
    requestId: string
    apiKeyId: number | null
    apiKeyWallet: string | null
    apiKeyTier: string | null
  }
}
