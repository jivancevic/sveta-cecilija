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
    for (const file of files) {
      const sql = readFileSync(path.join(schemaDir, file), 'utf-8')
      console.log(`[bootstrap-db] applying ${file}`)
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
