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
