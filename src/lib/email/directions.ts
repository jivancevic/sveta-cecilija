import type { Venue } from '../venues'
import en from '../../messages/en.json'
import hr from '../../messages/hr.json'

// Walking directions to a venue, for the two e-mails a buyer can receive about
// where to go: the ticket e-mail and the bad-weather venue change (#543).
//
// Prose first, map link under it (#541, decision 6): a map link in a foreign
// town at dusk on roaming data is a coin flip, prose keyed to a landmark works
// with no signal. The text lives in the `directions` namespace of the message
// files, one entry per venue, and the map links are the ones the schedule page
// already publishes (`performancesPage.venuePrimaryMapUrl`, `rainPlanMapUrl`),
// so there is no third source of venue links to keep in step.

export type Locale = 'en' | 'hr'

export interface VenueDirections {
  heading: string
  venue: string
  /** Two or three sentences from a named old-town landmark, in reading order. */
  prose: string[]
  /** How long the walk takes, one sentence. */
  walk: string
  /** What the entrance looks like, one sentence; there is no sign at the venue. */
  entrance: string
  mapLabel: string
  mapUrl: string
}

const MESSAGES = { en, hr } as const

const VENUE_KEY: Record<Venue, 'ljetnoKino' | 'zimskoKino'> = {
  'ljetno-kino': 'ljetnoKino',
  'zimsko-kino': 'zimskoKino',
}

export function directionsFor(locale: Locale, venue: Venue): VenueDirections {
  const m = MESSAGES[locale]
  const d = m.directions
  const v = d[VENUE_KEY[venue]]
  const mapUrl =
    venue === 'ljetno-kino' ? m.performancesPage.venuePrimaryMapUrl : m.performancesPage.rainPlanMapUrl
  return {
    heading: d.heading,
    venue: v.venue,
    prose: v.prose,
    walk: v.walk,
    entrance: v.entrance,
    mapLabel: d.mapLabel,
    mapUrl,
  }
}
