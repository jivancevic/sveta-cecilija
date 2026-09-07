import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Scans every db/schema/*.sql file for unguarded row mutations.
// bootstrap-db.mjs applies these files on EVERY restart, so anything that
// writes to existing rows must be safe to re-run on a populated DB.
// PR #126 caught `UPDATE shows SET online_sold=0, in_person_sold=0;` (no
// WHERE) zeroing live counters on every deploy — this test exists to make
// that class of bug fail at CI time, not in production.

const SCHEMA_DIR = path.resolve(__dirname, '..', '..', 'db', 'schema')

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
}

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const ROW_MUTATION = /^(UPDATE|DELETE|TRUNCATE)\b/i

export function findUnguardedMutations(sql: string): string[] {
  const cleaned = stripComments(sql)
  return splitStatements(cleaned).filter((stmt) => {
    const verb = stmt.match(ROW_MUTATION)
    if (!verb) return false
    if (verb[1].toUpperCase() === 'TRUNCATE') return true
    return !/\bWHERE\b/i.test(stmt)
  })
}

describe('db/schema safety', () => {
  const files = readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  it('finds at least one schema file (sanity)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(`${file} has no unguarded UPDATE/DELETE/TRUNCATE`, () => {
      const sql = readFileSync(path.join(SCHEMA_DIR, file), 'utf-8')
      const violations = findUnguardedMutations(sql)
      expect(violations, `Unguarded row mutation in ${file}:\n${violations.join('\n---\n')}`).toEqual([])
    })
  }

  // Self-check: the detector itself works.
  it('detector flags an unguarded UPDATE', () => {
    expect(findUnguardedMutations(`UPDATE shows SET online_sold = 0;`)).toHaveLength(1)
  })

  it('detector flags an unguarded DELETE', () => {
    expect(findUnguardedMutations(`DELETE FROM orders;`)).toHaveLength(1)
  })

  it('detector flags TRUNCATE (no WHERE possible)', () => {
    expect(findUnguardedMutations(`TRUNCATE qr_tokens CASCADE;`)).toHaveLength(1)
  })

  it('detector accepts UPDATE with WHERE', () => {
    expect(findUnguardedMutations(`UPDATE users SET role = 'tehnika' WHERE role::text = 'door-staff';`)).toEqual([])
  })

  it('detector accepts DELETE with WHERE', () => {
    expect(findUnguardedMutations(`DELETE FROM qr_tokens WHERE scanned = true;`)).toEqual([])
  })

  it('detector ignores ON DELETE CASCADE inside ALTER TABLE', () => {
    expect(
      findUnguardedMutations(
        `ALTER TABLE posts_rels ADD CONSTRAINT fk_posts FOREIGN KEY (posts_id) REFERENCES posts(id) ON DELETE CASCADE;`,
      ),
    ).toEqual([])
  })

  it('detector ignores INSERT … WHERE NOT EXISTS (seed pattern)', () => {
    expect(
      findUnguardedMutations(
        `INSERT INTO shows (date) SELECT * FROM (VALUES ('2026-05-18'::timestamptz)) AS v WHERE NOT EXISTS (SELECT 1 FROM shows);`,
      ),
    ).toEqual([])
  })

  it('detector flags the historical migrate-qr-truncate.sql payload', () => {
    const payload = `
      TRUNCATE TABLE qr_tokens CASCADE;
      UPDATE shows SET online_sold = 0, in_person_sold = 0, updated_at = NOW();
    `
    expect(findUnguardedMutations(payload)).toHaveLength(2)
  })
})

// #398 (ADR-0023): the legacy `role` column and its enum are gone from the
// schema. These assertions are the regression guard for the ordering that makes
// the drop safe on a database that is upgraded straight from a pre-permissions
// image — bootstrap-db.mjs applies db/schema/*.sql in plain filename order on
// every restart, so the drop must sort AFTER everything that still reads the
// column, and those readers must be no-ops once it is gone.
describe('the dropped users.role column', () => {
  const base = readFileSync(path.join(SCHEMA_DIR, '00-base.sql'), 'utf-8')
  const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.sql')).sort()
  const DROP_FILE = 'migrate-zz-drop-users-role.sql'

  it('is not declared in the base schema, and neither is its enum', () => {
    const cleaned = stripComments(base)
    expect(cleaned).not.toMatch(/enum_users_role/)
    const usersTable = cleaned.match(/CREATE TABLE IF NOT EXISTS public\.users \(([\s\S]*?)\n\);/)?.[1] ?? ''
    expect(usersTable).not.toMatch(/^\s*role\s/m)
  })

  it('is dropped column-first then type, both guarded with IF EXISTS', () => {
    const drop = stripComments(readFileSync(path.join(SCHEMA_DIR, DROP_FILE), 'utf-8'))
    expect(drop).toMatch(/ALTER TABLE public\.users DROP COLUMN IF EXISTS role;/i)
    expect(drop).toMatch(/DROP TYPE IF EXISTS public\.enum_users_role;/i)
    expect(drop.indexOf('DROP COLUMN')).toBeLessThan(drop.indexOf('DROP TYPE'))
  })

  it('the drop sorts last among the migrate-* files', () => {
    const migrations = files.filter((f) => f.startsWith('migrate-'))
    expect(migrations[migrations.length - 1]).toBe(DROP_FILE)
  })

  it('every remaining reader of the column is behind an existence guard', () => {
    for (const file of files) {
      if (file === DROP_FILE) continue
      const sql = stripComments(readFileSync(path.join(SCHEMA_DIR, file), 'utf-8'))
      // `role::text` / `enum_users_role` are the only ways the column is read;
      // the bare word appears in seed prose, which is not SQL.
      if (!/role::text|enum_users_role/.test(sql)) continue
      // The guard: an information_schema lookup for users.role, and dynamic
      // EXECUTE so the statements are never parsed without the column.
      const guarded = /information_schema\.columns[\s\S]*?column_name = 'role'/.test(sql)
      expect(guarded, `${file} reads users.role without an existence guard`).toBe(true)
    }
  })
})
