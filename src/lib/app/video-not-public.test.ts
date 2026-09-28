import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The Snimka never leaves the building (#692), asserted as a source scan.
//
// `Shows.videoUrl` carries an UNLISTED YouTube link, and unlisted is not
// private: anybody holding the link can watch and can forward it. The decision
// in #692 is therefore that it appears nowhere a buyer, a search engine or the
// calendar feed can reach — and CLAUDE.md's own hard rule from #599 is that a
// promise written in an `admin.description` is not a fact until something
// compares the claim to the renderer. This is that comparison.
//
// A SCAN rather than a runtime assertion, for the same reason
// `finance-no-pii.test.ts` is one: the leak being guarded against is a FIELD
// arriving in a widened projection or a `SELECT *`, and a field nobody renders
// yet would pass any runtime check. Modelled on `repo-guard.test.ts` and
// `show-performance-guard.test.ts`.
//
// What it does NOT assert is access control — the field lock on the collection
// and `requirePermission` on the two routes do that. This asserts only that the
// public half of the app never so much as names the column, which is the one
// guarantee a reader of the glossary is owed.

const ROOT = path.resolve(__dirname, '../../..')

/**
 * Everything a person with no login can reach: the public site, the token-authed
 * buyer pages, the door scan, the sitemap and `llms.txt`, plus the three
 * server-side readers of `shows` that feed them (`shows.ts` is the documented
 * single entry point for frontend show data) and the shared calendar feed,
 * which is one URL safe to paste in the WhatsApp group and must stay that way.
 */
const PUBLIC_TREES = [
  'src/app/(frontend)',
  'src/app/order',
  'src/app/scan',
  'src/components',
  'src/lib/calendar',
] as const

const PUBLIC_FILES = [
  'src/lib/shows.ts',
  'src/lib/show-loaders.ts',
  'src/app/sitemap.ts',
  'src/app/robots.ts',
  'src/messages/en.json',
  'src/messages/hr.json',
] as const

/** Both spellings: the Payload field and the Postgres column. */
const VIDEO_WORDS = ['videourl', 'video_url'] as const

/** Line comments, block comments and JSX comments; string literals are kept. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function sourceFilesUnder(dir: string): string[] {
  const abs = path.join(ROOT, dir)
  const out: string[] = []
  for (const entry of readdirSync(abs)) {
    const rel = path.join(dir, entry)
    if (statSync(path.join(ROOT, rel)).isDirectory()) {
      out.push(...sourceFilesUnder(rel))
    } else if (/\.(ts|tsx|json)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(rel)
    }
  }
  return out
}

describe('the video never reaches a public surface', () => {
  const files = [...PUBLIC_TREES.flatMap(sourceFilesUnder), ...PUBLIC_FILES]

  it('scans a non-trivial number of public files', () => {
    // A guard whose file list silently became empty would pass forever.
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files)('%s never names the video column', (file) => {
    const code = stripComments(readFileSync(path.join(ROOT, file), 'utf8')).toLowerCase()
    for (const word of VIDEO_WORDS) {
      expect(code, `${file} must not mention ${word}: an unlisted link is not public`).not.toContain(
        word,
      )
    }
  })

  it('reads the shows row by explicit fields, never with a wildcard select', () => {
    // How the column would arrive without anybody deciding to add it.
    for (const file of ['src/lib/shows.ts', 'src/lib/show-loaders.ts']) {
      const code = stripComments(readFileSync(path.join(ROOT, file), 'utf8'))
      expect(code, `${file} must not SELECT *`).not.toMatch(/select\s+\*\s+from\s+(public\.)?shows/i)
    }
  })
})
