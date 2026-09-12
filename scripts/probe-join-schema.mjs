// Integration probe for the rehearsal join schema (#463, ADR-0024).
//
// The sibling of `probe-oauth-schema.mjs` and `probe-push-schema.mjs`, for the
// same reason: the unit suite proves `join.ts` refuses what it should and
// `db-schema-safety.test.ts` proves the file mutates no row, but no unit test
// can prove that re-applying it on every restart is a no-op, that it UPGRADES
// an older populated database, or that the one property the whole flow hangs on
// actually holds in Postgres — that a Member can have exactly ONE pending claim,
// which is what stops two phones putting one dancer in front of the voditelj
// twice and minting two logins for one person.
//
// It CREATES ITS OWN THROWAWAY DATABASE, runs the real `scripts/bootstrap-db.mjs`
// against it and DROPS it again. It never touches sveta_cecilija_dev, staging or
// production — DATABASE_URL supplies only the host and credentials.
//
//   set -a && . .env.local && set +a && node scripts/probe-join-schema.mjs
//
// Asserts, in order:
//   1. fresh bootstrap  → both tables, their columns, the indexes and the
//      foreign keys exist;
//   2. second bootstrap → no error, nothing duplicated (the restart case);
//   3. one PENDING claim per Member: a second is refused, while a second claim
//      after the first was decided is allowed (the retry case);
//   3b. the expiry sweep: a claim nobody answered is marked `expired` by the
//      next claim for that Member, so the partial index stops blocking them.
//      Without this a two-hour-old row locks a dancer out of the join flow for
//      good, and a stranger with a live code could do it to the whole roster
//      (#463 review);
//   4. the secret hash is unique across the whole table;
//   5. deleting a Member takes their claims; deleting a login leaves the claim
//      with a NULL user_id rather than deleting the history;
//   6. downgrade to the pre-#463 shape, bootstrap again → everything is back.
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
  for (const table of ['app_join_codes', 'app_join_claims']) {
    check(
      `${label}: the ${table} table exists`,
      (await scalar(client, `SELECT to_regclass($1)::text AS v`, [`public.${table}`])) === table,
    )
  }

  const columns = {
    app_join_codes: ['code', 'created_by', 'created_at', 'expires_at'],
    app_join_claims: [
      'id',
      'member_id',
      'code',
      'secret_hash',
      'pairing',
      'status',
      'user_id',
      'created_at',
      'expires_at',
      'decided_by',
      'decided_at',
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

  // The plaintext secret must have nowhere to live: the column is a hash.
  check(
    `${label}: no plaintext secret column exists`,
    (await scalar(
      client,
      `SELECT count(*)::int AS v FROM information_schema.columns
        WHERE table_name = 'app_join_claims' AND column_name = 'secret'`,
    )) === 0,
  )

  for (const idx of [
    'app_join_codes_expires_idx',
    'app_join_claims_secret_idx',
    'app_join_claims_one_pending_idx',
    'app_join_claims_status_idx',
  ]) {
    check(
      `${label}: index ${idx} exists`,
      (await scalar(client, `SELECT 1 AS v FROM pg_indexes WHERE indexname = $1`, [idx])) === 1,
    )
  }

  check(
    `${label}: the one-pending index is PARTIAL (status = 'pending')`,
    String(
      await scalar(
        client,
        `SELECT indexdef AS v FROM pg_indexes WHERE indexname = 'app_join_claims_one_pending_idx'`,
      ),
    ).includes('WHERE'),
  )
}

async function main() {
  const source = process.env.DATABASE_URL
  if (!source) throw new Error('DATABASE_URL is not set (needed for the scratch DB host/credentials)')

  const scratchName = `probe_join_schema_${process.pid}`
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
      'the one-pending index was not duplicated',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM pg_indexes
          WHERE indexname = 'app_join_claims_one_pending_idx'`,
      )) === 1,
    )

    // --- 3. one pending claim per member ------------------------------------
    console.log('[probe] a Member can have exactly one pending claim')
    const member = await scalar(
      client,
      `INSERT INTO members (name, updated_at, created_at)
       VALUES ('Probe Moreškant', now(), now()) RETURNING id AS v`,
    )
    const user = await scalar(
      client,
      `INSERT INTO users (email, username, hash, salt, updated_at, created_at)
       VALUES ('join-probe@example.test', 'join-probe', 'x', 'y', now(), now())
       RETURNING id AS v`,
    )
    const claim = (hash) =>
      client.query(
        `INSERT INTO app_join_claims (member_id, code, secret_hash, pairing, expires_at)
         VALUES ($1, 'ABC123', $2, '473', now() + interval '2 hours')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [member, hash],
      )
    const first = await claim('hash-one')
    check('the first claim is written', first.rowCount === 1)
    const second = await claim('hash-two')
    check('a second PENDING claim for the same member is refused', second.rowCount === 0)

    await client.query(
      `UPDATE app_join_claims SET status = 'approved', user_id = $2 WHERE id = $1`,
      [first.rows[0].id, user],
    )
    const third = await claim('hash-three')
    check('a new claim IS allowed once the first was decided', third.rowCount === 1)

    // --- 3b. the expiry sweep frees the Member -------------------------------
    console.log('[probe] an unanswered claim stops blocking the Member')
    // Clear the pending row step 3 left behind, so this section starts from the
    // one state it is about: a Member with a single, expired, pending claim.
    await client.query(`UPDATE app_join_claims SET status = 'rejected' WHERE id = $1`, [
      third.rows[0].id,
    ])
    const stale = await scalar(
      client,
      `INSERT INTO app_join_claims (member_id, code, secret_hash, pairing, expires_at)
       VALUES ($1, 'ABC123', 'hash-stale', '111', now() - interval '1 minute')
       RETURNING id AS v`,
      [member],
    )
    check('the stale claim is written (it replaced the decided one)', stale != null)
    // What `insertJoinClaim` does before every INSERT.
    const swept = await client.query(
      `UPDATE app_join_claims SET status = 'expired'
        WHERE member_id = $1 AND status = 'pending' AND expires_at <= now()`,
      [member],
    )
    check('the sweep marks exactly the expired row', swept.rowCount === 1)
    const afterSweep = await claim('hash-four')
    check('the dancer can claim again once it is swept', afterSweep.rowCount === 1)
    await client.query(`UPDATE app_join_claims SET status = 'rejected' WHERE id = $1`, [
      afterSweep.rows[0].id,
    ])

    // --- 4. the secret hash is unique ---------------------------------------
    console.log('[probe] the claim secret hash is unique')
    const other = await scalar(
      client,
      `INSERT INTO members (name, updated_at, created_at)
       VALUES ('Drugi Probe', now(), now()) RETURNING id AS v`,
    )
    let duplicateRefused = false
    try {
      await client.query(
        `INSERT INTO app_join_claims (member_id, code, secret_hash, pairing, expires_at)
         VALUES ($1, 'ABC123', 'hash-three', '473', now() + interval '2 hours')`,
        [other],
      )
    } catch {
      duplicateRefused = true
    }
    check('a second claim with the same secret hash is refused', duplicateRefused)

    // --- 5. the cascades ----------------------------------------------------
    console.log('[probe] deleting a login keeps the claim, deleting a Member takes it')
    await client.query('DELETE FROM users WHERE id = $1', [user])
    check(
      'the approved claim survived its login (ON DELETE SET NULL)',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM app_join_claims WHERE id = $1 AND user_id IS NULL`,
        [first.rows[0].id],
      )) === 1,
    )

    await client.query('DELETE FROM members WHERE id = $1', [member])
    check(
      "the member's claims went with them (ON DELETE CASCADE)",
      (await scalar(client, `SELECT count(*)::int AS v FROM app_join_claims WHERE member_id = $1`, [
        member,
      ])) === 0,
    )

    // --- 6. the upgrade path: an older DB without the tables ----------------
    console.log('[probe] downgrade to the pre-#463 shape, then bootstrap again')
    await client.query('DROP TABLE IF EXISTS app_join_claims CASCADE')
    await client.query('DROP TABLE IF EXISTS app_join_codes CASCADE')

    runBootstrap(scratch.toString())
    await assertShape(client, 'upgraded')
    check(
      'the upgraded tables start empty, and nothing seeded a code',
      (await scalar(client, `SELECT count(*)::int AS v FROM app_join_codes`)) === 0,
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
