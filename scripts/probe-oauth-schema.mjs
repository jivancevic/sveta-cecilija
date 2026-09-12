// Integration probe for the OAuth schema (#438, ADR-0024 phase 4).
//
// The sibling of `probe-push-schema.mjs` and `probe-lineup-schema.mjs`, for the
// same reason: the unit suite proves `migrate-zz-d-oauth.sql` writes no
// unguarded row mutation and `oauth.test.ts` proves the flow, but no unit test
// can prove that re-applying the file on every restart is a no-op, that it
// UPGRADES an older populated database, or that the two properties the whole
// connector hangs on actually hold in Postgres — that a code can be redeemed
// exactly ONCE (the `DELETE … RETURNING` in `oauth-store.ts`) and that deleting
// a user takes their tokens with them (revocation by cascade).
//
// It CREATES ITS OWN THROWAWAY DATABASE, runs the real `scripts/bootstrap-db.mjs`
// against it and DROPS it again. It never touches sveta_cecilija_dev, staging or
// production — DATABASE_URL supplies only the host and credentials.
//
//   set -a && . .env.local && set +a && node scripts/probe-oauth-schema.mjs
//
// Asserts, in order:
//   1. fresh bootstrap  → both tables, their columns, the unique token index and
//      the two foreign keys exist;
//   2. second bootstrap → no error, nothing duplicated (the restart case);
//   3. a code is single-use: the same `DELETE … RETURNING` yields a row exactly
//      once, and the second attempt yields nothing;
//   4. the unique hash index refuses a duplicated access token;
//   5. deleting a user takes their codes and tokens with them (ON DELETE
//      CASCADE = revocation);
//   6. downgrade to the pre-#438 shape, bootstrap again → everything is back.
//
// Exit 0 = all assertions passed; exit 1 = the schema regressed.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const { Client } = pg

const dirname = path.dirname(fileURLToPath(import.meta.url))
const bootstrap = path.join(dirname, 'bootstrap-db.mjs')

let failures = 0
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`)
  }
}

function runBootstrap(url) {
  execFileSync(process.execPath, [bootstrap], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
}

const scalar = async (client, sql, params = []) =>
  (await client.query(sql, params)).rows[0]?.v ?? null

async function assertShape(client, label) {
  for (const table of ['oauth_codes', 'oauth_tokens']) {
    check(
      `${label}: the ${table} table exists`,
      (await scalar(client, `SELECT to_regclass($1)::text AS v`, [`public.${table}`])) === table,
    )
  }

  const columns = {
    oauth_codes: [
      'code_hash',
      'client_id',
      'user_id',
      'redirect_uri',
      'code_challenge',
      'code_challenge_method',
      'resource',
      'scope',
      'expires_at',
      'created_at',
    ],
    oauth_tokens: [
      'id',
      'access_token_hash',
      'client_id',
      'user_id',
      'resource',
      'scope',
      'expires_at',
      'created_at',
    ],
  }
  for (const [table, cols] of Object.entries(columns)) {
    for (const col of cols) {
      check(
        `${label}: ${table}.${col} exists`,
        (await scalar(
          client,
          `SELECT 1 AS v FROM information_schema.columns
            WHERE table_name = $1 AND column_name = $2`,
          [table, col],
        )) === 1,
      )
    }
  }

  // No refresh token column anywhere: the refresh path is deleted, not disabled.
  check(
    `${label}: there is no refresh token column (the path is gone, #430 story 59)`,
    (await scalar(
      client,
      `SELECT count(*)::int AS v FROM information_schema.columns
        WHERE table_name IN ('oauth_codes','oauth_tokens') AND column_name LIKE '%refresh%'`,
    )) === 0,
  )

  for (const idx of [
    'oauth_codes_expires_idx',
    'oauth_tokens_access_hash_unique_idx',
    'oauth_tokens_user_idx',
  ]) {
    check(
      `${label}: index ${idx} exists`,
      (await scalar(client, `SELECT 1 AS v FROM pg_indexes WHERE indexname = $1`, [idx])) === 1,
    )
  }

  check(
    `${label}: both foreign keys to users exist`,
    (await scalar(
      client,
      `SELECT count(*)::int AS v FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
       WHERE c.contype = 'f' AND t.relname IN ('oauth_codes','oauth_tokens')`,
    )) === 2,
  )
}

async function main() {
  const source = process.env.DATABASE_URL
  if (!source) throw new Error('DATABASE_URL is not set (needed for the scratch DB host/credentials)')

  const scratchName = `probe_oauth_schema_${process.pid}`
  const admin = new URL(source)
  const scratch = new URL(source)
  admin.pathname = '/postgres'
  scratch.pathname = `/${scratchName}`

  const adminClient = new Client({ connectionString: admin.toString() })
  await adminClient.connect()
  console.log(`[probe] creating throwaway database ${scratchName}`)
  await adminClient.query(`DROP DATABASE IF EXISTS ${scratchName}`)
  await adminClient.query(`CREATE DATABASE ${scratchName}`)

  const client = new Client({ connectionString: scratch.toString() })
  try {
    await client.connect()

    // --- 1. fresh bootstrap -------------------------------------------------
    console.log('[probe] bootstrap #1 (fresh database)')
    runBootstrap(scratch.toString())
    await assertShape(client, 'fresh')

    // --- 2. second bootstrap (a plain restart) ------------------------------
    console.log('[probe] bootstrap #2 (populated database — the restart case)')
    runBootstrap(scratch.toString())
    await assertShape(client, 'restart')
    check(
      'the unique token index was not duplicated',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM pg_indexes
          WHERE indexname = 'oauth_tokens_access_hash_unique_idx'`,
      )) === 1,
    )

    // --- 3. a code is redeemable exactly once -------------------------------
    console.log('[probe] the authorization code is single-use')
    const user = await scalar(
      client,
      `INSERT INTO users (email, username, hash, salt, updated_at, created_at)
       VALUES ('voditelj@example.test', 'voditelj-probe', 'x', 'y', now(), now())
       RETURNING id AS v`,
    )
    await client.query(
      `INSERT INTO oauth_codes
         (code_hash, client_id, user_id, redirect_uri, code_challenge,
          code_challenge_method, scope, expires_at)
       VALUES ('hash-one', 'claude', $1, 'https://claude.ai/api/mcp/auth_callback',
               'challenge', 'S256', 'mcp', now() + interval '5 minutes')`,
      [user],
    )
    const take = () =>
      client.query(`DELETE FROM oauth_codes WHERE code_hash = 'hash-one' RETURNING user_id`)
    check('the first redemption returns the row', (await take()).rowCount === 1)
    check('the second redemption returns nothing', (await take()).rowCount === 0)

    // --- 4. one row per access token hash -----------------------------------
    console.log('[probe] the access token hash is unique')
    const insertToken = (hash) =>
      client.query(
        `INSERT INTO oauth_tokens (access_token_hash, client_id, user_id, scope, expires_at)
         VALUES ($1, 'claude', $2, 'mcp', now() + interval '365 days')`,
        [hash, user],
      )
    await insertToken('token-one')
    let duplicateRefused = false
    try {
      await insertToken('token-one')
    } catch {
      duplicateRefused = true
    }
    check('a second row with the same token hash is refused', duplicateRefused)
    await insertToken('token-two')

    // --- 5. revocation by cascade ------------------------------------------
    console.log('[probe] deleting a user revokes their tokens')
    await client.query(
      `INSERT INTO oauth_codes
         (code_hash, client_id, user_id, redirect_uri, code_challenge,
          code_challenge_method, expires_at)
       VALUES ('hash-two', 'claude', $1, 'https://claude.ai/api/mcp/auth_callback',
               'challenge', 'S256', now() + interval '5 minutes')`,
      [user],
    )
    await client.query('DELETE FROM users WHERE id = $1', [user])
    check(
      'the tokens went with the account (ON DELETE CASCADE)',
      (await scalar(client, `SELECT count(*)::int AS v FROM oauth_tokens`)) === 0,
    )
    check(
      'the pending code went too',
      (await scalar(client, `SELECT count(*)::int AS v FROM oauth_codes`)) === 0,
    )

    // --- 6. the upgrade path: an older DB without the tables ----------------
    console.log('[probe] downgrade to the pre-#438 shape, then bootstrap again')
    await client.query('DROP TABLE IF EXISTS oauth_codes CASCADE')
    await client.query('DROP TABLE IF EXISTS oauth_tokens CASCADE')

    runBootstrap(scratch.toString())
    await assertShape(client, 'upgraded')
    check(
      'the upgraded tables start empty, and nothing seeded a credential',
      (await scalar(client, `SELECT count(*)::int AS v FROM oauth_tokens`)) === 0,
    )
  } finally {
    await client.end().catch(() => {})
    console.log(`[probe] dropping ${scratchName}`)
    await adminClient.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`)
    await adminClient.end()
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll assertions passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
