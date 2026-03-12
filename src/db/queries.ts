/**
 * Query barrel — re-exports domain-scoped DB helpers.
 *
 * Imported AFTER schema.ts has created all tables. The barrel `../db.ts`
 * continues to provide the stable public DB API used across the app.
 */

export * from './analyticsQueries.js'
export * from './certificationQueries.js'
export * from './dataQueries.js'
export * from './directoryQueries.js'
export * from './evidenceQueries.js'
export * from './forensicsQueries.js'
export * from './growthQueries.js'
export * from './identityQueries.js'
export * from './monitoringQueries.js'
export * from './platformQueries.js'
export * from './reputationQueries.js'
