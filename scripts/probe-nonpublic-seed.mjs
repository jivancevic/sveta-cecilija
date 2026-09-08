// Integration probe for the non-public performance seed (#411, ADR-0024 phase 2).
//
// `src/lib/seed-nonpublic-performances.test.ts` guards everything the source can
// prove: the 14 rows, their shape, the guard clause. What it cannot prove is the
// behaviour that the guard exists for — that bootstrap re-applying the file on
// every restart inserts the rows exactly once, and never resurrects a
// performance the voditelj deleted. That needs a real Postgres, which the
// offline unit suite deliberately does not have. Hence this probe.
//
// It CREATES ITS OWN THROWAWAY DATABASE, runs the real
// `scripts/bootstrap-db.mjs` against it (the same code path a deploy runs), and
// DROPS it again. It never touches sveta_cecilija_dev, staging or production —
// DATABASE_URL is used only for the host/credentials of the scratch DB.
//
//   set -a && . .env.local && set +a && node scripts/probe-nonpublic-seed.mjs
//
// Asserts, in order:
//   1. first bootstrap  → exactly 14 non-public rows, correct field-for-field
//      (kind, location, client, status active, venue NULL, thresholds 8/8,
//      counters 0), and the 22 public Redovna rows are untouched;
//   2. second bootstrap → 0 new rows (the guard holds on a populated DB);
//   3. delete one row, third bootstrap → still 13, the deleted one stays gone.
//
// Exit 0 = all assertions passed; exit 1 = the seed regressed.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const { Client } = pg

const dirname = path.dirname(fileURLToPath(import.meta.url))
const bootstrap = path.join(dirname, 'bootstrap-db.mjs')

const EXPECTED = [
  ['2026-05-29', '20:30', 'koncert', 'Sv. Justina', null],
  ['2026-06-16', '10:00', 'dmc', 'Zimsko kino', 'Le Ponant'],
  ['2026-07-14', '10:30', 'gulliver', 'Zimsko kino', 'Le Bougainville'],
  ['2026-07-29', '21:30', 'ostalo', 'Spomenik sv. Todora', null],
  ['2026-08-05', '19:00', 'gulliver', 'Ljetno kino', 'Le Ponant'],
  ['2026-08-12', '19:00', 'gulliver', 'Ljetno kino', 'Le Ponant'],
  ['2026-08-13', '16:30', 'dmc', 'Zimsko kino', 'NG Orion'],
  ['2026-08-19', '19:00', 'gulliver', 'Ljetno kino', 'Le Ponant'],
  ['2026-08-20', '16:30', 'dmc', 'Zimsko kino', 'NG Orion'],
  ['2026-08-26', '19:00', 'gulliver', 'Ljetno kino', 'Le Ponant'],
  ['2026-09-08', '10:00', 'dmc', 'Zimsko kino', 'Le Ponant'],
  ['2026-09-15', '10:00', 'dmc', 'Zimsko kino', 'Le Ponant'],
  ['2026-09-22', '10:00', 'dmc', 'Zimsko kino', 'Le Ponant'],
  ['2026-10-15', '18:00', 'dmc', 'Zimsko kino', 'Lady Eleganza'],
]

let failures = 0
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`)
  }
}

// Raw pg hands back `date` as a JS Date (see the noon-UTC convention in the
// seed); take the UTC calendar day, never the local one.
const day = (d) => new Date(d).toISOString().slice(0, 10)

async function nonPublicRows(client) {
  const { rows } = await client.query(
    `SELECT date, time, kind::text AS kind, location, client, status::text AS status,
            venue::text AS venue, threshold_crni, threshold_bili,
            online_sold, in_person_sold, legacy_reserved
       FROM shows
      WHERE is_public = false
      ORDER BY date, time`,
  )
  return rows
}

function runBootstrap(url) {
  execFileSync(process.execPath, [bootstrap], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
}

async function main() {
  const source = process.env.DATABASE_URL
  if (!source) throw new Error('DATABASE_URL is not set (needed for the scratch DB host/credentials)')

  const scratchName = `probe_nonpublic_seed_${process.pid}`
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

    // --- 1. first bootstrap -------------------------------------------------
    console.log('[probe] bootstrap #1 (fresh database)')
    runBootstrap(scratch.toString())
    let rows = await nonPublicRows(client)
    check('14 non-public rows after the first run', rows.length === 14, `got ${rows.length}`)

    const actual = rows.map((r) => [day(r.date), r.time, r.kind, r.location, r.client])
    check(
      'every row matches the 2026 season table (date, time, kind, location, client)',
      JSON.stringify(actual) === JSON.stringify(EXPECTED),
      JSON.stringify(actual),
    )
    check(
      'every row is active, venue NULL, thresholds 8/8, counters 0',
      rows.every(
        (r) =>
          r.status === 'active' &&
          r.venue === null &&
          Number(r.threshold_crni) === 8 &&
          Number(r.threshold_bili) === 8 &&
          Number(r.online_sold) === 0 &&
          Number(r.in_person_sold) === 0 &&
          Number(r.legacy_reserved) === 0,
      ),
      JSON.stringify(rows[0]),
    )

    const publicCount = async () =>
      Number((await client.query('SELECT count(*)::int AS n FROM shows WHERE is_public = true')).rows[0].n)
    const publicAfterFirst = await publicCount()
    check('the 22 public Redovna rows are seeded alongside', publicAfterFirst === 22, `got ${publicAfterFirst}`)

    // --- 2. second bootstrap (a plain restart) ------------------------------
    console.log('[probe] bootstrap #2 (populated database — the restart case)')
    runBootstrap(scratch.toString())
    rows = await nonPublicRows(client)
    check('0 new rows on the second run', rows.length === 14, `got ${rows.length}`)
    check('public rows unchanged too', (await publicCount()) === 22)

    // --- 3. delete one, bootstrap again -------------------------------------
    console.log('[probe] deleting 2026-07-14 (Le Bougainville) and bootstrapping again')
    await client.query(`DELETE FROM shows WHERE is_public = false AND date::date = '2026-07-14'`)
    runBootstrap(scratch.toString())
    rows = await nonPublicRows(client)
    check('a deleted performance is NOT resurrected', rows.length === 13, `got ${rows.length}`)
    check(
      'and it is specifically the deleted one that stays gone',
      !rows.some((r) => day(r.date) === '2026-07-14'),
    )
  } finally {
    await client.end().catch(() => {})
    console.log(`[probe] dropping ${scratchName}`)
    await adminClient.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`)
    await adminClient.end()
  }

  if (failures > 0) {
    console.error(`\n[probe] FAILED — ${failures} assertion(s)`)
    process.exit(1)
  }
  console.log('\n[probe] all assertions passed')
}

main().catch((err) => {
  console.error('[probe] failed:', err.message)
  process.exit(1)
})
