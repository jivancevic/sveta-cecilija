import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// #504 (#475, ADR-0027). Source-level guard for the seam: **new staff-app code
// never imports Payload directly.**
//
// Modelled on `show-performance-guard.test.ts` and `db-schema-safety.test.ts`:
// a file scan, not a runtime test. It walks the Cecilija route group
// (`src/app/app/**`) and its API routes (`src/app/api/app/**`) for an import of
// `payload` or `@payload-config` and fails unless the file is under
// `src/lib/repo/payload/` — the one directory allowed to — or on the allow-list
// below with the screen that retires it.
//
// The allow-list is meant to SHRINK. Each screen ticket migrates the routes it
// touches (seam research, section 6.4) and deletes its entries; nobody sweeps.

const SRC_DIR = path.resolve(__dirname, '../..')

/**
 * The directories the rule covers: Cecilija's pages, Cecilija's routes, and the
 * `*-data.ts` modules behind them.
 *
 * `src/lib/app/` is in the list because that is where the data access actually
 * lives (seam research 6.4): a page that imports no Payload but calls a
 * `*-data.ts` that does has moved the import, not removed it.
 */
const SCANNED_PREFIXES = ['src/app/app/', 'src/app/api/app/', 'src/lib/app/'] as const

/** The one directory allowed to import Payload. */
const SEAM_DIR = 'src/lib/repo/payload/'

/**
 * Files that still import Payload directly, each naming what retires it.
 *
 * Three groups:
 *
 *  - **The sign-in paths** (seam research section 2), which have no session yet
 *    by nature or authenticate a caller before there is one to guard. They move
 *    when `repo.auth` grows the login operations — `login`, `logout`,
 *    `issueResetToken`, `resetPassword` — which is tracked by #475 and belongs
 *    to no screen ticket, because no screen owns signing in.
 *  - **The `*-data.ts` modules of screens that already shipped** under the old
 *    shape. Each names the screen ticket that rewrites it (seam research 6.4:
 *    a call site migrates when ITS screen is rebuilt, never in a sweep).
 *  - **The two roster loaders with no screen ticket left** — Ljestvica is
 *    finished, so they wait for phase B.
 *
 * Adding an entry is a deliberate act: name the ticket that removes it, don't
 * just silence the test.
 */
export const ALLOW_LIST: Record<string, string> = {
  'src/app/api/app/login/route.ts':
    'Sign-in route: calls payload.login + generatePayloadCookie. Retired when repo.auth gains the login operations (#475, seam research 2.1).',
  'src/app/api/app/logout/route.ts':
    'Sign-out route: needs Payload’s logoutOperation so the users_sessions row is deleted, not just the cookie. Retired with repo.auth (#475, seam research 2.2).',
  'src/app/api/app/forgot/route.ts':
    'Reset-token route: payload.forgotPassword with a per-call expiration. Retired with repo.auth (#475, seam research 2.3).',
  'src/app/api/app/session/route.ts':
    'Invitation-link sign-in (#463): payload.resetPassword mints the session the token stands for. Retired with repo.auth (#475, seam research 2.4).',
  'src/app/api/app/authorize/route.ts':
    'MCP consent screen (#438): authenticates the caller itself before there is a session to guard, and writes the oauth_codes store. Retired with repo.auth (#475, seam research 2.8).',

  // ── The session, and the link that opens one without a password ──────────
  'src/lib/app/viewer.ts':
    'The session resolution every /app page opens with: payload.auth plus the re-read of the account and its Member. Retired with repo.auth (#475, seam research 2.5) — it is the same swap as the sign-in routes above, not a screen’s.',
  'src/lib/app/session-data.ts':
    'The invitation link that IS the authentication (#463): payload.resetPassword mints the session the token stands for. Its `openAppSession` half already sits behind repo.auth.openSession (#511); the reset-token reader beside it is retired with the rest of repo.auth (#475, seam research 2.4).',
  'src/lib/app/session-guard.ts':
    'The inbox routes’ session guard (#496): payload.auth composed with decideAppAccess, because a notification is addressed to an ACCOUNT rather than to a permission. Retired with repo.auth (#475) — it asks the same "who is asking" question as viewer.ts and swaps with it.',
  'src/lib/app/notifications-data.ts':
    'The inbox store loader (#496): a raw-table read that takes poolQuery off the Payload instance the request already has. Retired when repo.db replaces that, alongside the rest of repo.auth’s app-session work (#475).',
  'src/lib/app/invite-data.ts':
    'Issues a dancer login (creates the Users row and mints the reset token, #424/#463), and since #511 also holds ensureJoinLogin, the same job for an approved rehearsal claim. Članovi moved every LIST it used to share behind repo.members; what is left is the account half, which is repo.users plus repo.auth and waits for both (#475).',

  // ── Finished screens with no ticket left: phase B ────────────────────────
  'src/lib/app/my-season-data.ts':
    'A dancer’s own season on Ljestvica (#457). That screen is finished and no v1 ticket rebuilds it, so it waits for phase B (seam research 6.4).',
  'src/lib/app/stats-data.ts':
    'The roster scoreboard on Ljestvica (#437). Finished screen, no v1 ticket rebuilds it; waits for phase B. Note Statistika (#508) is the SALES screen and does not touch this loader.',
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * Every direct Payload import in one source file.
 *
 * Catches the three shapes that exist: a static `import … from 'payload'`, the
 * config alias `@payload-config`, and a dynamic `await import('payload')`.
 * A sub-path (`payload/shared`, `@payloadcms/db-postgres`) counts too: the
 * `sql` template tag and the cookie helpers are Payload just as much as
 * `getPayload` is, and the atomic statements they build belong inside the seam.
 */
export function findPayloadImports(source: string): string[] {
  const src = stripComments(source)
  const hits: string[] = []
  const SPECIFIER = /(?:from|import|require)\s*\(?\s*(['"])((?:@payload-config|@payloadcms\/[^'"]+|payload(?:\/[^'"]*)?))\1/g
  for (const m of src.matchAll(SPECIFIER)) {
    hits.push(m[2])
  }
  return hits
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
    // A test may stub `getPayload` at the module boundary; that is how the
    // route tests work and it is not a production import.
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

describe('Cecilija code reaches Payload only through the seam', () => {
  const files = SCANNED_PREFIXES.flatMap((prefix) =>
    walk(path.resolve(SRC_DIR, '..', prefix)),
  ).sort()

  it('scans every Cecilija directory (sanity)', () => {
    // A mistyped prefix would silently switch a third of the rule off, and the
    // suite would still be green — so each one has to have found files.
    expect(files.length).toBeGreaterThan(50)
    const rels = files.map(relPath)
    for (const prefix of SCANNED_PREFIXES) {
      expect(rels.some((f) => f.startsWith(prefix)), `${prefix} matched no files`).toBe(true)
    }
  })

  const offenders: string[] = []

  for (const full of files) {
    const rel = relPath(full)
    if (rel.startsWith(SEAM_DIR)) continue
    if (rel in ALLOW_LIST) continue
    const hits = findPayloadImports(readFileSync(full, 'utf-8'))
    if (hits.length === 0) continue
    offenders.push(`${rel}\n  imports ${[...new Set(hits)].join(', ')}`)
  }

  it('has no new file importing Payload directly', () => {
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These Cecilija files import Payload directly:\n\n${offenders.join('\n\n')}\n\n` +
          `Fix it one of two ways:\n` +
          `  1. Read and write through getRepo() from '@/lib/repo' (repo.auth for the session, ` +
          `repo.<collection> for documents, repo.db for the atomic SQL modules), adding the ` +
          `method the screen needs to src/lib/repo/ and its Payload implementation to ` +
          `src/lib/repo/payload/, or\n` +
          `  2. If the file genuinely cannot go through the seam yet, add it to ALLOW_LIST in ` +
          `src/lib/repo/repo-guard.test.ts naming the ticket that retires the entry.`,
    ).toEqual([])
  })

  it('keeps the seam itself the only Payload importer under src/lib/repo', () => {
    const seamFiles = walk(path.join(SRC_DIR, 'lib/repo')).map(relPath)
    const above = seamFiles
      .filter((f) => !f.startsWith(SEAM_DIR))
      .filter((f) => findPayloadImports(readFileSync(path.resolve(SRC_DIR, '..', f), 'utf-8')).length > 0)
    expect(
      above,
      'the interfaces above src/lib/repo/payload/ must not import Payload — that is the whole point of the seam',
    ).toEqual([])
  })
})

describe('the allow-list', () => {
  it('gives every entry a justification', () => {
    for (const [file, why] of Object.entries(ALLOW_LIST)) {
      expect(why.trim().length, `${file} has no justification`).toBeGreaterThan(20)
    }
  })

  it('has no stale entry (every listed file exists and still imports Payload)', () => {
    for (const file of Object.keys(ALLOW_LIST)) {
      const source = readFileSync(path.resolve(SRC_DIR, '..', file), 'utf-8')
      expect(
        findPayloadImports(source).length,
        `${file} no longer imports Payload; drop the allow-list entry`,
      ).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Self-check: the detector actually detects.
// ---------------------------------------------------------------------------

describe('the Payload-import detector', () => {
  it('flags a static import of payload', () => {
    expect(findPayloadImports(`import { getPayload } from 'payload'`)).toEqual(['payload'])
  })

  it('flags the config alias', () => {
    expect(findPayloadImports(`import config from '@payload-config'`)).toEqual(['@payload-config'])
  })

  it('flags a dynamic import and a require', () => {
    expect(findPayloadImports(`const p = await import('payload')`)).toEqual(['payload'])
    expect(findPayloadImports(`const p = require("payload")`)).toEqual(['payload'])
  })

  it('flags a sub-path and the adapter', () => {
    expect(findPayloadImports(`import { generatePayloadCookie } from 'payload/shared'`)).toEqual([
      'payload/shared',
    ])
    expect(findPayloadImports(`import { sql } from '@payloadcms/db-postgres'`)).toEqual([
      '@payloadcms/db-postgres',
    ])
  })

  it('does not flag a same-repo module whose name merely contains payload', () => {
    expect(findPayloadImports(`import { relationId } from '@/lib/payload-relation'`)).toEqual([])
    expect(findPayloadImports(`import { x } from './payload-ish'`)).toEqual([])
  })

  it('ignores a commented-out import', () => {
    expect(findPayloadImports(`// import { getPayload } from 'payload'`)).toEqual([])
    expect(findPayloadImports(`/* import config from '@payload-config' */`)).toEqual([])
  })
})
