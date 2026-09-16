// What a screen is showing, written where Back can find it (#666).
//
// ADR-0030: everything that changes WHAT YOU SEE lives in the address. A search
// term, a filter chip, a page number, an open "Prošle izvedbe" — each of them
// used to live in `useState` or in a `<details>`, and `ScreenTransition` rebuilds
// the page on every navigation (`<div key={pathname}>`, for the slide), so each
// of them was gone the moment the reader opened a row and came back. The address
// is the one thing that survives, because it IS the history entry.
//
// This is the arithmetic half: given the address a screen is on and a change to
// it, what is the new address. No router, no window, no React — so the rules can
// be read in a table instead of in a browser.
//
// Two shapes of caller, and the difference matters:
//
//   * A screen the SERVER filters (Narudžbe, Upiti) navigates, because a new
//     address means a new answer from the database.
//   * A screen the BROWSER filters (Članovi, and the open state of a details)
//     only MIRRORS, with `history.replaceState`: the rows are already in the
//     page, typing must narrow them on the keystroke, and a navigation per
//     keystroke would be a round trip per letter on a bar of 3G in a hall.
//
// Both end up with the same address, which is the point: Back cannot tell them
// apart, and neither can a reader who bookmarks one.

/**
 * The key both "Prošle izvedbe" harmonicas use — Moreška's and Izvedbe's.
 *
 * Named once, because the two screens are read by two different people in two
 * different registers and the address is the one thing they share.
 */
export const PAST_PARAM = 'past'

/** A change to the address: a value to set, or null to take the key out. */
export type ScreenPatch = Record<string, string | null | undefined>

/**
 * The search string a patch produces, with a leading `?`, or `''` when empty.
 *
 * Empty means EMPTY: a screen whose filters are all at their default gets a
 * bare address, so tapping the tab and clearing the last chip land the reader in
 * the same place, and so a link pasted into a chat is the shortest true one.
 *
 * Existing keys keep their position — a filter that jumped from the end of the
 * address to the front on every keystroke would make the address bar flicker on
 * the screens that show one.
 */
export function nextSearch(current: string, patch: ScreenPatch): string {
  const params = new URLSearchParams(current.startsWith('?') ? current.slice(1) : current)
  for (const [key, value] of Object.entries(patch)) {
    const clean = typeof value === 'string' ? value.trim() : ''
    if (clean === '') params.delete(key)
    else params.set(key, clean)
  }
  const search = params.toString()
  return search === '' ? '' : `?${search}`
}

/** The whole address a patch produces. `pathname` is taken as given. */
export function nextHref(pathname: string, current: string, patch: ScreenPatch): string {
  return `${pathname}${nextSearch(current, patch)}`
}

/**
 * One free-text parameter — a search box.
 *
 * Trimmed, because " " in an address is a filter that hides every row and looks
 * like a broken screen.
 */
export function readText(search: string | null | undefined, key: string): string {
  if (!search) return ''
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(key)
  return (raw ?? '').trim()
}

/**
 * One parameter out of a fixed set — a filter chip, a segmented control.
 *
 * A word that is not in the set reads as the fallback rather than as an error:
 * an address is typed by people and outlives the code that wrote it, and a
 * roster screen that refuses to render because a chip was renamed last month is
 * worse than one that opens on "Svi".
 */
export function readOneOf<T extends string>(
  search: string | null | undefined,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readText(search, key)
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
}

/**
 * One yes-or-no parameter — an open `<details>`.
 *
 * Present and `1` is open; anything else is closed. Only the open state is ever
 * written, so a closed harmonica leaves no trace in the address at all.
 */
export function readFlag(search: string | null | undefined, key: string): boolean {
  return readText(search, key) === '1'
}

/** The value to patch a flag with: `'1'` when open, `null` when closed. */
export function flagValue(open: boolean): string | null {
  return open ? '1' : null
}

/**
 * The address as a SERVER component receives it.
 *
 * Next hands a page an object rather than a string, and a repeated key arrives
 * as an array. Declared once here: `orders-query.ts` and `inquiries-query.ts`
 * each grew their own copy of this type, which is how two screens that page
 * through a list ended up with two ideas of what a page number is.
 */
export type RawSearchParams = Record<string, string | string[] | undefined>

/**
 * The first value for a key, trimmed.
 *
 * `?q=a&q=b` is not a thing any screen here means; it is what a hand-edited or
 * doubled-up link produces, and the first value is the one the reader typed.
 */
export function firstValue(params: RawSearchParams, key: string): string {
  const raw = params[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return (value ?? '').trim()
}

/** A yes-or-no parameter, read from what a server component was handed. */
export function readFlagParam(params: RawSearchParams, key: string): boolean {
  return firstValue(params, key) === '1'
}

/** One word out of a fixed set, read from what a server component was handed. */
export function readOneOfParam<T extends string>(
  params: RawSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = firstValue(params, key)
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
}
