import { describe, expect, it } from 'vitest'
import { BACKOFFICE_PORTS, backofficeRedirects } from './backoffice-ports'

// The redirects a retired Backoffice screen leaves behind (#504, #508).
//
// Next matches `redirects()` in order, so the ordering assertion below is the
// real test: with the bare `/admin/stats` rule first, `/admin/stats/42` would
// never reach the evening it names.

describe('the Backoffice ports', () => {
  it('sends every old /admin path into /app', () => {
    for (const port of BACKOFFICE_PORTS) {
      expect(port.source.startsWith('/admin/')).toBe(true)
      expect(port.destination.startsWith('/app/')).toBe(true)
      expect(port.ticket).toMatch(/^#\d+$/)
    }
  })

  it('carries the Statistika pair, drill-down first', () => {
    const sources = BACKOFFICE_PORTS.map((p) => p.source)
    expect(sources).toContain('/admin/stats')
    expect(sources.indexOf('/admin/stats/:showId')).toBeLessThan(sources.indexOf('/admin/stats'))
  })

  it('points the per-show drill-down at the evening itself, not at a season page', () => {
    // `/admin/stats/<id>` was one evening's numbers; those live on Izvedbe now
    // (#502), which is also where a row of the new season table links.
    const drill = BACKOFFICE_PORTS.find((p) => p.source === '/admin/stats/:showId')
    expect(drill?.destination).toBe('/app/performances/:showId')
    expect(BACKOFFICE_PORTS.find((p) => p.source === '/admin/stats')?.destination).toBe('/app/stats')
  })

  it('is a 308 every time, so a bookmarked ?season= survives', () => {
    const redirects = backofficeRedirects()
    expect(redirects).toHaveLength(BACKOFFICE_PORTS.length)
    for (const redirect of redirects) {
      expect(redirect.permanent).toBe(true)
      expect(Object.keys(redirect).sort()).toEqual(['destination', 'permanent', 'source'])
    }
  })
})
