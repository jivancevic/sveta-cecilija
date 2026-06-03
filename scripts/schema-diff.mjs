#!/usr/bin/env node
//
// Schema drift verdict (ADR-0013). Compares two `pg_dump --schema-only` files:
//
//   node scripts/schema-diff.mjs <expected.sql> <bootstrap.sql>
//
//   expected  = schema Payload `push` produces from the collection configs
//               (the source of truth).
//   bootstrap = schema a fresh DB gets from db/schema/*.sql alone
//               (what prod/DR/cutover actually build, no push).
//
// The gate asserts the bootstrap schema is a SUPERSET of Payload's: every
// schema object Payload needs must be reproducible from db/schema/. Extra
// objects in bootstrap (e.g. performance indexes app.sql adds that Payload
// doesn't declare) are allowed. So the failure condition is: any normalised
// line present in `expected` but absent from `bootstrap`.
//
// Exit 0 = no drift (or only extra objects). Exit 1 = drift (missing objects).

import { readFileSync } from 'node:fs'

// Volatile / non-semantic lines that differ between two dumps of the same
// schema and must not count as drift.
function normalise(sql) {
  return sql
    .split('\n')
    .map((l) => l.replace(/\s+$/, '')) // trailing ws
    .filter((l) => {
      const t = l.trim()
      if (t === '') return false
      if (t.startsWith('--')) return false // comments
      if (t.startsWith('\\')) return false // psql meta (\restrict, \unrestrict)
      if (/^SET\s/i.test(t)) return false
      if (/^SELECT pg_catalog\./i.test(t)) return false
      return true
    })
}

const [, , expectedPath, bootstrapPath] = process.argv
if (!expectedPath || !bootstrapPath) {
  console.error('usage: schema-diff.mjs <expected.sql> <bootstrap.sql>')
  process.exit(2)
}

const expected = normalise(readFileSync(expectedPath, 'utf8'))
const bootstrap = new Set(normalise(readFileSync(bootstrapPath, 'utf8')))

// Lines Payload requires that db/schema/ does not reproduce.
const missing = expected.filter((l) => !bootstrap.has(l))

if (missing.length === 0) {
  console.log('✅ No schema drift: db/schema/ reproduces every object Payload requires.')
  process.exit(0)
}

console.error('❌ Schema drift detected.')
console.error(
  `\n${missing.length} line(s) are in Payload's expected schema but NOT reproduced by db/schema/*.sql.`,
)
console.error('A Payload collection changed without a matching db/schema/ update.')
console.error('Regenerate the baseline (see db/schema/README.md → "Regenerating 00-base.sql").\n')
console.error('--- missing from bootstrap (present in Payload push) ---')
for (const l of missing) console.error('  ' + l)
process.exit(1)
