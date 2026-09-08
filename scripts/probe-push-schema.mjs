// Integration probe for the push schema (#431, #435, ADR-0024 phase 4).
//
// The sibling of `probe-attendance-schema.mjs`, for the same reason: the unit
// suite proves `migrate-push.sql` writes no unguarded row mutation, but no unit
// test can prove that re-applying it on every restart is a no-op, that it
// UPGRADES an older populated database, or that the two indexes the whole
// feature hangs on actually behave — the unique `endpoint` (one row per device,
// which is what makes a subscribe an upsert) and the unique
// (performance, type) (which is what makes the cron's claim a claim). That
// needs a real Postgres.
//
// It CREATES ITS OWN THROWAWAY DATABASE, runs the real `scripts/bootstrap-db.mjs`
// against it and DROPS it again. It never touches sveta_cecilija_dev, staging or
// production — DATABASE_URL supplies only the host and credentials.
//
//   set -a && . .env.local && set +a && node scripts/probe-push-schema.mjs
//
// Asserts, in order:
//   1. fresh bootstrap  → both tables, their columns, both unique indexes and
//      the two foreign keys exist;
//   2. second bootstrap → no error, nothing duplicated (the restart case);
//   3. the endpoint index refuses a second row for the same device, and the
//      subscribe route's ON CONFLICT (endpoint) DO UPDATE moves it to the new
//      user instead;
//   4. the claim is atomic: the same INSERT … ON CONFLICT DO NOTHING returns a
//      row exactly once per (performance, type), and the two types are
//      independent;
//   5. deleting a user takes their devices with them (ON DELETE CASCADE);
//   6. downgrade to the pre-#431 shape, bootstrap again → everything is back.
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
  for (const table of ['push_subscriptions', 'performance_notifications']) {
    check(
      `${label}: the ${table} table exists`,
      (await scalar(client, `SELECT to_regclass('public.${table}')::text AS v`)) === table,
    )
  }

  for (const [table, col] of [
    ['push_subscriptions', 'user_id'],
    ['push_subscriptions', 'endpoint'],
    ['push_subscriptions', 'p256dh'],
    ['push_subscriptions', 'auth'],
    ['push_subscriptions', 'user_agent'],
    ['push_subscriptions', 'created_at'],
    ['push_subscriptions', 'last_seen_at'],
    ['performance_notifications', 'performance_id'],
    ['performance_notifications', 'type'],
    ['performance_notifications', 'claimed_at'],
    ['performance_notifications', 'devices'],
  ]) {
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

  for (const idx of [
    'push_subscriptions_endpoint_unique_idx',
    'push_subscriptions_user_idx',
    'performance_notifications_unique_idx',
  ]) {
    check(
      `${label}: index ${idx} exists`,
      (await scalar(client, `SELECT 1 AS v FROM pg_indexes WHERE indexname = $1`, [idx])) === 1,
    )
  }

  check(
    `${label}: push_subscriptions.user_id references users ON DELETE CASCADE`,
    (await scalar(
      client,
      `SELECT 1 AS v FROM pg_constraint
        WHERE conrelid = 'public.push_subscriptions'::regclass
          AND contype = 'f' AND confdeltype = 'c'`,
    )) === 1,
  )

  check(
    `${label}: performance_notifications.performance_id references shows`,
    (await scalar(
      client,
      `SELECT 1 AS v FROM pg_constraint
        WHERE conrelid = 'public.performance_notifications'::regclass
          AND contype = 'f'
          AND confrelid = 'public.shows'::regclass`,
    )) === 1,
  )
}

async function main() {
  const source = process.env.DATABASE_URL
  if (!source) throw new Error('DATABASE_URL is not set (needed for the scratch DB host/credentials)')

  const scratchName = `probe_push_schema_${process.pid}`
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
      'the endpoint index was not duplicated',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM pg_indexes
          WHERE indexname = 'push_subscriptions_endpoint_unique_idx'`,
      )) === 1,
    )

    // --- 3. one row per device ----------------------------------------------
    console.log('[probe] the unique endpoint index and the subscribe upsert')
    const cici = await scalar(
      client,
      `INSERT INTO users (username, email, hash, salt, updated_at, created_at)
       VALUES ('probe-cici', 'probe-cici@example.com', 'x', 'y', now(), now()) RETURNING id AS v`,
    )
    const bepo = await scalar(
      client,
      `INSERT INTO users (username, email, hash, salt, updated_at, created_at)
       VALUES ('probe-bepo', 'probe-bepo@example.com', 'x', 'y', now(), now()) RETURNING id AS v`,
    )

    const endpoint = 'https://fcm.googleapis.com/fcm/send/probe-device-1'
    const insert = (userId, ep) =>
      client.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'p', 'a')`,
        [userId, ep],
      )

    await insert(cici, endpoint)
    let rejected = false
    try {
      await insert(bepo, endpoint)
    } catch {
      rejected = true
    }
    check('a second row for the same endpoint is refused', rejected)

    // The subscribe route's own statement: the same device, a new account.
    await client.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, 'p2', 'a2')
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth, last_seen_at = now()`,
      [bepo, endpoint],
    )
    check(
      'the upsert moves the device to the new account instead of duplicating it',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
        [endpoint, bepo],
      )) === 1 &&
        (await scalar(client, `SELECT count(*)::int AS v FROM push_subscriptions`)) === 1,
    )

    // A dancer's second device is a second row, and both are supposed to ring.
    await insert(bepo, `${endpoint}-tablet`)
    check(
      'a second device of the same account is a second row',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM push_subscriptions WHERE user_id = $1`,
        [bepo],
      )) === 2,
    )

    // --- 4. the once-per-performance claim ----------------------------------
    console.log('[probe] the atomic (performance, type) claim')
    const show = await scalar(
      client,
      `INSERT INTO shows (date, time, kind, is_public, status, threshold_crni, threshold_bili, updated_at, created_at)
       VALUES ('2026-08-05', '21:00', 'redovna', true, 'active', 8, 8, now(), now())
       RETURNING id AS v`,
    )
    const claim = (showId, type) =>
      client.query(
        `INSERT INTO performance_notifications (performance_id, type)
         VALUES ($1, $2) ON CONFLICT (performance_id, type) DO NOTHING RETURNING id`,
        [showId, type],
      )

    check('the first claim wins the insert', (await claim(show, 'alarm')).rows.length === 1)
    check('the second claim returns nothing', (await claim(show, 'alarm')).rows.length === 0)
    check(
      'the reminder is a separate claim on the same performance',
      (await claim(show, 'reminder')).rows.length === 1,
    )
    check(
      'a released claim can be taken again',
      await (async () => {
        await client.query(
          `DELETE FROM performance_notifications WHERE performance_id = $1 AND type = 'alarm'`,
          [show],
        )
        return (await claim(show, 'alarm')).rows.length === 1
      })(),
    )

    // --- 5. cascade ----------------------------------------------------------
    console.log('[probe] deleting an account takes its devices with it')
    await client.query(`DELETE FROM users WHERE id = $1`, [bepo])
    check(
      'push_subscriptions rows are gone with the user',
      (await scalar(client, `SELECT count(*)::int AS v FROM push_subscriptions`)) === 0,
    )

    // --- 6. the upgrade path: an older DB without the tables ----------------
    console.log('[probe] downgrade to the pre-#431 shape, then bootstrap again')
    await client.query('DROP TABLE IF EXISTS push_subscriptions CASCADE')
    await client.query('DROP TABLE IF EXISTS performance_notifications CASCADE')

    runBootstrap(scratch.toString())
    await assertShape(client, 'upgraded')
    check(
      'the upgraded tables start empty, and nothing seeded a fake device',
      (await scalar(client, `SELECT count(*)::int AS v FROM push_subscriptions`)) === 0 &&
        (await scalar(client, `SELECT count(*)::int AS v FROM performance_notifications`)) === 0,
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
