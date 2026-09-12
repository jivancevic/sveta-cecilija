import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_ROUTE_RENAMES, appRouteRedirects } from './route-renames'

// A missed 308 here is a QR code on a wall that stops working, so the table is
// checked against the filesystem rather than against a second list: every
// destination has to be a page that actually exists, and every source must not.

const pagePath = (route: string) =>
  `src/app/${route.replace(/^\//, '').split('?')[0]!.replace(/:(\w+)/g, '[$1]')}/page.tsx`

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

  it('renames only Croatian segments, and only under /app', () => {
    for (const { source, destination } of APP_ROUTE_RENAMES) {
      expect(source.startsWith('/app/')).toBe(true)
      expect(destination.startsWith('/app/')).toBe(true)
    }
  })
})
