// Handing an invitation over by phone (#463).
//
// `POST /api/app/invite/link` mints the invitation; this is the small pile of
// pure rules around getting it into a message: the dancer's number in the shape
// a phone dialler understands, and the two deep links that open a composer with
// the text already in it.
//
// **Send it by SMS, not WhatsApp and not Viber, and the UI says so.** A
// messenger opens a link in its own in-app browser, where "Add to Home Screen"
// does not exist at any scroll position, so the dancer signs in inside a
// webview and can never install the app from it. Messages hands the link to
// Safari, where they can. That dead end is the one #455 built a whole platform
// detector to rescue people from, and this is the half that stops them falling
// into it. The WhatsApp link is offered anyway, because a voditelj who has no
// SMS plan will otherwise paste the text somewhere worse, and `/app` catches
// the webview when it happens.
//
// Pure and table-tested; the components only render what these return.

import { memberEligibility, type LinkSelfMember } from './link-self'

/**
 * A Croatian mobile in international digits, or null when it cannot be read.
 *
 * `sms:` tolerates a lot and `wa.me` tolerates nothing: it wants digits only,
 * country code included, no `+`. Members' mobiles are typed by hand and come
 * out of macOS Contacts, so they arrive as `091 234 5678`, `+385 91 234 5678`
 * and `0912345678` in the same list.
 *
 * A leading `0` is read as Croatian and becomes `385…`, which is the one guess
 * made here. It is safe in a roster of a Korčula society and wrong the moment
 * somebody adds a foreign number without a country code, which is why a number
 * that does not survive these rules returns null and the caller offers a plain
 * "copy" instead of a broken deep link.
 */
export function normalizeMobile(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const plus = trimmed.startsWith('+') || trimmed.startsWith('00')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  const international = plus ? digits.replace(/^00/, '') : digits.startsWith('0') ? `385${digits.slice(1)}` : digits

  // Shortest plausible international number is 8 digits (a country code plus a
  // subscriber number); longest is 15 by E.164.
  if (international.length < 8 || international.length > 15) return null
  return international
}

/**
 * `sms:` with the message pre-filled, for the platform holding the phone.
 *
 * The separator between the number and the body is the one thing the two
 * platforms disagree on: iOS wants `&`, Android wants `?`, and each ignores the
 * other's parameter rather than failing visibly, which is how a voditelj ends
 * up sending an empty message. `platform` comes from `readPlatform()` (#455),
 * so the same detector decides this and the install steps.
 */
export function smsHref(
  mobile: string | null,
  message: string,
  platform: 'ios' | 'android' | 'other',
): string {
  const number = mobile ?? ''
  const separator = platform === 'ios' ? '&' : '?'
  return `sms:${number}${separator}body=${encodeURIComponent(message)}`
}

/** `https://wa.me/385…?text=…`, or the chooser when the number is unreadable. */
export function whatsappHref(mobile: string | null, message: string): string {
  const target = mobile ?? ''
  return `https://wa.me/${target}?text=${encodeURIComponent(message)}`
}

/** A roster row as this screen reads it: the self-link's shape plus the mobile. */
export interface InviteRosterMember extends LinkSelfMember {
  mobile?: string | null
}

/** One line of the voditelj's invitations list. A projection, never a spread. */
export interface InviteCandidate {
  id: string
  name: string
  nickname: string | null
  /** As typed on the Member row; the deep links normalise it (see above). */
  mobile: string | null
  /** Does some login already point at this Member (`member-logins.ts`)? */
  hasLogin: boolean
}

/**
 * The roster as the invitations screen lists it: every ACTIVE moreškant, with
 * the one fact that decides which half of the screen they are in.
 *
 * A dancer who already has a login stays on the list rather than disappearing
 * from it, because "Kopiraj pozivnicu" is idempotent and re-issuing is the
 * whole answer to a lost phone (#419, story 7). The screen simply puts them
 * under the ones who still need doing.
 *
 * The "is this a dancer at all" half of the rule is `memberEligibility`
 * (#462), which the self-link screen and the link-self POST already share:
 * "an active moreškant" has one definition here, not three.
 */
export function inviteCandidates(
  members: readonly InviteRosterMember[],
  memberIdsWithLogin: ReadonlySet<string>,
): InviteCandidate[] {
  return members
    .filter((m) => memberEligibility(m, false) === null)
    .map((m) => ({
      id: String(m.id),
      name: typeof m.name === 'string' ? m.name : '',
      nickname: typeof m.nickname === 'string' ? m.nickname : null,
      mobile: typeof m.mobile === 'string' ? m.mobile : null,
      hasLogin: memberIdsWithLogin.has(String(m.id)),
    }))
    .sort((a, b) =>
      (a.nickname || a.name).localeCompare(b.nickname || b.name, 'hr', { sensitivity: 'base' }),
    )
}
