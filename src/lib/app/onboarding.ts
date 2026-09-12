// When a moreškant is shown the Dobrodošlica (#457, glossary: *Dobrodošlica*).
//
// The walkthrough is remembered ON THE DEVICE, not on the account: its three
// steps are "add this phone to the home screen", "let this phone ring" and
// "subscribe this calendar", none of which a server row could answer for a
// dancer who has just picked up a new phone. So the memory is a cookie, plus a
// localStorage twin, and either one counts as seen.
//
// The cookie is written by the SERVER (`POST /api/app/onboarding/done`), never
// by `document.cookie`: Safari's ITP caps a script-written cookie at seven
// days, so a browser-written "one year" would quietly become "next week" and
// the walkthrough would come back at a dancer every Monday. An `HttpOnly`
// cookie from a `Set-Cookie` header keeps the year it was given.
//
// localStorage is the rescue rather than the record. The client writes it when
// the walkthrough ends, and `/app/dobrodosli` reads it ON MOUNT: a device whose
// cookie expired or was cleared (a private window, a "clear site data") says
// "I have seen this", re-asks the route for the cookie and goes straight to the
// list, so nobody is walked through the same three steps twice.
//
// The redirect itself is a rule about one page only. `/app` is the single door
// that may send a dancer into the walkthrough; every other page under `/app`
// opens on what it says it is. That matters most for `/app/izvedba/[id]`: a
// push notification about tonight's postava must land on tonight's postava, and
// a tutorial in front of it would be the app failing at the one moment it is
// supposed to be quick.

/** The cookie the server writes; `Path=/app`, so it never reaches the site. */
export const ONBOARDING_COOKIE = 'cecilija_onboarded'

/** The localStorage twin, the rescue for a device that lost the cookie. */
export const ONBOARDING_STORAGE_KEY = 'cecilija.onboarding.done'

/** A year: long enough that a dancer sees it once per phone, per season. */
export const ONBOARDING_MAX_AGE_SECONDS = 31_536_000

/**
 * The `Set-Cookie` value `POST /api/app/onboarding/done` answers with.
 *
 * `HttpOnly` because nothing in the browser reads it — the redirect rule is a
 * server decision and localStorage is the client's own copy — and because that
 * is what puts it out of reach of ITP's seven-day cap on script-written
 * cookies. `Secure` follows the scheme the request actually arrived on, so
 * `http://localhost:3000` in development still gets a cookie the browser keeps.
 */
export function onboardingCookie(options: { secure: boolean }): string {
  const parts = [
    `${ONBOARDING_COOKIE}=1`,
    'Path=/app',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ONBOARDING_MAX_AGE_SECONDS}`,
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

/**
 * Should `/app` send this viewer to `/app/dobrodosli`?
 *
 * Four facts, all of them already known to the page: a signed-out visitor is
 * on their way to the login, a denied account gets the "Nemate pristup" page,
 * and an account with no Member (a voditelj who does not dance) has nothing to
 * be welcomed to. Everyone else sees it exactly once per device.
 */
export function needsOnboarding(input: {
  signedIn: boolean
  denied: boolean
  hasMember: boolean
  cookiePresent: boolean
}): boolean {
  if (!input.signedIn) return false
  if (input.denied) return false
  if (!input.hasMember) return false
  return !input.cookiePresent
}
