import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// #410 (ADR-0024, phase 2). Source-level guard for the ONE invariant that keeps
// a non-public performance (a ship call, a concert) out of every buyer, partner,
// door and statistics surface: those queries filter on the shared public
// predicate in `src/lib/show-performance.ts`.
//
// Modelled on `db-schema-safety.test.ts`: it is a file scan, not a runtime test.
// It walks `src/` for reads of the shows collection / shows table and fails
// unless the file references the shared predicate, or is on the allow-list
// below with a justification. Phase 3 will add consumers; this test is what
// makes a forgotten filter fail at CI time rather than in front of a buyer.

const SRC_DIR = path.resolve(__dirname, '..')

/** The three spellings of the shared predicate (`src/lib/show-performance.ts`). */
export const PREDICATE_NAMES = [
  'PUBLIC_PERFORMANCE_WHERE',
  'publicPerformanceSql',
  'isPublicPerformance',
] as const

/**
 * Files exempt from the rule, each with the reason it is safe.
 *
 * Keys are repo-relative POSIX paths. Categories (per #404):
 * - **order-joined read** — the show is only ever reached through an order or a
 *   ticket that already exists, so a non-public performance (which has no sales)
 *   can never surface.
 * - **id-addressed read behind a gate** — the caller has already applied the
 *   predicate, or the route is a write route that #409 gates.
 * - **write route / bulk create** — not a read of the schedule.
 *
 * Adding an entry is a deliberate act: write the justification, don't just
 * silence the test.
 */
export const ALLOW_LIST: Record<string, string> = {
  'src/app/api/scan/[token]/claim/route.ts':
    'Order-joined read: the show is reached from the scanned ticket’s order, so only a show that already sold a ticket can surface.',
  'src/app/api/stripe/webhook/route.ts':
    'Order-joined read: the show doc is loaded to render the ticket email of the order that just paid.',
  'src/lib/scan-deps.ts':
    'Order-joined read: door-scan detail for the show of an existing ticket, never a schedule listing.',
  'src/lib/show-stats-data.ts':
    'Id-addressed read; the public check is applied one layer up by loadShowStatsInput (src/lib/stats-loaders.ts).',
  'src/app/api/cron/send-review-emails/route.ts':
    'Order-joined read (JOIN shows ON orders.show_id): only shows with paid orders are considered.',
  'src/lib/partner/recent-sales-page.ts':
    'Order-joined read: partner ledger page, driven by the partner’s own orders.',
  'src/lib/refund/reschedule-refund-context.ts':
    'Order-joined read: refund context for an existing order.',
  'src/app/api/app/attendance/route.ts':
    'Roster write route (#422): the moreškant app covers EVERY performance of the season, public or not (ADR-0024), so filtering on the predicate would be wrong. The id-addressed read only builds the start instant and the cancelled flag for the answer rules, behind requirePermission([moreskant, moreska]).',
  'src/app/api/shows/[id]/move-to-zimsko/route.ts':
    'Id-addressed write route; its SELECT feeds the in-handler isPublicPerformance() check merged in #409, which 400s a non-public performance before anything moves.',
  'src/app/api/shows/[id]/reschedule/route.ts':
    'Id-addressed write route; its SELECT feeds the in-handler isPublicPerformance() check merged in #409, which refuses a non-public performance before any buyer is notified.',
}

/** Files that define or test the predicate itself. */
const SELF = new Set(['src/lib/show-performance.ts'])

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export type HitKind = 'payload-find' | 'sql-read'

export interface Hit {
  kind: HitKind
  snippet: string
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const READ_VERBS = new Set(['find', 'findByID', 'count'])
const CALL_VERB = /\.(find|findByID|count|create|update|delete)\s*\(/g

/** The verb of the nearest enclosing Payload call before `index`. */
function precedingVerb(src: string, index: number): string | null {
  const window = src.slice(Math.max(0, index - 400), index)
  let verb: string | null = null
  for (const m of window.matchAll(CALL_VERB)) verb = m[1]
  return verb
}

function snippetAt(src: string, index: number): string {
  const lineStart = src.lastIndexOf('\n', index) + 1
  const lineEnd = src.indexOf('\n', index)
  return src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd).trim()
}

/**
 * Every read of the shows collection / shows table in one source file.
 *
 * Payload: `collection: 'shows'` (any quote style, including a template
 * literal, and a same-file constant that resolves to `'shows'`) whose nearest
 * enclosing call is `find` / `findByID` / `count`. `create` / `update` /
 * `delete` are writes and are not hits.
 *
 * SQL: `FROM shows` / `JOIN shows`, case-insensitive, optional `public.`
 * qualifier, with or without an alias.
 */
export function findShowsReads(source: string): Hit[] {
  const src = stripComments(source)
  const hits: Hit[] = []

  // Constants bound to the literal, so `collection: SHOWS` is caught too.
  const aliases = new Set<string>()
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(['"`])shows\2/g)) {
    aliases.add(m[1])
  }

  for (const m of src.matchAll(/collection:\s*(?:(['"`])shows\1|([A-Za-z_$][\w$]*))/g)) {
    if (m[2] !== undefined && !aliases.has(m[2])) continue
    const verb = precedingVerb(src, m.index!)
    if (!verb || !READ_VERBS.has(verb)) continue
    hits.push({ kind: 'payload-find', snippet: snippetAt(src, m.index!) })
  }

  for (const m of src.matchAll(/\b(?:from|join)\s+(?:public\.)?shows\b/gi)) {
    hits.push({ kind: 'sql-read', snippet: snippetAt(src, m.index!) })
  }

  return hits
}

/** True when the file references the shared predicate at all. */
export function referencesPredicate(source: string): boolean {
  const src = stripComments(source)
  return PREDICATE_NAMES.some((name) => new RegExp(`\\b${name}\\b`).test(src))
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      walk(full, acc)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    if (/\.test\.tsx?$/.test(entry.name)) continue
    acc.push(full)
  }
  return acc
}

function relPath(full: string): string {
  return path.relative(path.resolve(SRC_DIR, '..'), full).split(path.sep).join('/')
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

describe('every shows read filters on the public predicate', () => {
  const files = walk(SRC_DIR).sort()

  it('scans a non-trivial number of source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  const offenders: string[] = []
  const covered: string[] = []

  for (const full of files) {
    const rel = relPath(full)
    if (SELF.has(rel)) continue
    const source = readFileSync(full, 'utf-8')
    const hits = findShowsReads(source)
    if (hits.length === 0) continue
    if (rel in ALLOW_LIST) continue
    if (referencesPredicate(source)) {
      covered.push(rel)
      continue
    }
    offenders.push(
      `${rel}\n  ${hits.map((h) => `[${h.kind}] ${h.snippet}`).join('\n  ')}`,
    )
  }

  it('has no unguarded, unlisted shows read', () => {
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These files read the shows collection/table without referencing the shared public predicate ` +
          `(${PREDICATE_NAMES.join(', ')} from src/lib/show-performance.ts):\n\n${offenders.join('\n\n')}\n\n` +
          `Fix it one of two ways:\n` +
          `  1. Filter the query on the shared predicate (PUBLIC_PERFORMANCE_WHERE for Payload finds, ` +
          `publicPerformanceSql() for raw SQL, isPublicPerformance(doc) for an id-addressed read), or\n` +
          `  2. If the read genuinely cannot surface a non-public performance (order-joined read, ` +
          `id-addressed read behind an already-gated caller, write route), add the file to ALLOW_LIST in ` +
          `src/lib/show-performance-guard.test.ts with a one-line justification.`,
    ).toEqual([])
  })

  it('still finds the gated consumers it is meant to protect', () => {
    // If a refactor moves these, the scan silently stops covering the buyer
    // path — so assert the known-good set is non-empty and includes the loaders.
    expect(covered).toContain('src/lib/show-loaders.ts')
    expect(covered).toContain('src/lib/stats-loaders.ts')
    expect(covered.length).toBeGreaterThanOrEqual(5)
  })
})

describe('the allow-list', () => {
  it('gives every entry a justification', () => {
    for (const [file, why] of Object.entries(ALLOW_LIST)) {
      expect(why.trim().length, `${file} has no justification`).toBeGreaterThan(20)
    }
  })

  it('has no stale entry (every listed file exists and still reads shows)', () => {
    for (const file of Object.keys(ALLOW_LIST)) {
      const full = path.resolve(SRC_DIR, '..', file)
      const source = readFileSync(full, 'utf-8')
      expect(findShowsReads(source).length, `${file} no longer reads shows; drop the allow-list entry`)
        .toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Self-check: the detector actually detects.
// ---------------------------------------------------------------------------

describe('the shows-read detector', () => {
  it('flags a Payload find on the shows collection', () => {
    expect(findShowsReads(`await payload.find({ collection: 'shows', limit: 10 })`)).toHaveLength(1)
  })

  it('flags findByID and count', () => {
    expect(findShowsReads(`payload.findByID({ collection: "shows", id })`)).toHaveLength(1)
    expect(findShowsReads('payload.count({ collection: `shows` })')).toHaveLength(1)
  })

  it('flags a constant that resolves to the collection slug', () => {
    expect(
      findShowsReads(`const SHOWS = 'shows'\nawait payload.find({ collection: SHOWS })`),
    ).toHaveLength(1)
  })

  it('does not flag a create/update/delete on shows', () => {
    expect(findShowsReads(`await payload.create({ collection: 'shows', data })`)).toEqual([])
    expect(findShowsReads(`await payload.update({ collection: 'shows', id, data })`)).toEqual([])
  })

  it('flags SELECT … FROM shows, with or without alias, any case', () => {
    expect(findShowsReads('`SELECT id FROM shows WHERE id = $1`')).toHaveLength(1)
    expect(findShowsReads('`select 1 from public.shows s`')).toHaveLength(1)
    expect(findShowsReads('`SELECT 1 FROM orders o JOIN shows s ON s.id = o.show_id`')).toHaveLength(1)
  })

  it('does not flag UPDATE shows (a write)', () => {
    expect(findShowsReads('`UPDATE shows SET venue = $1 WHERE id = $2`')).toEqual([])
  })

  it('does not flag a similarly named table', () => {
    expect(findShowsReads('`SELECT 1 FROM shows_rels`')).toEqual([])
    expect(findShowsReads(`payload.find({ collection: 'shows-archive' })`)).toEqual([])
  })

  it('ignores commented-out queries', () => {
    expect(findShowsReads(`// await payload.find({ collection: 'shows' })`)).toEqual([])
    expect(findShowsReads(`/* SELECT 1 FROM shows */`)).toEqual([])
  })

  it('recognises each predicate spelling', () => {
    for (const name of PREDICATE_NAMES) {
      expect(referencesPredicate(`import { ${name} } from '@/lib/show-performance'`)).toBe(true)
    }
    expect(referencesPredicate(`const isPublic = true`)).toBe(false)
  })
})
