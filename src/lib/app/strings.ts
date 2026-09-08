// Every word `/app` says, in one place (#421).
//
// The Moreškant app is Croatian-only by decision (ADR-0024, story 33): it is a
// tool for the society's own dancers, not a second face of the ticket shop, so
// it carries no i18n layer, no locale cookie and no `src/messages` dictionary.
// One frozen map, imported by the pages and by the route handlers that answer
// with a message.
//
// Copy rules (CONTEXT.md): "moreška" lowercase in Croatian, a dancer is a
// "moreškant" and never a "moreškar", the event noun is "izvedba" (never
// "nastup" or "predstava"), and no em-dashes in anything a person reads.

import type { PerformanceKind } from '@/lib/show-performance'
import type { DanceRole } from '@/lib/moreskant-profile'
import { DANCE_ROLE_LABELS } from '@/lib/moreskant-profile'

export const APP_STRINGS = {
  /** The product name: the manifest, the header and the browser tab all use it. */
  name: 'Moreškant',
  tagline: 'Raspored izvedbi',

  header: {
    logout: 'Odjava',
    /** Shown next to the nickname when the account has no dance roles yet. */
    noRoles: 'bez uloge',
  },

  login: {
    title: 'Prijava',
    intro: 'Prijavi se e-mailom ili korisničkim imenom.',
    identifier: 'E-mail ili korisničko ime',
    password: 'Lozinka',
    submit: 'Prijavi se',
    submitting: 'Prijava u tijeku...',
    missingFields: 'Upiši e-mail ili korisničko ime i lozinku.',
    failed: 'Neispravni podaci za prijavu.',
    unexpected: 'Prijava trenutno nije moguća. Pokušaj ponovno.',
  },

  denied: {
    title: 'Nemate pristup',
    body: 'Ova aplikacija je za moreškante i voditelje. Ako trebaš uredski dio, otvori administraciju.',
    adminLink: 'Otvori administraciju',
    logout: 'Odjavi se',
  },

  tabs: {
    upcoming: 'Nadolazeće',
    past: 'Prošle',
  },

  list: {
    emptyUpcoming: 'Nema više izvedbi u ovoj sezoni.',
    emptyPast: 'Ove sezone još nije bilo izvedbi.',
    season: 'Sezona',
  },

  card: {
    cancelled: 'Otkazano',
    noteLabel: 'Voditelj',
  },

  /**
   * The two buttons and everything that can go wrong around them (#422).
   *
   * `locked` and `cancelled` are ONE sentence each, shared by the card, the
   * detail view and the answer route's refusal: a dancer who taps a locked
   * button and a dancer whose POST is refused are in the same situation, and
   * two wordings for it would only look like two different rules.
   */
  answer: {
    coming: 'Dolazim',
    notComing: 'Ne dolazim',
    clear: 'Poništi',
    locked: 'Izvedba je počela, odgovori se više ne mijenjaju.',
    cancelled: 'Izvedba je otkazana.',
    failed: 'Odgovor nije spremljen. Pokušaj ponovno.',
    saving: 'Spremam...',
  },

  /** The performance detail and the voditelj's headcount (#423). */
  detail: {
    back: 'Natrag',
    note: 'Poruka voditelja',
    crni: 'Crni',
    bili: 'Bili',
    bula: 'Bule',
    notComing: 'Ne dolaze',
    noAnswer: 'Bez odgovora',
    empty: 'Nema nikoga.',
    call: 'Nazovi',
    move: 'Prebaci',
    moveTo: (army: string) => `Prebaci u ${army}`,
    missing: 'Ta izvedba ne postoji.',
  },

  /**
   * The invitation a voditelj sends and the two pages it leads to (#424).
   *
   * The four refusals are the four things a voditelj can fix themselves on the
   * Member form, so each one names the field rather than the rule.
   */
  invite: {
    action: 'Pošalji pozivnicu',
    sending: 'Šaljem...',
    missingMember: 'Taj član ne postoji.',
    notMoreskant: 'Član nije označen kao moreškant. Označi ga i spremi, pa pošalji pozivnicu.',
    notActive: 'Član nije aktivan.',
    noEmail: 'Član nema e-mail adresu. Upiši je i spremi, pa pošalji pozivnicu.',
    createFailed: 'Prijava se ne može otvoriti. Provjeri je li ta e-mail adresa već na nekom računu.',
    tokenFailed: 'Poveznica se ne može izraditi. Pokušaj ponovno.',
    sentNew: 'Pozivnica je poslana i prijava je otvorena.',
    sentAgain: 'Nova poveznica je poslana na e-mail člana.',
    unexpected: 'Slanje trenutno nije moguće. Pokušaj ponovno.',
    /** The Members list column: does this member already have a login? */
    hasLogin: 'Ima prijavu',
  },

  /** Choosing a password from an invitation or a reset link (#424). */
  setPassword: {
    title: 'Postavi lozinku',
    intro: 'Odaberi lozinku za aplikaciju Moreškant.',
    password: 'Nova lozinka',
    repeat: 'Ponovi lozinku',
    submit: 'Spremi i prijavi se',
    submitting: 'Spremam...',
    missingToken: 'Poveznica nije ispravna. Zatraži novu.',
    tooShort: 'Lozinka mora imati barem 8 znakova.',
    mismatch: 'Lozinke se ne podudaraju.',
    invalidToken: 'Poveznica nije ispravna ili je istekla. Zatraži novu.',
    unexpected: 'Spremanje trenutno nije moguće. Pokušaj ponovno.',
  },

  /** "Zaboravljena lozinka": one answer, whatever was typed (#424). */
  forgot: {
    title: 'Zaboravljena lozinka',
    link: 'Zaboravljena lozinka',
    intro: 'Upiši svoj e-mail ili korisničko ime. Ako račun postoji, poslat ćemo poveznicu za novu lozinku.',
    identifier: 'E-mail ili korisničko ime',
    submit: 'Pošalji poveznicu',
    submitting: 'Šaljem...',
    missing: 'Upiši e-mail ili korisničko ime.',
    /** The SAME sentence for a hit and a miss: no account enumeration. */
    sent: 'Ako račun postoji, poveznica je poslana na e-mail te osobe.',
    unexpected: 'Slanje trenutno nije moguće. Pokušaj ponovno.',
    backToLogin: 'Natrag na prijavu',
  },

  install: {
    title: 'Dodaj na početni zaslon',
    body: 'Otvori izbornik preglednika i odaberi "Dodaj na početni zaslon" za ikonu Moreškant.',
    dismiss: 'Sakrij',
  },
} as const

/** Croatian labels for the performance kinds (ADR-0024). */
export const KIND_LABELS: Record<PerformanceKind, string> = {
  redovna: 'Redovna',
  dmc: 'Adriatic DMC',
  gulliver: 'Gulliver',
  koncert: 'Koncert',
  ostalo: 'Ostalo',
}

/** Croatian labels for the dance roles; the vocabulary itself lives in lib. */
export const ROLE_LABELS: Record<DanceRole, string> = DANCE_ROLE_LABELS

const WEEKDAYS = [
  'nedjelja',
  'ponedjeljak',
  'utorak',
  'srijeda',
  'četvrtak',
  'petak',
  'subota',
] as const

const MONTHS = [
  'siječnja',
  'veljače',
  'ožujka',
  'travnja',
  'svibnja',
  'lipnja',
  'srpnja',
  'kolovoza',
  'rujna',
  'listopada',
  'studenoga',
  'prosinca',
] as const

/**
 * "srijeda, 5. kolovoza" from a YYYY-MM-DD date.
 *
 * Hand-rolled rather than `Intl`: Croatian month names decline, and the genitive
 * ("5. kolovoza") is what a date reads like in a sentence, which `Intl`'s
 * nominative ("5. kolovoz") does not give. Parsed as UTC noon so no timezone can
 * shift the calendar day.
 */
export function formatPerformanceDate(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return date
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`
}
