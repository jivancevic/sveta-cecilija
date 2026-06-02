export type Venue = 'ljetno-kino' | 'zimsko-kino'

export const VENUE_CAPACITY: Record<Venue, number> = {
  'ljetno-kino': 320,
  'zimsko-kino': 250,
}

// Public-facing venue names per locale (the DB values are slugs). Single
// source of truth for any buyer-facing surface — emails, confirmations, etc.
// Matches the schedule.* / performancesPage.* translation strings in CLAUDE.md.
export const VENUE_LABEL: Record<'en' | 'hr', Record<Venue, string>> = {
  en: { 'ljetno-kino': 'Summer Cinema', 'zimsko-kino': 'Cultural Center Korčula' },
  hr: { 'ljetno-kino': 'Ljetno kino', 'zimsko-kino': 'Centar za kulturu' },
}
