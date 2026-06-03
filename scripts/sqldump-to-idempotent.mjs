#!/usr/bin/env node
//
// Turn a `pg_dump --schema-only` file into the idempotent baseline used as
// db/schema/00-base.sql (ADR-0013). Reads stdin or a path, writes stdout.
//
//   node scripts/sqldump-to-idempotent.mjs < dump.sql > db/schema/00-base.sql
//
// Transforms (so every statement is safe to re-run on a populated DB):
//   CREATE TABLE                  -> CREATE TABLE IF NOT EXISTS
//   CREATE SEQUENCE               -> CREATE SEQUENCE IF NOT EXISTS
//   CREATE [UNIQUE] INDEX         -> CREATE [UNIQUE] INDEX IF NOT EXISTS
//   CREATE TYPE ... AS ENUM       -> wrapped in DO/EXCEPTION duplicate_object
//   ALTER TABLE ONLY ADD CONSTRAINT -> wrapped in DO/EXCEPTION duplicate_object
// Dropped: comments, SET, SELECT pg_catalog, psql \meta-commands, OWNER/COMMENT.
// Kept as-is (already idempotent): ALTER SEQUENCE ... OWNED BY,
//   ALTER TABLE ... ALTER COLUMN ... SET DEFAULT nextval(...).
//
// See db/schema/README.md → "Regenerating 00-base.sql" for the full procedure.

import { readFileSync } from 'node:fs'

const input = process.argv[2]
  ? readFileSync(process.argv[2], 'utf8')
  : readFileSync(0, 'utf8')

const statements = input.split(/;\s*\n/)
const out = []

for (const stmt of statements) {
  const lines = stmt.split('\n').filter((l) => {
    const t = l.trim()
    if (t === '') return false
    if (t.startsWith('--')) return false
    if (t.startsWith('\\')) return false // psql meta-commands
    if (/^SET\s/i.test(t)) return false
    if (/^SELECT pg_catalog\./i.test(t)) return false
    return true
  })
  if (lines.length === 0) continue
  let s = lines.join('\n').trim()
  if (s === '') continue

  if (/^ALTER TABLE .* OWNER TO /i.test(s)) continue
  if (/^COMMENT ON /i.test(s)) continue
  if (/^ALTER .*OWNER TO /i.test(s)) continue

  if (/^CREATE TYPE /i.test(s)) {
    out.push(`DO $$ BEGIN\n${s};\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
  } else if (/^CREATE TABLE /i.test(s)) {
    out.push(s.replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ') + ';')
  } else if (/^CREATE SEQUENCE /i.test(s)) {
    out.push(s.replace(/^CREATE SEQUENCE /i, 'CREATE SEQUENCE IF NOT EXISTS ') + ';')
  } else if (/^CREATE (UNIQUE )?INDEX /i.test(s)) {
    out.push(s.replace(/^CREATE (UNIQUE )?INDEX /i, (m, u) => `CREATE ${u || ''}INDEX IF NOT EXISTS `) + ';')
  } else if (/^ALTER TABLE ONLY /i.test(s) && /ADD CONSTRAINT/i.test(s)) {
    // Guard by existence, not by exception code: re-adding a PRIMARY KEY raises
    // 42P16 ("multiple primary keys not allowed"), NOT duplicate_object, so a
    // `WHEN duplicate_object` handler wouldn't make it idempotent. Skip the ADD
    // when a constraint of that name already exists on the table.
    const m = s.match(/ALTER TABLE ONLY\s+(\S+)\s+ADD CONSTRAINT\s+(\S+)/i)
    if (m) {
      const [, table, cname] = m
      out.push(
        `DO $$ BEGIN\n` +
        `  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${cname}' AND conrelid = '${table}'::regclass) THEN\n` +
        `    ${s};\n` +
        `  END IF;\n` +
        `END $$;`,
      )
    } else {
      out.push(`DO $$ BEGIN\n${s};\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
    }
  } else {
    out.push(s + ';')
  }
}

process.stdout.write(
  '-- GENERATED idempotent baseline — the full Payload-push schema (ADR-0013).\n' +
  '-- Do NOT hand-edit. Regenerate when a Payload collection changes:\n' +
  '--   see db/schema/README.md → "Regenerating 00-base.sql".\n' +
  '-- The CI schema-drift gate (.github/workflows/schema-drift.yml) fails the PR\n' +
  '-- if this file stops reproducing what Payload push would create.\n\n' +
  out.join('\n\n') + '\n',
)
