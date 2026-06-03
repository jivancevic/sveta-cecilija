#!/usr/bin/env node
//
// Apply the app-managed schema in db/schema/*.sql to the database
// pointed at by DATABASE_URL.
//
// Runs before `next start` (see package.json) so the schema is always
// in sync with the deployed code before the server accepts requests.
//
// Idempotent — files use CREATE TABLE IF NOT EXISTS / ALTER TABLE ...
// ADD COLUMN IF NOT EXISTS / DO blocks for enums.
//
// Why this exists instead of `payload migrate`: this codebase uses
// bundler-style TS imports (no .js extensions) which the Payload CLI's
// tsx loader can't resolve. Rather than touch every import in the
// project, we run plain SQL through pg — works on any Node version
// and doesn't depend on Payload's CLI bootstrapping the config.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const { Client } = pg

const dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaDir = path.resolve(dirname, '..', 'db', 'schema')

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[bootstrap-db] DATABASE_URL is not set — skipping (set it in your env to apply schema).')
    process.exit(0)
  }

  const files = readdirSync(schemaDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log('[bootstrap-db] No SQL files in db/schema — nothing to apply.')
    return
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    // `00-base.sql` (sorts first) is the FULL Payload schema — base tables
    // `users`/`shows`/`payload_*`, every enum, constraint, sequence and index —
    // so a brand-new DB gets a complete, reproducible schema before the server
    // starts, with no dependency on Payload `push` (which prod never runs).
    // See ADR-0013 and db/schema/README.md.
    //
    // BUT the baseline is generated from a fresh Payload push, so it carries
    // Payload's constraint/sequence NAMES (e.g. `tickets_pkey`,
    // `tickets_id_seq`). Existing prod/staging DBs carry LEGACY names from the
    // `qr_tokens`→`tickets` rename (`qr_tokens_pkey`, `qr_tokens_id_seq`).
    // Re-applying the baseline to such a DB would crash ("multiple primary keys
    // for table tickets") and, worse, repoint `tickets.id` to a fresh sequence.
    // So `00-base.sql` runs ONLY on a fresh DB; existing DBs are evolved by the
    // incremental, idempotent `app.sql` + `migrate-*.sql` (as before #205).
    //
    // (Earlier this script carried the inverse "#122 fresh-DB guard" that
    // skipped ALL sql on a fresh DB and deferred to instrumentation + push —
    // which left a fresh PROD DB broken. `00-base.sql` + this targeted guard
    // replace it.)
    const { rows } = await client.query("SELECT to_regclass('public.users') AS users")
    const isFreshDb = !rows[0].users

    for (const file of files) {
      if (file === '00-base.sql' && !isFreshDb) {
        console.log('[bootstrap-db] existing database — skipping 00-base.sql (baseline is for fresh DBs only)')
        continue
      }
      const sql = readFileSync(path.join(schemaDir, file), 'utf-8')
      console.log(`[bootstrap-db] applying ${file}${file === '00-base.sql' ? ' (fresh database)' : ''}`)
      await client.query(sql)
    }
    console.log('[bootstrap-db] done.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[bootstrap-db] failed:', err.message)
  process.exit(1)
})
