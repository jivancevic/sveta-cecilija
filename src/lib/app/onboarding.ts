// When a moreškant is shown the Dobrodošlica (#457, glossary: *Dobrodošlica*).
//
// The walkthrough is remembered ON THE DEVICE, not on the account: its three
// steps are "add this phone to the home screen", "let this phone ring" and
// "subscribe this calendar", none of which a server row could answer for a
// dancer who has just picked up a new phone. So the memory is a cookie the
// BROWSER writes, with a localStorage twin as a fallback for a browser that
// drops the cookie, and either one counts as seen.
//
// The redirect itself is a rule about one page only. `/app` is the single door
// that may send a dancer into the walkthrough; every other page under `/app`
// opens on what it says it is. That matters most for `/app/izvedba/[id]`: a
// push notification about tonight's postava must land on tonight's postava, and
// a tutorial in front of it would be the app failing at the one moment it is
// supposed to be quick.

/** The cookie the browser writes; `Path=/app`, so it never reaches the site. */
export const ONBOARDING_COOKIE = 'moreskant_onboarded'

/** The localStorage twin, for a browser that refuses the cookie. */
export const ONBOARDING_STORAGE_KEY = 'moreskant.onboarding.done'

/** A year: long enough that a dancer sees it once per phone, per season. */
export const ONBOARDING_MAX_AGE_SECONDS = 31_536_000

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
