/**
 * Database connection — creates the SQLite instance and sets pragmas.
 *
 * Imported by schema.ts (CREATE TABLE) and queries.ts (prepared statements).
 * The barrel `../db.ts` re-exports everything so existing import paths work.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database, { type Database as DatabaseType } from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'scores.db')

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db: DatabaseType = new Database(DB_PATH)

// Performance & safety settings
// NOTE: We use DELETE journal mode instead of WAL because Fly.io volumes are
// network-attached storage (not local disk). WAL relies on shared-memory
// (mmap) semantics that are not guaranteed on network-attached volumes and
// can silently corrupt the database on crash or volume hiccup. DELETE mode
// is slower for concurrent reads but safe on any filesystem.
// Switch to WAL only if running on local SSD / persistent disk.
db.pragma('journal_mode = DELETE')
db.pragma('synchronous = FULL')
db.pragma('foreign_keys = ON')

// Enable incremental auto-vacuum so `PRAGMA incremental_vacuum` in the data
// pruner can return freed pages to the OS. On a brand-new database this takes
// effect immediately. On an existing database the mode is stored but only
// activates after a full VACUUM (which temporarily doubles disk usage). The
// data pruner gracefully handles the NONE case — deleted pages still go on
// SQLite's free-list and get reused by future inserts, preventing growth.
const currentAutoVacuum = (db.pragma('auto_vacuum') as Array<{ auto_vacuum: number }>)[0]?.auto_vacuum ?? 0
if (currentAutoVacuum === 0) {
  // auto_vacuum = NONE — set to INCREMENTAL for future effect.
  // On existing databases this requires a VACUUM to activate, which we defer
  // until the pruner has shrunk the data enough to make it safe (< 50% disk).
  db.pragma('auto_vacuum = INCREMENTAL')
}
export const autoVacuumMode = currentAutoVacuum === 2 ? 'incremental' : currentAutoVacuum === 1 ? 'full' : 'none'
