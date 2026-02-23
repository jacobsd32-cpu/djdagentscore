/**
 * Database barrel — re-exports connection, schema (side-effect), and query helpers.
 *
 * Existing imports like `import { upsertScore, db } from '../db.js'` continue
 * to work unchanged.  Internally the logic lives in:
 *   - db/connection.ts  — SQLite instance + pragmas
 *   - db/schema.ts      — CREATE TABLE + migrations (side-effect)
 *   - db/queries.ts     — prepared statements + exported helpers
 */

// Side-effect: ensures all tables + migrations run before queries compile.
import './db/schema.js'

// Re-export the db instance from connection
export { db } from './db/connection.js'

// Re-export every query helper so consumers don't need to change imports
export * from './db/queries.js'
