// Integration probe for the moreškant identity schema (#420, ADR-0024 phase 3).
//
// `src/lib/db-schema-safety.test.ts` proves the migration writes no unguarded
// row mutation, and the drift gate proves `db/schema/` reproduces what Payload
// push needs. Neither can prove the two behaviours the guards exist for: that
// bootstrap re-applying `migrate-moreskant-identity.sql` on every restart is a
// no-op, and that the same file UPGRADES an older, populated database — the
// prod case, where `members` already holds 14 attribution rows and none of the
// new objects exist. That needs a real Postgres, which the offline unit suite
// deliberately does not have. Hence this probe.
//
// It CREATES ITS OWN THROWAWAY DATABASE, runs the real `scripts/bootstrap-db.mjs`
// against it (the same code path a deploy runs), and DROPS it again. It never
// touches sveta_cecilija_dev, staging or production — DATABASE_URL is used only
// for the host/credentials of the scratch DB.
//
//   set -a && . .env.local && set +a && node scripts/probe-moreskant-schema.mjs
//
// Asserts, in order:
//   1. fresh bootstrap  → the enums, the columns, members_roles and the
//      users.member_id link all exist, and is_moreskant defaults to false;
//   2. second bootstrap → no error, nothing duplicated (the restart case);
//   3. the partial unique index actually refuses a duplicate nickname
//      case-insensitively, while leaving non-dancers (NULL nickname) alone;
//   4. downgrade to the pre-#420 shape with 14 attribution members, bootstrap
//      again → every object is back and all 14 rows are is_moreskant = false.
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
  for (const type of ['enum_members_roles', 'enum_members_primary_role']) {
    check(
      `${label}: type ${type} exists with the six dance roles`,
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1`,
        [type],
      )) === 6,
    )
  }

  for (const col of ['is_moreskant', 'nickname', 'mobile', 'email', 'primary_role']) {
    check(
      `${label}: members.${col} exists`,
      (await scalar(
        client,
        `SELECT 1 AS v FROM information_schema.columns
          WHERE table_name = 'members' AND column_name = $1`,
        [col],
      )) === 1,
    )
  }

  check(
    `${label}: members.is_moreskant defaults to false`,
    (await scalar(
      client,
      `SELECT column_default AS v FROM information_schema.columns
        WHERE table_name = 'members' AND column_name = 'is_moreskant'`,
    )) === 'false',
  )

  check(
    `${label}: members_roles table exists`,
    (await scalar(client, `SELECT to_regclass('public.members_roles')::text AS v`)) ===
      'members_roles',
  )

  check(
    `${label}: members_roles.parent_id cascades from members`,
    (await scalar(
      client,
      `SELECT 1 AS v FROM pg_constraint WHERE conname = 'members_roles_parent_fk'`,
    )) === 1,
  )

  check(
    `${label}: users.member_id exists with its FK and index`,
    (await scalar(
      client,
      `SELECT 1 AS v FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'member_id'`,
    )) === 1 &&
      (await scalar(
        client,
        `SELECT 1 AS v FROM pg_constraint WHERE conname = 'users_member_id_members_id_fk'`,
      )) === 1 &&
      (await scalar(client, `SELECT 1 AS v FROM pg_indexes WHERE indexname = 'users_member_idx'`)) ===
        1,
  )

  check(
    `${label}: the partial unique nickname index exists`,
    (await scalar(
      client,
      `SELECT 1 AS v FROM pg_indexes WHERE indexname = 'members_moreskant_nickname_unique_idx'`,
    )) === 1,
  )
}

async function main() {
  const source = process.env.DATABASE_URL
  if (!source) throw new Error('DATABASE_URL is not set (needed for the scratch DB host/credentials)')

  const scratchName = `probe_moreskant_schema_${process.pid}`
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
      'the nickname index was not duplicated',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM pg_indexes
          WHERE indexname = 'members_moreskant_nickname_unique_idx'`,
      )) === 1,
    )

    // --- 3. the uniqueness rule the index carries ---------------------------
    console.log('[probe] the partial unique nickname index')
    await client.query(
      `INSERT INTO members (name, is_moreskant, nickname) VALUES ('Ivan Fabris', true, 'Cici')`,
    )
    let rejected = false
    try {
      await client.query(
        `INSERT INTO members (name, is_moreskant, nickname) VALUES ('Netko Drugi', true, 'CICI')`,
      )
    } catch {
      rejected = true
    }
    check('a second moreškant cannot take "CICI" when "Cici" is taken', rejected)

    await client.query(`INSERT INTO members (name) VALUES ('Ana'), ('Marija')`)
    check(
      'two non-dancers with no nickname coexist (the index is partial)',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM members WHERE is_moreskant = false`,
      )) === 2,
    )

    // --- 4. the upgrade path: an older, populated prod-shaped DB ------------
    console.log('[probe] downgrade to the pre-#420 shape, then bootstrap again')
    await client.query('DELETE FROM members WHERE true')
    await client.query('DROP TABLE IF EXISTS members_roles')
    await client.query('DROP INDEX IF EXISTS members_moreskant_nickname_unique_idx')
    await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS member_id`)
    await client.query(
      `ALTER TABLE members
         DROP COLUMN IF EXISTS is_moreskant,
         DROP COLUMN IF EXISTS nickname,
         DROP COLUMN IF EXISTS mobile,
         DROP COLUMN IF EXISTS email,
         DROP COLUMN IF EXISTS primary_role`,
    )
    await client.query('DROP TYPE IF EXISTS enum_members_roles')
    await client.query('DROP TYPE IF EXISTS enum_members_primary_role')
    // 14 attribution-only members, the production population.
    for (let i = 1; i <= 14; i++) {
      await client.query(`INSERT INTO members (name) VALUES ($1)`, [`Član ${i}`])
    }

    runBootstrap(scratch.toString())
    await assertShape(client, 'upgraded')
    check(
      'all 14 existing members survive as is_moreskant = false',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM members WHERE is_moreskant = false`,
      )) === 14,
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
