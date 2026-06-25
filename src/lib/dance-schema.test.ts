import { describe, it, expect } from 'vitest'
import { buildMoreskaCreativeWorkJsonLd } from './dance-schema'
import { SITE_URL, ORG_LEGAL_NAME, BRAND_LAYER } from './seo'

describe('buildMoreskaCreativeWorkJsonLd', () => {
  const ld = buildMoreskaCreativeWorkJsonLd()

  it('is a schema.org CreativeWork for the Moreška dance', () => {
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('CreativeWork')
    expect(ld['@id']).toBe(`${SITE_URL}/#moreska`)
    expect(ld.name).toBe('Moreška')
    expect(ld.alternateName).toBe('Moreška sword dance')
    expect(ld.genre).toBe('sword dance')
  })

  it('locates the dance in Korčula, Croatia', () => {
    const loc = ld.locationCreated as Record<string, unknown>
    expect(loc['@type']).toBe('Place')
    expect(loc.name).toBe('Korčula')
    const addr = loc.address as Record<string, unknown>
    expect(addr.addressLocality).toBe('Korčula')
    expect(addr.addressCountry).toBe('HR')
  })

  it('carries a temporalCoverage grounded in the 1666 first record', () => {
    expect(ld.temporalCoverage).toBe('1666/..')
  })

  it('credits the Organization as creator and maintainer', () => {
    const creator = ld.creator as Record<string, unknown>
    const maintainer = ld.maintainer as Record<string, unknown>
    expect(creator).toEqual(maintainer)
    expect(creator['@type']).toBe('Organization')
    expect(creator.name).toBe(ORG_LEGAL_NAME)
    expect(creator.alternateName).toBe(BRAND_LAYER)
    expect(creator.url).toBe(SITE_URL)
  })
})
