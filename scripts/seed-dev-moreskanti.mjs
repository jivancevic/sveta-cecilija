#!/usr/bin/env node
//
// seed-dev-moreskanti.mjs — sample roster data for a DEVELOPER's database.
//
// A fresh worktree has 14 comp-attribution Members and no dancers, so `/app`
// opens on an empty screen and nothing about the roster can be seen without
// half an hour of hand entry. This script flags a handful of sample moreškanti,
// gives them nicknames, dance roles and mobiles, links the dev test logins that
// already exist, and answers a few performances of the season.
//
//   set -a && . ./.env.local && set +a && node scripts/seed-dev-moreskanti.mjs
//
// SAFETY GUARD
// ------------
// It refuses to run unless the database in DATABASE_URL is named EXACTLY
// `sveta_cecilija_dev`. Production is `sveta_cecilija` and staging carries
// "staging", so neither can ever be reached from here even by pasting the wrong
// URL. Fake dancers must never exist in production (#419, story 46), which is
// also why this lives in `scripts/` and NOT in `db/schema/`: bootstrap-db.mjs
// re-applies every file in that directory on every restart, production
// included.
//
// IDEMPOTENT BY CONSTRUCTION
// --------------------------
// Every write is keyed and re-runnable:
//   - members  — matched by their (recognizably fake) name; inserted once, then
//                only the roster fields are refreshed. `email` is filled only
//                when empty, so an address you typed by hand to test the
//                invitation survives a re-run.
//   - roles    — deleted and re-inserted for the sample members only.
//   - users    — the existing dev test logins are linked to their member when
//                the link is missing. NO login is created and no password is
//                touched: an invitation is what creates a dancer's login
//                (#424), and this script is not one.
//   - lineups  — one CONFIRMED postava and one DRAFT, so both halves of #432
//                are visible without typing: `ON CONFLICT DO NOTHING` on the
//                same unique pair, and the confirmation flag is only set when
//                the performance has no postava yet, so a lineup you edited in
//                the app is never re-locked under you.
//   - answers  — `ON CONFLICT (performance_id, member_id) DO NOTHING`, so an
//                answer you changed in the app stays changed. They land on the
//                next performances of the season (the ones a dancer sees under
//                Nadolazeće), falling back to the last ones once the season is
//                over.
// Nothing is ever deleted except the sample members' own role rows.

import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const DEV_DB_NAME = 'sveta_cecilija_dev'

// The sample roster. Names carry "(test)" so no real member can be confused
// with one, emails are @example.com by RFC 2606, mobiles are the Croatian
// documentation prefix. The role sets deliberately cover every rule the army
// count knows: a king (counts as crni), an otmanović (also crni), a plain bili,
// a two-army dancer, and a bula (counts in neither).
const SAMPLE_MEMBERS = [
  {
    name: 'Ivan Fabris (test)',
    nickname: 'Cici',
    mobile: '+385 99 000 0001',
    email: 'cici@example.com',
    roles: ['crni', 'crni_kralj'],
    primaryRole: 'crni_kralj',
    /** The dev login that should point at this member, when it exists. */
    username: 'cici-test',
  },
  {
    name: 'Grgo Dvojac (test)',
    nickname: 'Grgo',
    mobile: '+385 99 000 0002',
    email: 'grgo@example.com',
    // Both armies: the voditelj decides which one on the night.
    roles: ['crni', 'bili'],
    primaryRole: 'crni',
  },
  {
    name: 'Bepo Gost (test)',
    nickname: 'Bepo',
    mobile: '+385 99 000 0003',
    email: 'bepo@example.com',
    roles: ['bili', 'bili_kralj'],
    primaryRole: 'bili_kralj',
  },
  {
    name: 'Dado Bili (test)',
    nickname: 'Dado',
    mobile: '+385 99 000 0004',
    email: 'dado@example.com',
    roles: ['bili'],
    primaryRole: 'bili',
  },
  {
    name: 'Ante Otman (test)',
    nickname: 'Otman',
    mobile: '+385 99 000 0005',
    roles: ['crni', 'otmanovic'],
    primaryRole: 'otmanovic',
    email: 'otman@example.com',
  },
  {
    name: 'Mare Bula (test)',
    nickname: 'Mare',
    mobile: '+385 99 000 0006',
    roles: ['bula'],
    primaryRole: 'bula',
    email: 'mare@example.com',
  },
]

// Who answers what on the next performances of the season. Index 0 is the next
// one, and the list stops wherever the season does. Nicknames not listed for a
// performance are left with NO answer, which is the state the voditelj's
// buttons exist for.
const SAMPLE_ANSWERS = [
  { Cici: 'coming', Grgo: 'coming', Bepo: 'coming', Dado: 'not_coming', Mare: 'coming' },
  { Cici: 'coming', Otman: 'coming', Dado: 'coming' },
  { Bepo: 'not_coming' },
]

// The two sample postave (#432). Index 0 is the next performance of the season
// and gets a CONFIRMED lineup, so `/app/statistika` has something to count and a
// dancer has a confirmed postava to look at; index 1 stays a DRAFT, which is
// what a moreškant must NOT see. Roles are deliberately mixed: Cici dances his
// own crni_kralj, and Dado is down as a bula he has no role for, so the warning
// line shows up in the editor without any typing.
const SAMPLE_LINEUPS = [
  { confirmed: true, entries: { Cici: 'crni_kralj', Grgo: 'bili', Otman: 'otmanovic', Mare: 'bula', Dado: 'bili' } },
  { confirmed: false, entries: { Cici: 'crni', Bepo: 'bili_kralj', Dado: 'bula' } },
]

/** The army a role counts in; `bula` counts in neither (CONTEXT.md, Army count). */
const ARMY_OF_ROLE = {
  crni: 'crni',
  crni_kralj: 'crni',
  otmanovic: 'crni',
  bili: 'bili',
  bili_kralj: 'bili',
  bula: null,
}

function databaseNameOf(url) {
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return ''
  }
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set. Run: set -a && . ./.env.local && set +a && node scripts/seed-dev-moreskanti.mjs')
    process.exit(1)
  }
  const dbName = databaseNameOf(url)
  if (dbName !== DEV_DB_NAME) {
    console.error(
      `Refusing to run: the database is "${dbName}", not "${DEV_DB_NAME}". ` +
        'Sample dancers belong on a developer database and nowhere else.',
    )
    process.exit(1)
  }

  const client = new Client({ connectionString: url })
  await client.connect()

  let created = 0
  let refreshed = 0
  const idByNickname = new Map()

  try {
    await client.query('BEGIN')

    for (const m of SAMPLE_MEMBERS) {
      const existing = await client.query('SELECT id, email FROM members WHERE name = $1 LIMIT 1', [
        m.name,
      ])
      let id
      if (existing.rows.length === 0) {
        const inserted = await client.query(
          `INSERT INTO members (name, active, is_moreskant, nickname, mobile, email, primary_role)
           VALUES ($1, true, true, $2, $3, $4, $5) RETURNING id`,
          [m.name, m.nickname, m.mobile, m.email, m.primaryRole],
        )
        id = inserted.rows[0].id
        created++
      } else {
        id = existing.rows[0].id
        await client.query(
          `UPDATE members
              SET active = true,
                  is_moreskant = true,
                  nickname = $2,
                  mobile = $3,
                  -- Keep an address typed by hand (an invitation test inbox).
                  email = COALESCE(NULLIF(email, ''), $4),
                  primary_role = $5,
                  updated_at = now()
            WHERE id = $1`,
          [id, m.nickname, m.mobile, m.email, m.primaryRole],
        )
        refreshed++
      }
      idByNickname.set(m.nickname, id)

      await client.query('DELETE FROM members_roles WHERE parent_id = $1', [id])
      let order = 1
      for (const role of m.roles) {
        await client.query(
          'INSERT INTO members_roles ("order", parent_id, value) VALUES ($1, $2, $3)',
          [order++, id, role],
        )
      }
    }

    // Link the dev test logins that already exist. Never create one: that is
    // what the invitation does, and creating a login here would hide the very
    // flow a developer wants to try.
    let linked = 0
    for (const m of SAMPLE_MEMBERS) {
      if (!m.username) continue
      const res = await client.query(
        'UPDATE users SET member_id = $1, updated_at = now() WHERE username = $2 AND member_id IS DISTINCT FROM $1',
        [idByNickname.get(m.nickname), m.username],
      )
      linked += res.rowCount ?? 0
    }

    // A voditelj to credit the answers to, when the dev DB has one.
    const voditelj = await client.query(
      `SELECT u.id FROM users u
         JOIN users_permissions p ON p.parent_id = u.id AND p.value = 'moreska'
        ORDER BY u.id LIMIT 1`,
    )
    const answeredBy = voditelj.rows[0]?.id ?? null

    // The next performances of the current season, public or not: a dancer's
    // evening is an evening either way (ADR-0024).
    //
    // "Next", not "first": the sample answers exist to be seen on the
    // Nadolazeće tab, and a script run in September that answered the May
    // performances would file every one of them under Prošle. The date is
    // compared in Europe/Zagreb, the same clock `/app` splits upcoming from
    // past on. Late in the season nothing is upcoming any more, so it falls
    // back to the LAST performances instead: a demo with answers under Prošle
    // beats a demo with none at all.
    const season = new Date().getFullYear()
    const upcoming = await client.query(
      `SELECT id FROM shows
        WHERE EXTRACT(YEAR FROM date) = $1
          AND status <> 'cancelled'
          AND date >= (now() AT TIME ZONE 'Europe/Zagreb')::date
        ORDER BY date, time
        LIMIT $2`,
      [season, SAMPLE_ANSWERS.length],
    )
    const performances =
      upcoming.rows.length > 0
        ? upcoming
        : await client.query(
            `SELECT id FROM (
               SELECT id, date, time FROM shows
                WHERE EXTRACT(YEAR FROM date) = $1 AND status <> 'cancelled'
                ORDER BY date DESC, time DESC
                LIMIT $2
             ) AS last_of_season
             ORDER BY date, time`,
            [season, SAMPLE_ANSWERS.length],
          )

    let answers = 0
    for (let i = 0; i < performances.rows.length; i++) {
      const performanceId = performances.rows[i].id
      for (const [nickname, status] of Object.entries(SAMPLE_ANSWERS[i] ?? {})) {
        const memberId = idByNickname.get(nickname)
        if (!memberId) continue
        const member = SAMPLE_MEMBERS.find((m) => m.nickname === nickname)
        const army = status === 'coming' ? ARMY_OF_ROLE[member.primaryRole] : null
        const res = await client.query(
          `INSERT INTO attendance (performance_id, member_id, status, army, answered_by_id, answered_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (performance_id, member_id) DO NOTHING`,
          [performanceId, memberId, status, army, answeredBy],
        )
        answers += res.rowCount ?? 0
      }
    }

    // The two sample postave. The confirmation is only applied to a performance
    // that has no lineup rows yet, so a re-run never re-locks one you unlocked.
    let lineupRows = 0
    let confirmed = 0
    for (let i = 0; i < performances.rows.length && i < SAMPLE_LINEUPS.length; i++) {
      const performanceId = performances.rows[i].id
      const sample = SAMPLE_LINEUPS[i]
      const existing = await client.query(
        'SELECT 1 FROM lineups WHERE performance_id = $1 LIMIT 1',
        [performanceId],
      )
      const fresh = existing.rows.length === 0
      for (const [nickname, role] of Object.entries(sample.entries)) {
        const memberId = idByNickname.get(nickname)
        if (!memberId) continue
        const res = await client.query(
          `INSERT INTO lineups (performance_id, member_id, role, updated_at, created_at)
           VALUES ($1, $2, $3, now(), now())
           ON CONFLICT (performance_id, member_id) DO NOTHING`,
          [performanceId, memberId, role],
        )
        lineupRows += res.rowCount ?? 0
      }
      if (fresh) {
        const res = await client.query(
          `UPDATE shows
              SET lineup_confirmed = $2,
                  lineup_confirmed_at = CASE WHEN $2 THEN now() ELSE NULL END,
                  updated_at = now()
            WHERE id = $1`,
          [performanceId, sample.confirmed],
        )
        if (sample.confirmed) confirmed += res.rowCount ?? 0
      }
    }

    await client.query('COMMIT')

    console.log(
      [
        `Database:       ${dbName}`,
        `Members:        ${created} created, ${refreshed} refreshed (${SAMPLE_MEMBERS.length} sample moreškanti)`,
        `Logins linked:  ${linked}`,
        `Answers added:  ${answers} on ${performances.rows.length} performance(s)`,
        `Lineup rows:    ${lineupRows} added, ${confirmed} performance(s) confirmed`,
        '',
        'Re-run me: the counts for created, linked and answers go to 0 and nothing else moves.',
      ].join('\n'),
    )
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    await client.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
