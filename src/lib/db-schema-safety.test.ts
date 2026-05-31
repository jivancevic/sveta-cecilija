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
