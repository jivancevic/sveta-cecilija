// Whether "natrag" has anywhere of our own to go (#666).
//
// Every detail screen in Cecilija used to carry a `<Link>` to the bare list
// root and call it Back. A push is not a pop: the browser restores nothing, the
// address loses whatever filter the reader had set, and `ScrollMemory` — which
// listens for `popstate` and nothing else — never gets its chance. So the fix
// is to make the control a real Back. But a real Back is wrong in one case, and
// it is a case that happens every day here: a push notification opens one
// nastup directly, and `history.back()` there walks the reader OUT of the app.
//
// So the control needs one fact: has this reader navigated inside Cecilija
// since the document loaded? If yes, the entry behind them is ours and Back is
// safe. If no, the only honest way back is a link to the list.
//
// A COUNTER, in `sessionStorage`, rather than anything the browser offers.
// `history.length` counts the tab's whole life, including the pages the reader
// visited before ours, so it answers a different question. `navigation.canGoBack`
// is Chromium-only and the readers who need this most are on iPhones. An
// installed app does start with a clean history, but half the roster runs
// Cecilija in a browser tab and those two must behave the same.
//
// The count can run AHEAD of the truth — a `router.replace` adds no history
// entry but does change the address, and the wiring cannot tell it from a push.
// That is deliberate and harmless: over-counting can only turn a Back on, and a
// replace happens on list screens, which carry no back control. Under-counting
// is the one that would hurt, and nothing here can produce it.
//
// Nothing here touches the DOM, history or a clock: the wiring in
// `app/NavMemory.tsx` feeds it numbers and stores what comes back.

/** The two methods this needs, so a test can hand it a Map. */
export interface NavStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** One slot, per tab, cleared when the tab is. */
export const NAV_DEPTH_KEY = 'cecilija:nav:depth'

/** What just happened to the history stack. */
export type NavStep = 'push' | 'pop'

/**
 * The depth after a step.
 *
 * Clamped at zero, because a `popstate` can fire for a step we never counted —
 * a hash change, a browser restoring a tab — and a negative depth would read as
 * "no way back" long after there plainly is one.
 */
export function nextDepth(current: number, step: NavStep): number {
  const base = Number.isFinite(current) && current > 0 ? Math.floor(current) : 0
  if (step === 'pop') return Math.max(0, base - 1)
  return base + 1
}

/** The depth on record, or zero when there is nothing trustworthy there. */
export function readDepth(store: NavStore | null): number {
  if (!store) return 0
  let raw: string | null = null
  try {
    raw = store.getItem(NAV_DEPTH_KEY)
  } catch {
    return 0
  }
  if (raw === null) return 0
  const depth = Number(raw)
  if (!Number.isFinite(depth) || depth < 0) return 0
  return Math.floor(depth)
}

/** Record a depth. A refusing storage costs a link, never a broken screen. */
export function writeDepth(store: NavStore | null, depth: number): void {
  if (!store) return
  if (!Number.isFinite(depth) || depth < 0) return
  try {
    store.setItem(NAV_DEPTH_KEY, String(Math.floor(depth)))
  } catch {
    // A full or refusing storage means every Back is a link again. That is the
    // old behaviour, which was wrong but never broken.
  }
}

/**
 * Is the history entry behind this one ours?
 *
 * The one question the back control asks. A reader who has moved inside the app
 * since the document loaded has one of our screens behind them; a reader who
 * arrived on this screen from a notification, a QR or a pasted address does not.
 */
export function canGoBack(depth: number): boolean {
  return Number.isFinite(depth) && depth > 0
}
