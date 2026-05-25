import { describe, expect, it } from 'vitest'
import {
  buildEndDate,
  buildEventJsonLd,
  buildStartDate,
  deriveAvailability,
  deriveEventStatus,
  type EventShowInput,
} from './event-jsonld'
import { VENUE_CAPACITY } from './venues'

const baseShow: EventShowInput = {
  id: '42',
  date: '2026-08-14',
  time: '21:00',
  venue: 'ljetno-kino',
  remaining: 200,
  status: 'active',
}

describe('buildStartDate / buildEndDate', () => {
  it('emits ISO with local Korčula offset', () => {
    expect(buildStartDate('2026-08-14', '21:00')).toBe('2026-08-14T21:00:00+02:00')
  })

  it('adds 60 minutes to compute end', () => {
    expect(buildEndDate('2026-08-14', '21:00')).toBe('2026-08-14T22:00:00+02:00')
    expect(buildEndDate('2026-08-14', '10:30')).toBe('2026-08-14T11:30:00+02:00')
  })

  it('overflows past midnight to next day', () => {
    expect(buildEndDate('2026-08-14', '23:30')).toBe('2026-08-15T00:30:00+02:00')
  })

  it('accepts a full ISO datetime in date arg and slices to date portion', () => {
    expect(buildStartDate('2026-08-14T00:00:00.000Z', '21:00')).toBe(
      '2026-08-14T21:00:00+02:00',
    )
  })
})

describe('deriveAvailability', () => {
  const cap = VENUE_CAPACITY['ljetno-kino']

  it('returns SoldOut when remaining <= 0', () => {
    expect(deriveAvailability(0, cap)).toBe('https://schema.org/SoldOut')
    expect(deriveAvailability(-5, cap)).toBe('https://schema.org/SoldOut')
  })

  it('returns LimitedAvailability at <=20% of capacity', () => {
    // 20% of 320 = 64
    expect(deriveAvailability(64, cap)).toBe('https://schema.org/LimitedAvailability')
    expect(deriveAvailability(1, cap)).toBe('https://schema.org/LimitedAvailability')
  })

  it('returns InStock above 20% capacity', () => {
    expect(deriveAvailability(65, cap)).toBe('https://schema.org/InStock')
    expect(deriveAvailability(cap, cap)).toBe('https://schema.org/InStock')
  })
})

describe('deriveEventStatus', () => {
  it('maps active → EventScheduled, cancelled → EventCancelled', () => {
    expect(deriveEventStatus('active')).toBe('https://schema.org/EventScheduled')
    expect(deriveEventStatus(undefined)).toBe('https://schema.org/EventScheduled')
    expect(deriveEventStatus('cancelled')).toBe('https://schema.org/EventCancelled')
  })
})

describe('buildEventJsonLd', () => {
  const jsonLd = buildEventJsonLd(baseShow)

  it('emits a valid schema.org Event shape', () => {
    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(jsonLd['@type']).toBe('Event')
    expect(jsonLd.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode')
    expect(jsonLd.startDate).toBe('2026-08-14T21:00:00+02:00')
    expect(jsonLd.endDate).toBe('2026-08-14T22:00:00+02:00')
  })

  it('builds a Place with Korčula PostalAddress', () => {
    const loc = jsonLd.location as { '@type': string; name: string; address: Record<string, string> }
    expect(loc['@type']).toBe('Place')
    expect(loc.name).toContain('Summer Cinema')
    expect(loc.address['@type']).toBe('PostalAddress')
    expect(loc.address.addressLocality).toBe('Korčula')
    expect(loc.address.addressCountry).toBe('HR')
    expect(loc.address.postalCode).toBe('20260')
  })

  it('uses zimsko-kino name + address for indoor venue', () => {
    const j = buildEventJsonLd({ ...baseShow, venue: 'zimsko-kino' })
    const loc = j.location as { name: string; address: Record<string, string> }
    expect(loc.name).toContain('Cultural Center Korčula')
    expect(loc.address.streetAddress).toBe('Trg Antuna i Stjepana Radića 1')
  })

  it('emits two offers (adult €20 + child €10) with EUR currency', () => {
    const offers = jsonLd.offers as Array<{
      name: string
      price: string
      priceCurrency: string
      availability: string
      url: string
    }>
    expect(offers).toHaveLength(2)
    const adult = offers.find((o) => o.name === 'Adult ticket')!
    const child = offers.find((o) => o.name === 'Child ticket')!
    expect(adult.price).toBe('20.00')
    expect(child.price).toBe('10.00')
    expect(adult.priceCurrency).toBe('EUR')
    expect(child.priceCurrency).toBe('EUR')
    expect(adult.url).toBe('https://moreska.eu/checkout/42')
  })

  it('reflects sold-out availability when remaining=0', () => {
    const j = buildEventJsonLd({ ...baseShow, remaining: 0 })
    const offers = j.offers as Array<{ availability: string }>
    expect(offers[0].availability).toBe('https://schema.org/SoldOut')
  })

  it('emits EventCancelled when status=cancelled', () => {
    const j = buildEventJsonLd({ ...baseShow, status: 'cancelled' })
    expect(j.eventStatus).toBe('https://schema.org/EventCancelled')
  })

  it('uses the brand-layer Organization shape for performer + organizer', () => {
    const performer = jsonLd.performer as { '@type': string; name: string; alternateName: string }
    expect(performer['@type']).toBe('Organization')
    expect(performer.name).toBe('HGD Sveta Cecilija')
    expect(performer.alternateName).toBe('Moreška by HGD Sveta Cecilija')
  })

  it('serialises to valid JSON', () => {
    expect(() => JSON.stringify(jsonLd)).not.toThrow()
    const s = JSON.stringify(jsonLd)
    expect(s).not.toContain('</script')
  })
})
