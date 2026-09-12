#!/usr/bin/env node
//
// import-moreskanti-2026.mjs — one-shot import of the 2026 active roster:
// 76 moreškanti and bule, supplied by the voditelj.
//
//   set -a && . ./.env.local && set +a && node scripts/import-moreskanti-2026.mjs --dry-run
//   set -a && . ./.env.local && set +a && node scripts/import-moreskanti-2026.mjs
//
// The list came as names, nicknames and dance roles. The mobiles came from the
// president's own phone book (the contacts tagged `#cecilija`), matched by full
// name first and by nickname only where a contact was filed that way. Eight
// bule have no number on file and are imported without one; a mobile is
// optional on a moreškant profile. No email is imported, so nobody here can be
// invited yet — that waits for the passwordless invitation (#463).
//
// WHY IT MERGES INSTEAD OF INSERTING
// ----------------------------------
// Twelve of the fourteen Members already in production are people on this list,
// and they carry comp-ticket attribution (ADR-0019) — thirty-eight orders point
// at one of them. Inserting blindly would give those people a second row and
// split their attribution from their dancer profile. So a row is matched by
// EXACT name and updated in place; only genuinely new people are inserted.
// Tatjana Vigna and Edon Krasniqi are not on the roster and are left untouched,
// as comp-attribution names who were never dancers.
//
// WHERE THE RULES ARE CHECKED
// ---------------------------
// Raw SQL bypasses the Members `beforeValidate` hook, so the roster below is
// validated by `src/lib/roster-2026.test.ts`, which feeds every row to the real
// `validateAndNormaliseMoreskant` from src/lib/moreskant-profile.ts. The rules
// are therefore enforced by the same code the admin uses, in CI, without this
// script re-typing the dance-role vocabulary. (`payload run` and `tsx` both
// fail to load the Payload config in this repo, which is why every sibling
// script in scripts/ talks to pg directly.) The database backs this up with a
// unique index on lower(nickname) where is_moreskant.
//
// NOT IN db/schema/
// -----------------
// That directory re-runs on every restart and holds schema evolution, not
// one-time data (db/schema/README.md).
//
// IDEMPOTENT BY CONSTRUCTION
// --------------------------
// Keyed by name, so a second run rewrites the same values and changes nothing.
// `note` and `email` are never written: an address typed by hand in the admin
// to send an invitation survives a re-run, and so does any comp-reporting note.
// Everything happens in one transaction.

import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

/** Databases this script is willing to write to. Staging carries "staging". */
const ALLOWED_DB = new Set(['sveta_cecilija', 'sveta_cecilija_dev'])

// The roster, exactly as supplied. `active: false` marks a moreškant who is
// kept in the system but is not dancing this season: they stay out of the
// lineup and attendance pickers without losing their history.
export const ROSTER = [
  { name: 'Bartul Divić', nickname: 'Baro', mobile: '+385918882601', primaryRole: 'crni_kralj', roles: ['crni_kralj', 'crni', 'otmanovic'] },
  { name: 'Ivan Fabris', nickname: 'Cici', mobile: '+385981853040', primaryRole: 'crni_kralj', roles: ['crni_kralj', 'crni', 'bili', 'bili_kralj', 'otmanovic'] },
  { name: 'Josip Ivančević', nickname: 'Josip I.', mobile: '+385915162223', primaryRole: 'crni_kralj', roles: ['crni_kralj', 'crni', 'bili', 'bili_kralj', 'otmanovic'] },
  { name: 'Ratko Ojdanić', nickname: 'Ratko', mobile: '+385919445543', primaryRole: 'crni_kralj', roles: ['crni_kralj', 'crni', 'otmanovic'] },
  { name: 'Frano Filippi', nickname: 'Frano F.', mobile: '+385917340189', primaryRole: 'crni_kralj', roles: ['crni_kralj', 'crni', 'otmanovic'] },
  { name: 'Martin Bošković', nickname: 'Martin B.', mobile: '+385993744381', primaryRole: 'crni_kralj', roles: ['crni_kralj', 'crni', 'bili', 'otmanovic'] },
  { name: 'Luka Brkić', nickname: 'Brko', mobile: '+385955385824', primaryRole: 'crni_kralj', roles: ['crni_kralj', 'crni'] },
  { name: 'Marjan Kosović', nickname: 'Kesa', mobile: '+385917533893', primaryRole: 'otmanovic', roles: ['otmanovic', 'crni'] },
  { name: 'Mate Botica', nickname: 'Mate Bočica', mobile: '+385911556074', primaryRole: 'otmanovic', roles: ['otmanovic', 'crni'] },
  { name: 'Antun Penjak', nickname: 'Penjo', mobile: '+385915908328', primaryRole: 'otmanovic', roles: ['otmanovic', 'crni'] },
  { name: 'Roko Ivančević', nickname: 'Roko I.', mobile: '+385917238772', primaryRole: 'otmanovic', roles: ['otmanovic', 'crni'] },
  { name: 'Grgur Biliš', nickname: 'Grgur', mobile: '+385993360479', primaryRole: 'otmanovic', roles: ['otmanovic', 'crni'] },
  { name: 'Marko Srhoj', nickname: 'Markan', mobile: '+385953682877', primaryRole: 'otmanovic', roles: ['otmanovic', 'crni'] },
  { name: 'Mate Ojdanić', nickname: 'Ojda', mobile: '+385994807670', primaryRole: 'otmanovic', roles: ['otmanovic', 'crni'] },
  { name: 'Ivo Farac', nickname: 'El Fare', mobile: '+385995035661', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Tomislav Čurković', nickname: 'Čurkec', mobile: '+385919401676', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Marko Filippi', nickname: 'Marko F.', mobile: '+385996438486', primaryRole: 'crni', roles: ['crni', 'bili'] },
  { name: 'Josip Sessa', nickname: 'Sessa', mobile: '+385923857355', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Franko Terzić', nickname: 'Terza mlaji', mobile: '+385995706568', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Mislav Čale', nickname: 'Čale mlaji', mobile: '+385976259838', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Matej Bokšić', nickname: 'Bokšić', mobile: '+385998145978', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Marin Depolo', nickname: 'Mali Miće', mobile: '+385998032526', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Roko Lešaja', nickname: 'Tulo', mobile: '+385977578544', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Brano Čurčić', nickname: 'Brano', mobile: '+385989347848', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Toni Šale', nickname: 'Bavo', mobile: '+385996616081', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Jakov Granić', nickname: 'Granić', mobile: '+385995158882', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Alen Grbin', nickname: 'Alen Crni', mobile: '+385915814289', primaryRole: 'crni', roles: ['crni'] },
  { name: 'Todor Foretić', nickname: 'Fox', mobile: '+385995450486', primaryRole: 'crni', roles: ['crni'], active: false },
  { name: 'Mihael Matković', nickname: 'Matković', mobile: '+385923439703', primaryRole: 'crni', roles: ['crni', 'crni_kralj'], active: false },
  { name: 'Marko Vilović', nickname: 'Mafiš', mobile: '+385911524663', primaryRole: 'crni', roles: ['crni', 'otmanovic'], active: false },
  { name: 'Tomislav Denoble', nickname: 'Tome', mobile: '+385919326567', primaryRole: 'crni', roles: ['crni'], active: false },
  { name: 'Hrvoje Terzić', nickname: 'Terza stariji', mobile: '+385981690747', primaryRole: 'crni', roles: ['crni'], active: false },
  { name: 'Ivan Šegedin', nickname: 'Ivan Š.', mobile: '+385989022366', primaryRole: 'crni', roles: ['crni'], active: false },
  { name: 'Branimir Baždarić', nickname: 'Brane', mobile: '+385997930903', primaryRole: 'bili_kralj', roles: ['bili_kralj', 'bili', 'crni', 'crni_kralj', 'otmanovic'] },
  { name: 'Roko Tarle', nickname: 'Roke', mobile: '+385981365785', primaryRole: 'bili_kralj', roles: ['bili_kralj', 'bili'] },
  { name: 'Filip Rakočević', nickname: 'Fila', mobile: '+385995937211', primaryRole: 'bili_kralj', roles: ['bili_kralj', 'bili'] },
  { name: 'Beris Peručić', nickname: 'Beris', mobile: '+385992845524', primaryRole: 'bili_kralj', roles: ['bili_kralj', 'bili'] },
  { name: 'Domagoj Čale', nickname: 'Čale stariji', mobile: '+385917257669', primaryRole: 'bili_kralj', roles: ['bili_kralj', 'bili'] },
  { name: 'Mario Novaković', nickname: 'Novaković', mobile: '+385915413140', primaryRole: 'bili_kralj', roles: ['bili_kralj', 'bili'] },
  { name: 'Franko Skeleta', nickname: 'Skeleta', mobile: '+38598619628', primaryRole: 'bili_kralj', roles: ['bili_kralj', 'bili'] },
  { name: 'Saša Blitvić', nickname: 'Blitva', mobile: '+385915610796', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Mate Batinović', nickname: 'Matan', mobile: '+385917937327', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Lovro Bošković', nickname: 'Lovro B.', mobile: '+385998308637', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Antonio Silić', nickname: 'Čindro', mobile: '+385993305344', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Tomislav Arnold', nickname: 'Arnold', mobile: '+385919226056', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Nikola Foretić', nickname: 'Tuga stariji', mobile: '+385992994159', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Ivan Foretić', nickname: 'Tuga mlaji', mobile: '+385996689878', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Fran Petković', nickname: 'Fran', mobile: '+385989295832', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Franko Fabris', nickname: 'Franko', mobile: '+385995073164', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Luka Depolo', nickname: 'Miće stariji', mobile: '+385996372603', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Hrvoje Sansović', nickname: 'Sanso', mobile: '+38598755608', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Ante Batinović', nickname: 'Batak', mobile: '+385915747474', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Lovre Risteski', nickname: 'Risto', mobile: '+385955112335', primaryRole: 'bili_kralj', roles: ['bili_kralj', 'bili'] },
  { name: 'Rino Skokandić', nickname: 'Rino', mobile: '+385981726801', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Antonio Gaćina', nickname: 'Gaćina', mobile: '+385923911455', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Mate Šain', nickname: 'Šain', mobile: '+385958260615', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Jadran Bosnić', nickname: 'Jadro', mobile: '+385957317783', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Andro Biliš', nickname: 'Andro B.', mobile: '+385916115821', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Dino Bojanić', nickname: 'Dino', mobile: '+385953386813', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Roko Tasovac', nickname: 'Rocky Bachoky', mobile: '+385996420147', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Mateo Mihočević', nickname: 'Roda Sandokan', mobile: '+385918949360', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Nikola Ivanković', nickname: 'Ivanković', mobile: '+385998477052', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Vinko Fabris', nickname: 'Vinkea', mobile: '+38598403189', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Petar Arnold', nickname: 'Arnold mlaji', mobile: '+385919571761', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Kristo Cebalo', nickname: 'Kristo', mobile: '+385916114635', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Zvone Škorin', nickname: 'Zvone', mobile: '+385917549899', primaryRole: 'bili', roles: ['bili'] },
  { name: 'Lorena Žaknić', nickname: 'Lorena Ž.', mobile: null, primaryRole: 'bula', roles: ['bula'] },
  { name: 'Stella Verazza', nickname: 'Stella V.', mobile: null, primaryRole: 'bula', roles: ['bula'] },
  { name: 'Franka Brkić', nickname: 'Franka B.', mobile: null, primaryRole: 'bula', roles: ['bula'] },
  { name: 'Ivana Farac', nickname: 'Ivana F.', mobile: null, primaryRole: 'bula', roles: ['bula'] },
  { name: 'Lucija Skokandić', nickname: 'Lucija S.', mobile: null, primaryRole: 'bula', roles: ['bula'] },
  { name: 'Ana Pendo', nickname: 'Ana P.', mobile: '+385997774334', primaryRole: 'bula', roles: ['bula'] },
  { name: 'Eva Depolo', nickname: 'Eva D.', mobile: null, primaryRole: 'bula', roles: ['bula'] },
  { name: 'Ena Depolo', nickname: 'Ena D.', mobile: null, primaryRole: 'bula', roles: ['bula'] },
  { name: 'Mia Šulentić', nickname: 'Mia Š.', mobile: '+385992124898', primaryRole: 'bula', roles: ['bula'] },
  { name: 'Marija Pivac', nickname: 'Marija P.', mobile: null, primaryRole: 'bula', roles: ['bula'] },
]

function dbNameOf(url) {
  if (!url) return ''
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return ''
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const dbName = dbNameOf(process.env.DATABASE_URL)
  if (!ALLOWED_DB.has(dbName)) {
    throw new Error(
      `Odbijam raditi s bazom "${dbName || '(nepoznata)'}". Dopuštene su: ${[...ALLOWED_DB].join(', ')}.`,
    )
  }

  const withMobile = ROSTER.filter((r) => r.mobile).length
  const inactive = ROSTER.filter((r) => r.active === false).length
  console.log(
    `Popis: ${ROSTER.length} moreškanata, ${withMobile} s mobitelom, ${inactive} koji trenutno ne plešu.`,
  )

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const { rows: existing } = await client.query(
      'SELECT id, name, is_moreskant, nickname FROM members ORDER BY id',
    )
    const byName = new Map(existing.map((r) => [r.name, r]))
    const toUpdate = ROSTER.filter((r) => byName.has(r.name))
    const toCreate = ROSTER.filter((r) => !byName.has(r.name))
    const untouched = existing.filter((r) => !ROSTER.some((x) => x.name === r.name))

    console.log(
      `\nBaza "${dbName}": ${existing.length} postojećih članova.\n` +
        `  spajam u postojeći redak: ${toUpdate.length}\n` +
        `  ubacujem kao nove:        ${toCreate.length}\n` +
        `  ne diram:                 ${untouched.length}` +
        (untouched.length ? ` (${untouched.map((r) => r.name).join(', ')})` : ''),
    )

    if (dryRun) {
      console.log('\n--- SPAJAM U POSTOJEĆI REDAK ---')
      for (const r of toUpdate) {
        const doc = byName.get(r.name)
        const was = doc.is_moreskant ? `već moreškant (${doc.nickname})` : 'dosad samo za počasne ulaznice'
        console.log(
          `  #${doc.id} ${r.name} -> ${r.nickname} [${r.primaryRole}] ` +
            `${r.mobile ?? '(bez broja)'}${r.active === false ? ' NE PLEŠE' : ''} — ${was}`,
        )
      }
      console.log('\n--- NOVI ---')
      for (const r of toCreate) {
        console.log(
          `  ${r.name} -> ${r.nickname} [${r.primaryRole}] ` +
            `${r.mobile ?? '(bez broja)'}${r.active === false ? ' NE PLEŠE' : ''}`,
        )
      }
      console.log('\nPrazan hod: ništa nije zapisano.')
      return
    }

    await client.query('BEGIN')
    let created = 0
    let updated = 0
    for (const r of ROSTER) {
      const doc = byName.get(r.name)
      let id
      if (doc) {
        // `note` and `email` deliberately absent: never overwrite a human's typing.
        await client.query(
          `UPDATE members
              SET is_moreskant = true, nickname = $2, mobile = $3,
                  primary_role = $4, active = $5, updated_at = now()
            WHERE id = $1`,
          [doc.id, r.nickname, r.mobile, r.primaryRole, r.active !== false],
        )
        id = doc.id
        updated++
      } else {
        const { rows } = await client.query(
          `INSERT INTO members (name, active, is_moreskant, nickname, mobile, primary_role, created_at, updated_at)
           VALUES ($1, $2, true, $3, $4, $5, now(), now())
           RETURNING id`,
          [r.name, r.active !== false, r.nickname, r.mobile, r.primaryRole],
        )
        id = rows[0].id
        created++
      }
      // Roles are replaced wholesale, which is what makes a re-run a no-op.
      await client.query('DELETE FROM members_roles WHERE parent_id = $1', [id])
      for (const [i, role] of r.roles.entries()) {
        await client.query(
          'INSERT INTO members_roles ("order", parent_id, value) VALUES ($1, $2, $3)',
          [i + 1, id, role],
        )
      }
    }
    await client.query('COMMIT')
    console.log(`\nGotovo: ${created} novih, ${updated} osvježenih (ukupno ${ROSTER.length}).`)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
}

// Only run when executed directly, so the test can import ROSTER.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Uvoz nije uspio:', err.message)
    process.exit(1)
  })
}
