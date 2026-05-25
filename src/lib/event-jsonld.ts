import { VENUE_CAPACITY, type Venue } from './venues'
import { SITE_URL, ORG_LEGAL_NAME, BRAND_LAYER, DEFAULT_OG_IMAGE } from './seo'

/**
 * Schema.org Event JSON-LD generator.
 *
 * Used by /tickets (one Event per upcoming Show) and /checkout/[showId]
 * (single Event being purchased). SEO-only — no visible UI.
 *
 * Source of truth for show data is `getUpcomingShows()` in `./shows.ts`;
 * this module is a pure transformation and does no IO.
 */

export type ShowStatus = 'active' | 'cancelled'

export interface EventShowInput {
  id: string
  date: string // YYYY-MM-DD or ISO string
  time: string // HH:MM (24h)
  venue: Venue
  remaining: number
  status?: ShowStatus
}

const ADULT_PRICE = 20
const CHILD_PRICE = 10
const CURRENCY = 'EUR'
const SHOW_DURATION_MINUTES = 60
// Croatia is Europe/Zagreb (CET/CEST). Show times in DB are local Korčula time.
// Use a fixed offset that matches when shows actually run (summer season → +02:00).
// Off-season shows would emit a slightly wrong absolute timestamp; acceptable for SEO.
const LOCAL_TZ_OFFSET = '+02:00'

const VENUE_PLACE: Record<
  Venue,
  { name: string; streetAddress?: string }
> = {
  'ljetno-kino': {
    name: 'Summer Cinema (Ljetno kino)',
    // Open-air venue on the old town walls — no formal street address.
    streetAddress: 'Old Town',
  },
  'zimsko-kino': {
    name: 'Cultural Center Korčula (Centar za kulturu)',
    streetAddress: 'Trg Antuna i Stjepana Radića 1',
  },
}

const KORCULA_ADDRESS = {
  addressLocality: 'Korčula',
  postalCode: '20260',
  addressRegion: 'Dubrovnik-Neretva County',
  addressCountry: 'HR',
} as const

export function buildStartDate(date: string, time: string): string {
  // Normalise date → YYYY-MM-DD
  const day = date.length > 10 ? date.slice(0, 10) : date
  return `${day}T${time}:00${LOCAL_TZ_OFFSET}`
}

export function buildEndDate(date: string, time: string): string {
  const day = date.length > 10 ? date.slice(0, 10) : date
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  const totalMin = h * 60 + m + SHOW_DURATION_MINUTES
  const endH = Math.floor(totalMin / 60) % 24
  const dayOverflow = Math.floor(totalMin / 60) >= 24
  const endM = totalMin % 60
  const endDay = dayOverflow ? addOneDay(day) : day
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${endDay}T${pad(endH)}:${pad(endM)}:00${LOCAL_TZ_OFFSET}`
}

function addOneDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export type Availability =
  | 'https://schema.org/InStock'
  | 'https://schema.org/LimitedAvailability'
  | 'https://schema.org/SoldOut'

export function deriveAvailability(remaining: number, capacity: number): Availability {
  if (remaining <= 0) return 'https://schema.org/SoldOut'
  // <20% of capacity left → LimitedAvailability
  if (remaining / capacity <= 0.2) return 'https://schema.org/LimitedAvailability'
  return 'https://schema.org/InStock'
}

export type EventStatus =
  | 'https://schema.org/EventScheduled'
  | 'https://schema.org/EventCancelled'

export function deriveEventStatus(status: ShowStatus | undefined): EventStatus {
  return status === 'cancelled'
    ? 'https://schema.org/EventCancelled'
    : 'https://schema.org/EventScheduled'
}

export interface EventJsonLdOptions {
  /** Override image (defaults to `DEFAULT_OG_IMAGE` from seo.ts). */
  image?: string
}

export function buildEventJsonLd(
  show: EventShowInput,
  opts: EventJsonLdOptions = {},
): Record<string, unknown> {
  const capacity = VENUE_CAPACITY[show.venue]
  const place = VENUE_PLACE[show.venue]
  const startDate = buildStartDate(show.date, show.time)
  const endDate = buildEndDate(show.date, show.time)
  const availability = deriveAvailability(show.remaining, capacity)
  const eventStatus = deriveEventStatus(show.status)
  const url = `${SITE_URL}/checkout/${show.id}`
  const image = `${SITE_URL}${opts.image ?? DEFAULT_OG_IMAGE}`

  const offerBase = {
    '@type': 'Offer',
    priceCurrency: CURRENCY,
    availability,
    url,
    validFrom: new Date().toISOString(),
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Moreška Sword Dance',
    description:
      'Korčula’s traditional Moreška sword dance, performed by HGD Sveta Cecilija since 1883. One-hour programme: klapa performance followed by Moreška with live wind orchestra.',
    startDate,
    endDate,
    eventStatus,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: [image],
    url,
    location: {
      '@type': 'Place',
      name: place.name,
      address: {
        '@type': 'PostalAddress',
        ...(place.streetAddress ? { streetAddress: place.streetAddress } : {}),
        ...KORCULA_ADDRESS,
      },
    },
    organizer: {
      '@type': 'Organization',
      name: ORG_LEGAL_NAME,
      alternateName: BRAND_LAYER,
      url: SITE_URL,
    },
    performer: {
      '@type': 'Organization',
      name: ORG_LEGAL_NAME,
      alternateName: BRAND_LAYER,
      url: SITE_URL,
    },
    offers: [
      {
        ...offerBase,
        name: 'Adult ticket',
        price: ADULT_PRICE.toFixed(2),
      },
      {
        ...offerBase,
        name: 'Child ticket',
        price: CHILD_PRICE.toFixed(2),
      },
    ],
  }
}
