// How much of the screen the on-screen keyboard is standing on (#667).
//
// Josip, from his iPhone: "kad se upise par znakova prozor ispadne ispod
// tipkovnice." Everything anchored to the bottom of Cecilija — the sheets, the
// scrim, the toast — sits at `bottom: 0` of the LAYOUT viewport, and neither
// iOS nor Chrome shrinks that when the keyboard opens. They shrink the VISUAL
// viewport, which is the part of the page you can actually see, and nothing in
// the app was listening to it. So the sheet was exactly where it had always
// been: underneath the keyboard.
//
// The number is the gap between the two viewports:
//
//   innerHeight           the layout viewport, unchanged by the keyboard
//   visualViewport.height what is left visible above it
//   offsetTop             how far the visual viewport has been pushed down,
//                         which is what happens when a focused field is
//                         scrolled into view rather than the page being resized
//
// A THRESHOLD, and it is the whole reason this is a function rather than a
// subtraction. In a browser tab the address bar collapses and expands as the
// reader scrolls, and that also parts the two viewports — by forty or fifty
// pixels. Treating that as a keyboard would slide the tab bar out from under a
// thumb every time somebody scrolled a list. No keyboard on a phone is under
// 150px tall, so 80 is comfortably between the two and close to neither.

/** Below this, the gap is a browser chrome, not a keyboard. */
export const KEYBOARD_MIN_PX = 80

/** The three numbers the browser gives, so the rule can be read in a table. */
export interface ViewportGeometry {
  /** The layout viewport's height: `window.innerHeight`. */
  innerHeight: number
  /** The visual viewport's height. */
  viewportHeight: number
  /** How far the visual viewport has been pushed down. */
  offsetTop: number
}

/**
 * The height to keep clear at the bottom, in CSS pixels. Zero when there is no
 * keyboard, which is the answer every screen spends most of its life on.
 */
export function keyboardInset(geometry: ViewportGeometry | null | undefined): number {
  if (!geometry) return 0
  const { innerHeight, viewportHeight, offsetTop } = geometry
  if (![innerHeight, viewportHeight, offsetTop].every((n) => Number.isFinite(n))) return 0
  const inset = innerHeight - viewportHeight - offsetTop
  // A negative gap is a browser reporting a visual viewport TALLER than its
  // layout one, which happens mid-pinch. Nothing should move for that.
  if (!(inset >= KEYBOARD_MIN_PX)) return 0
  // Never more than the screen: a nonsense number here would push a sheet off
  // the top of the page, and a reader who cannot see the sheet cannot close it.
  if (inset > innerHeight) return 0
  return Math.round(inset)
}

/** Whether the bottom bar should get out of the way. */
export function keyboardIsOpen(inset: number): boolean {
  return Number.isFinite(inset) && inset > 0
}
