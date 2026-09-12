// Integration probe for the lineup schema (#432, ADR-0024 phase 4).
//
// The sibling of `probe-attendance-schema.mjs`, for the same reason: the unit
// suite proves the migration writes no unguarded row mutation and the drift
// gate proves `db/schema/` reproduces what Payload push needs, but neither can
// prove that re-applying `migrate-zz-b-lineups.sql` on every restart is a no-op,
// that it UPGRADES an older populated database, or that the unique
// (performance, member) index — the one role per dancer per evening the
// statistics count on — actually refuses a second row.
//
// It also proves the fact that makes the cascade hooks necessary rather than
// decorative: the FKs are ON DELETE SET NULL on NOT NULL columns, so deleting a
// performance that still has a postava fails in the DATABASE.
//
// It CREATES ITS OWN THROWAWAY DATABASE, runs the real `scripts/bootstrap-db.mjs`
// against it and DROPS it again. It never touches sveta_cecilija_dev, staging or
// production — DATABASE_URL supplies only the host and credentials.
//
//   set -a && . .env.local && set +a && node scripts/probe-lineup-schema.mjs
//
// Asserts, in order:
//   1. fresh bootstrap  → the enum, the table, Payload's indexes, the unique
//      index, the two FKs, the document-lock column and the two Shows columns;
//   2. second bootstrap → no error, nothing duplicated (the restart case);
//   3. the unique index refuses a second role for the same pair, while another
//      dancer and another performance are fine;
//   4. deleting a performance or a member with lineup rows is refused by the
//      NOT NULL columns (why the beforeDelete hooks exist);
//   5. downgrade to the pre-#432 shape, bootstrap again → everything is back.
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
  check(
    `${label}: type enum_lineups_role exists with 6 values`,
    (await scalar(
      client,
      `SELECT count(*)::int AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'enum_lineups_role'`,
    )) === 6,
  )

  check(
    `${label}: the lineups table exists`,
    (await scalar(client, `SELECT to_regclass('public.lineups')::text AS v`)) === 'lineups',
  )

  for (const col of ['performance_id', 'member_id', 'role']) {
    check(
      `${label}: lineups.${col} exists`,
      (await scalar(
        client,
        `SELECT 1 AS v FROM information_schema.columns
          WHERE table_name = 'lineups' AND column_name = $1`,
        [col],
      )) === 1,
    )
  }

  for (const col of ['lineup_confirmed', 'lineup_confirmed_at']) {
    check(
      `${label}: shows.${col} exists`,
      (await scalar(
        client,
        `SELECT 1 AS v FROM information_schema.columns
          WHERE table_name = 'shows' AND column_name = $1`,
        [col],
      )) === 1,
    )
  }

  for (const idx of [
    'lineups_performance_idx',
    'lineups_member_idx',
    'lineups_performance_member_unique_idx',
  ]) {
    check(
      `${label}: index ${idx} exists`,
      (await scalar(client, `SELECT 1 AS v FROM pg_indexes WHERE indexname = $1`, [idx])) === 1,
    )
  }

  for (const fk of [
    'lineups_performance_id_shows_id_fk',
    'lineups_member_id_members_id_fk',
    'payload_locked_documents_rels_lineups_fk',
  ]) {
    check(
      `${label}: constraint ${fk} exists`,
      (await scalar(client, `SELECT 1 AS v FROM pg_constraint WHERE conname = $1`, [fk])) === 1,
    )
  }

  check(
    `${label}: payload_locked_documents_rels.lineups_id exists`,
    (await scalar(
      client,
      `SELECT 1 AS v FROM information_schema.columns
        WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'lineups_id'`,
    )) === 1,
  )
}

async function main() {
  const source = process.env.DATABASE_URL
  if (!source) throw new Error('DATABASE_URL is not set (needed for the scratch DB host/credentials)')

  const scratchName = `probe_lineup_schema_${process.pid}`
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
          WHERE indexname = 'lineups_performance_member_unique_idx'`,
      )) === 1,
    )
    check(
      'lineup_confirmed defaults to false: an evening nobody confirmed is a draft',
      (await scalar(
        client,
        `SELECT column_default AS v FROM information_schema.columns
          WHERE table_name = 'shows' AND column_name = 'lineup_confirmed'`,
      )) === 'false',
    )

    // --- 3. one role per moreškant per performance --------------------------
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

    const place = (showId, memberId, role) =>
      client.query(
        `INSERT INTO lineups (performance_id, member_id, role, updated_at, created_at)
         VALUES ($1, $2, $3, now(), now())`,
        [showId, memberId, role],
      )

    await place(show, cici, 'crni_kralj')
    let rejected = false
    try {
      await place(show, cici, 'crni')
    } catch {
      rejected = true
    }
    check('a second role for the same (performance, moreškant) is refused', rejected)

    await place(show, bepo, 'bili')
    await place(show2, cici, 'crni')
    check(
      'another moreškant and another performance are unaffected',
      (await scalar(client, `SELECT count(*)::int AS v FROM lineups`)) === 3,
    )

    // --- 4. why the beforeDelete cascade hooks exist ------------------------
    console.log('[probe] SET NULL on a NOT NULL column: the database refuses the delete')
    let showDeleteRefused = false
    try {
      await client.query('DELETE FROM shows WHERE id = $1', [show])
    } catch {
      showDeleteRefused = true
    }
    check(
      'deleting a performance that still has lineup rows is refused (cascadeShowLineupDelete)',
      showDeleteRefused,
    )
    let memberDeleteRefused = false
    try {
      await client.query('DELETE FROM members WHERE id = $1', [bepo])
    } catch {
      memberDeleteRefused = true
    }
    check(
      'deleting a member who is in a lineup is refused (cascadeMemberLineupDelete)',
      memberDeleteRefused,
    )

    // --- 5. the upgrade path: an older DB without the table -----------------
    console.log('[probe] downgrade to the pre-#432 shape, then bootstrap again')
    await client.query('DROP TABLE IF EXISTS lineups CASCADE')
    await client.query('ALTER TABLE payload_locked_documents_rels DROP COLUMN IF EXISTS lineups_id')
    await client.query('DROP TYPE IF EXISTS enum_lineups_role')
    await client.query('ALTER TABLE shows DROP COLUMN IF EXISTS lineup_confirmed')
    await client.query('ALTER TABLE shows DROP COLUMN IF EXISTS lineup_confirmed_at')

    runBootstrap(scratch.toString())
    await assertShape(client, 'upgraded')
    check(
      'the upgraded table starts empty, and nothing seeded a fake postava',
      (await scalar(client, `SELECT count(*)::int AS v FROM lineups`)) === 0,
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
