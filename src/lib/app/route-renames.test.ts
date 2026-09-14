import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_ROUTE_RENAMES, appRouteRedirects } from './route-renames'

// A missed 308 here is a QR code on a wall that stops working, so the table is
// checked against the filesystem rather than against a second list: every
// destination has to be a page that actually exists, and every source must not.

/**
 * The file that serves a URL, route GROUPS included (#593).
 *
 * `/app/orders` is `src/app/app/(shell)/orders/page.tsx`: a folder in
 * parentheses is a layout boundary and never a path segment, so the walk may
 * step into one at any level without consuming a segment of the URL. Spelling
 * the group into the expected path instead would make this test a second copy
 * of the folder layout, which is exactly what it exists not to be.
 */
function pagePath(route: string): string {
  const segments = route
    .replace(/^\//, '')
    .split('?')[0]!
    .replace(/:(\w+)/g, '[$1]')
    .split('/')
    .filter((s) => s !== '')

  function walk(dir: string, rest: string[]): string | null {
    if (rest.length === 0) return existsSync(`${dir}/page.tsx`) ? `${dir}/page.tsx` : null
    const [head, ...tail] = rest
    const direct = walk(`${dir}/${head}`, tail)
    if (direct) return direct
    let entries: string[] = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith('(') && e.name.endsWith(')'))
        .map((e) => e.name)
    } catch {
      return null
    }
    for (const group of entries) {
      const found = walk(`${dir}/${group}`, rest)
      if (found) return found
    }
    return null
  }

  // A route that resolves to nothing still has to produce a path, so the
  // assertion's message names the file the reader would have expected.
  return walk('src/app', segments) ?? `src/app/${segments.join('/')}/page.tsx`
}

describe('the Croatian → English renames', () => {
  it('sends every old path somewhere that exists', () => {
    for (const { source, destination } of APP_ROUTE_RENAMES) {
      expect(existsSync(pagePath(destination)), `${source} → ${destination}`).toBe(true)
    }
  })

  it('carries the season over where the query was renamed too', () => {
    const withSeason = APP_ROUTE_RENAMES.filter((r) => r.has)
    expect(withSeason.map((r) => r.source)).toEqual(['/app/moje', '/app/statistika'])
    for (const rename of withSeason) {
      expect(rename.destination).toContain(':sezona')
      // The capturing entry must be matched BEFORE the plain one, or the plain
      // one swallows every request and the year is lost anyway.
      const plain = APP_ROUTE_RENAMES.findIndex(
        (r) => r.source === rename.source && !r.has,
      )
      expect(APP_ROUTE_RENAMES.indexOf(rename)).toBeLessThan(plain)
    }
  })

  it('has no source that is still a page of its own', () => {
    for (const { source } of APP_ROUTE_RENAMES) {
      expect(existsSync(pagePath(source)), source).toBe(false)
    }
  })

  it('keeps the QR target and the sign-in link forever', () => {
    const forever = APP_ROUTE_RENAMES.filter((r) => r.keep === 'forever').map((r) => r.source)
    expect(forever).toEqual(['/app/instalacija', '/app/prijava'])
  })

  it('hands next.config a permanent redirect for each one', () => {
    const redirects = appRouteRedirects()
    expect(redirects).toHaveLength(APP_ROUTE_RENAMES.length)
    expect(redirects.every((r) => r.permanent)).toBe(true)
  })

  it('folds Pozivnice into Članovi from both of its old paths (#511)', () => {
    // The screen was absorbed rather than renamed, so BOTH old addresses point
    // at the new screen: the Croatian one skips the intermediate English path
    // instead of 308ing to a 308.
    const to = (source: string) =>
      APP_ROUTE_RENAMES.find((r) => r.source === source && !r.has)?.destination
    expect(to('/app/pozivnice')).toBe('/app/members')
    expect(to('/app/invitations')).toBe('/app/members')
  })

  it('sends the two old Moje paths to the panel each one means (#568)', () => {
    // Ljestvica opens on the board since #568, so a path whose own meaning is
    // "my season" has to say `part=mine` or the bookmark lands on the ranking.
    // `/app/statistika` WAS the scoreboard, so it keeps `part=all`.
    const to = (source: string) =>
      APP_ROUTE_RENAMES.find((r) => r.source === source && !r.has)?.destination
    expect(to('/app/moje')).toBe('/app/leaderboard?part=mine')
    expect(to('/app/statistika')).toBe('/app/leaderboard?part=all')

    const withSeason = (source: string) =>
      APP_ROUTE_RENAMES.find((r) => r.source === source && r.has)?.destination
    expect(withSeason('/app/moje')).toBe('/app/leaderboard?season=:sezona&part=mine')
  })

  it('renames only Croatian segments, and only under /app', () => {
    for (const { source, destination } of APP_ROUTE_RENAMES) {
      expect(source.startsWith('/app/')).toBe(true)
      expect(destination.startsWith('/app/')).toBe(true)
    }
  })
})
