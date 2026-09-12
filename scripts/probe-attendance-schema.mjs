// Integration probe for the attendance schema (#422, ADR-0024 phase 3).
//
// The sibling of `probe-moreskant-schema.mjs`, for the same reason: the unit
// suite proves the migration writes no unguarded row mutation and the drift
// gate proves `db/schema/` reproduces what Payload push needs, but neither can
// prove that re-applying `migrate-zz-attendance.sql` on every restart is a
// no-op, that it UPGRADES an older populated database, or that the unique
// (performance, member) index — the key the whole upsert hangs on — actually
// refuses a second answer. That needs a real Postgres.
//
// It CREATES ITS OWN THROWAWAY DATABASE, runs the real `scripts/bootstrap-db.mjs`
// against it and DROPS it again. It never touches sveta_cecilija_dev, staging or
// production — DATABASE_URL supplies only the host and credentials.
//
//   set -a && . .env.local && set +a && node scripts/probe-attendance-schema.mjs
//
// Asserts, in order:
//   1. fresh bootstrap  → the two enums, the table, Payload's indexes, the
//      unique index, the three FKs and the document-lock column all exist;
//   2. second bootstrap → no error, nothing duplicated (the restart case);
//   3. the unique index refuses a second answer for the same pair, while a
//      different moreškant and a different performance are fine;
//   4. downgrade to the pre-#422 shape, bootstrap again → everything is back.
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
  for (const [type, size] of [
    ['enum_attendance_status', 2],
    ['enum_attendance_army', 2],
  ]) {
    check(
      `${label}: type ${type} exists with ${size} values`,
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1`,
        [type],
      )) === size,
    )
  }

  check(
    `${label}: the attendance table exists`,
    (await scalar(client, `SELECT to_regclass('public.attendance')::text AS v`)) === 'attendance',
  )

  for (const col of [
    'performance_id',
    'member_id',
    'status',
    'army',
    'answered_by_id',
    'answered_at',
  ]) {
    check(
      `${label}: attendance.${col} exists`,
      (await scalar(
        client,
        `SELECT 1 AS v FROM information_schema.columns
          WHERE table_name = 'attendance' AND column_name = $1`,
        [col],
      )) === 1,
    )
  }

  for (const idx of [
    'attendance_performance_idx',
    'attendance_member_idx',
    'attendance_answered_by_idx',
    'attendance_performance_member_unique_idx',
  ]) {
    check(
      `${label}: index ${idx} exists`,
      (await scalar(client, `SELECT 1 AS v FROM pg_indexes WHERE indexname = $1`, [idx])) === 1,
    )
  }

  for (const fk of [
    'attendance_performance_id_shows_id_fk',
    'attendance_member_id_members_id_fk',
    'attendance_answered_by_id_users_id_fk',
    'payload_locked_documents_rels_attendance_fk',
  ]) {
    check(
      `${label}: constraint ${fk} exists`,
      (await scalar(client, `SELECT 1 AS v FROM pg_constraint WHERE conname = $1`, [fk])) === 1,
    )
  }

  check(
    `${label}: payload_locked_documents_rels.attendance_id exists`,
    (await scalar(
      client,
      `SELECT 1 AS v FROM information_schema.columns
        WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'attendance_id'`,
    )) === 1,
  )
}

async function main() {
  const source = process.env.DATABASE_URL
  if (!source) throw new Error('DATABASE_URL is not set (needed for the scratch DB host/credentials)')

  const scratchName = `probe_attendance_schema_${process.pid}`
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
      'the unique index was not duplicated',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM pg_indexes
          WHERE indexname = 'attendance_performance_member_unique_idx'`,
      )) === 1,
    )

    // --- 3. one answer per moreškant per performance ------------------------
    console.log('[probe] the unique (performance, member) index')
    const show = await scalar(
      client,
      `INSERT INTO shows (date, time, kind, is_public, status, threshold_crni, threshold_bili, updated_at, created_at)
       VALUES ('2026-08-05', '21:00', 'redovna', true, 'active', 8, 8, now(), now())
       RETURNING id AS v`,
    )
    const show2 = await scalar(
      client,
      `INSERT INTO shows (date, time, kind, is_public, status, threshold_crni, threshold_bili, updated_at, created_at)
       VALUES ('2026-08-06', '21:00', 'redovna', true, 'active', 8, 8, now(), now())
       RETURNING id AS v`,
    )
    const cici = await scalar(
      client,
      `INSERT INTO members (name, is_moreskant, nickname, updated_at, created_at)
       VALUES ('Ivan Fabris', true, 'Cici', now(), now()) RETURNING id AS v`,
    )
    const bepo = await scalar(
      client,
      `INSERT INTO members (name, is_moreskant, nickname, updated_at, created_at)
       VALUES ('Josip Bepo', true, 'Bepo', now(), now()) RETURNING id AS v`,
    )

    const answer = (showId, memberId, status) =>
      client.query(
        `INSERT INTO attendance (performance_id, member_id, status, army, answered_at, updated_at, created_at)
         VALUES ($1, $2, $3, 'crni', now(), now(), now())`,
        [showId, memberId, status],
      )

    await answer(show, cici, 'coming')
    let rejected = false
    try {
      await answer(show, cici, 'not_coming')
    } catch {
      rejected = true
    }
    check('a second answer for the same (performance, moreškant) is refused', rejected)

    await answer(show, bepo, 'coming')
    await answer(show2, cici, 'coming')
    check(
      'another moreškant and another performance are unaffected',
      (await scalar(client, `SELECT count(*)::int AS v FROM attendance`)) === 3,
    )

    // --- 4. the upgrade path: an older DB without the table -----------------
    console.log('[probe] downgrade to the pre-#422 shape, then bootstrap again')
    await client.query('DROP TABLE IF EXISTS attendance CASCADE')
    await client.query(
      'ALTER TABLE payload_locked_documents_rels DROP COLUMN IF EXISTS attendance_id',
    )
    await client.query('DROP TYPE IF EXISTS enum_attendance_status')
    await client.query('DROP TYPE IF EXISTS enum_attendance_army')

    runBootstrap(scratch.toString())
    await assertShape(client, 'upgraded')
    check(
      'the upgraded table starts empty, and nothing seeded fake answers',
      (await scalar(client, `SELECT count(*)::int AS v FROM attendance`)) === 0,
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
