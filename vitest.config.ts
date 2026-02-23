import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['x402/**', 'node_modules/**'],
    testTimeout: 30_000,
    pool: 'forks',            // native addons (better-sqlite3) serialize poorly across worker_threads
  },
})
