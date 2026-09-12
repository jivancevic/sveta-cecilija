import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// #411 (ADR-0024, phase 2). File-level guard for the one-shot import of the 14
// non-public performances of the 2026 season.
//
// The behavioural proof (14 rows on the first run, 0 new on the second, 0 new
// after a row is deleted) needs a live Postgres, which the offline unit suite
// deliberately does not have — it lives in `scripts/probe-nonpublic-seed.mjs`.
// What this file guards is everything that can be checked from the source: the
// exact rows, the shape of each row, and the guard clause whose spelling is the
// whole reason a deleted performance stays deleted across deploys.

const SCHEMA_DIR = path.resolve(__dirname, '..', '..', 'db', 'schema')
const SEED_FILE = 'seed-zz-nonpublic-performances.sql'

const seedSql = readFileSync(path.join(SCHEMA_DIR, SEED_FILE), 'utf-8')

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
}

interface SeedRow {
  date: string
  time: string
  kind: string
  location: string
  client: string | null
}

/**
 * The rows of the seed's `VALUES (...)` list, parsed out of the SQL.
 *
 * Deliberately naive — the file is hand-written and this test is what keeps it
 * in the shape the parser expects.
 */
export function parseSeedRows(sql: string): SeedRow[] {
  const cleaned = stripComments(sql)
  const values = cleaned.slice(cleaned.indexOf('VALUES'))
  const rows: SeedRow[] = []
  for (const m of values.matchAll(/\(\s*'(\d{4}-\d{2}-\d{2})[^']*'::timestamptz\s*,([\s\S]*?)\)\s*(?:,|\)\s*AS)/g)) {
    const date = m[1]
    const rest = m[2]
    const cells = rest.split(',').map((c) => c.trim())
    const unquote = (c: string): string | null => {
      if (/^NULL$/i.test(c)) return null
      const q = c.match(/^'((?:[^']|'')*)'/)
      return q ? q[1].replace(/''/g, "'") : c
    }
    rows.push({
      date,
      time: unquote(cells[0]) as string,
      kind: unquote(cells[1]) as string,
      location: unquote(cells[3]) as string,
      client: unquote(cells[4]),
    })
  }
  return rows
}

/** The 14 rows, verbatim from #404's table (docs/performances.md agrees). */
const EXPECTED: SeedRow[] = [
  { date: '2026-05-29', time: '20:30', kind: 'koncert', location: 'Sv. Justina', client: null },
  { date: '2026-06-16', time: '10:00', kind: 'dmc', location: 'Zimsko kino', client: 'Le Ponant' },
  { date: '2026-07-14', time: '10:30', kind: 'gulliver', location: 'Zimsko kino', client: 'Le Bougainville' },
  { date: '2026-07-29', time: '21:30', kind: 'ostalo', location: 'Spomenik sv. Todora', client: null },
  { date: '2026-08-05', time: '19:00', kind: 'gulliver', location: 'Ljetno kino', client: 'Le Ponant' },
  { date: '2026-08-12', time: '19:00', kind: 'gulliver', location: 'Ljetno kino', client: 'Le Ponant' },
  { date: '2026-08-13', time: '16:30', kind: 'dmc', location: 'Zimsko kino', client: 'NG Orion' },
  { date: '2026-08-19', time: '19:00', kind: 'gulliver', location: 'Ljetno kino', client: 'Le Ponant' },
  { date: '2026-08-20', time: '16:30', kind: 'dmc', location: 'Zimsko kino', client: 'NG Orion' },
  { date: '2026-08-26', time: '19:00', kind: 'gulliver', location: 'Ljetno kino', client: 'Le Ponant' },
  { date: '2026-09-08', time: '10:00', kind: 'dmc', location: 'Zimsko kino', client: 'Le Ponant' },
  { date: '2026-09-15', time: '10:00', kind: 'dmc', location: 'Zimsko kino', client: 'Le Ponant' },
  { date: '2026-09-22', time: '10:00', kind: 'dmc', location: 'Zimsko kino', client: 'Le Ponant' },
  { date: '2026-10-15', time: '18:00', kind: 'dmc', location: 'Zimsko kino', client: 'Lady Eleganza' },
]

describe('the non-public 2026 performance seed', () => {
  it('sorts after the shows migration and after the Redovna seed', () => {
    const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.sql')).sort()
    expect(files).toContain(SEED_FILE)
    expect(files.indexOf(SEED_FILE)).toBeGreaterThan(files.indexOf('migrate-shows-performance.sql'))
    expect(files.indexOf(SEED_FILE)).toBeGreaterThan(files.indexOf('seed-shows.sql'))
  })

  it('inserts exactly the 14 performances of the 2026 season', () => {
    expect(parseSeedRows(seedSql)).toEqual(EXPECTED)
  })

  it('is one INSERT, so the whole import is all-or-nothing', () => {
    expect(stripComments(seedSql).match(/\bINSERT\s+INTO\b/gi) ?? []).toHaveLength(1)
  })

  it('writes every row as a non-public, active performance with no venue', () => {
    const cleaned = stripComments(seedSql)
    const columns = cleaned.match(/INSERT INTO shows\s*\(([^)]*)\)/i)?.[1] ?? ''
    const names = columns.split(',').map((c) => c.trim())
    // venue is absent from the column list, so it lands NULL (the migration
    // dropped its NOT NULL and its default); thresholds and the sold counters
    // come from their column defaults (8/8 and 0).
    expect(names).toEqual(['date', 'time', 'kind', 'is_public', 'location', 'client', 'status'])
    expect(names).not.toContain('venue')
    expect(names).not.toContain('threshold_crni')
    expect(names).not.toContain('online_sold')
    // Every VALUES row carries `false` for is_public and 'active' for status.
    const rowCount = EXPECTED.length
    expect(cleaned.match(/,\s*false\s*,/g) ?? []).toHaveLength(rowCount)
    expect(cleaned.match(/'active'::enum_shows_status/g) ?? []).toHaveLength(rowCount)
  })

  it('dates every row at noon UTC, like the Redovna seed', () => {
    const cleaned = stripComments(seedSql)
    const stamps = cleaned.match(/'\d{4}-\d{2}-\d{2} [^']*'::timestamptz/g) ?? []
    expect(stamps).toHaveLength(EXPECTED.length)
    for (const s of stamps) expect(s).toMatch(/ 12:00:00\+00'::timestamptz$/)
  })

  it('fires only while NO non-public row exists at all', () => {
    // THE guard. A per-row `WHERE NOT EXISTS (date, time)` was rejected in #404:
    // bootstrap re-applies every schema file on every restart, so a per-row
    // guard would resurrect a performance the voditelj deleted.
    const cleaned = stripComments(seedSql).replace(/\s+/g, ' ')
    expect(cleaned).toMatch(
      /WHERE NOT EXISTS \(\s*SELECT 1 FROM shows WHERE is_public = false\s*\)/i,
    )
    // …and nothing narrower: no date/time correlation with the outer row.
    expect(cleaned).not.toMatch(/NOT EXISTS \([^)]*v\.date/i)
  })

  it('leaves the Redovna seed and its "table empty" guard alone', () => {
    const redovna = stripComments(readFileSync(path.join(SCHEMA_DIR, 'seed-shows.sql'), 'utf-8'))
      .replace(/\s+/g, ' ')
    expect(redovna).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM shows\);/i)
  })
})
