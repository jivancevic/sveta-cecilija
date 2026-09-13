// Where a list was when you left it (#562 review, finding 2).
//
// The browser restores scroll on Back for the DOCUMENT, and since the redesign
// the document does not scroll: `.app` (the body) is the scroll container and
// its position survives a client navigation untouched. So Narudžbe → an order →
// Back left the list sitting at the order's scroll offset, which on a long list
// is nowhere near where the reader was.
//
// Nothing here touches the DOM or a clock: the component feeds it
// `history.state`, a url and a number, and gets a key and a position back. The
// storage is an argument for the same reason — `sessionStorage` throws outright
// in a locked-down browser, and a reader whose browser refuses to remember a
// scroll offset should still get a working list.

/** The two methods this needs, so a test can hand it a Map. */
export interface ScrollStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const PREFIX = 'cecilija:scroll:'

/**
 * The slot one history entry writes to.
 *
 * Next's App Router puts a `key` on `history.state`, which is per ENTRY and so
 * tells two visits to the same list apart. When it is absent the path does the
 * job: two visits then share a slot, which is the behaviour a reader expects
 * anyway ("put me back where I was on Narudžbe"). The hash is dropped — an
 * anchor is a position of its own and not a scroll to restore.
 */
export function scrollKey(historyState: unknown, url: string): string {
  const key = (historyState as { key?: unknown } | null | undefined)?.key
  if (typeof key === 'string' && key.length > 0) return `${PREFIX}${key}`
  return `${PREFIX}${url.split('#')[0] ?? url}`
}

/** Record a position. Zero is worth recording: "the top" is an answer. */
export function rememberScroll(
  store: ScrollStore | null,
  key: string,
  top: number,
): void {
  if (!store) return
  if (!Number.isFinite(top) || top < 0) return
  try {
    store.setItem(key, String(Math.round(top)))
  } catch {
    // A full or refusing storage is not worth a broken screen.
  }
}

/** The position to go back to, or null when there is nothing trustworthy. */
export function recallScroll(store: ScrollStore | null, key: string): number | null {
  if (!store) return null
  let raw: string | null = null
  try {
    raw = store.getItem(key)
  } catch {
    return null
  }
  if (raw === null) return null
  const top = Number(raw)
  if (!Number.isFinite(top) || top < 0) return null
  return top
}
