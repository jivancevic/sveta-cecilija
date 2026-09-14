'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { APP_STRINGS } from '@/lib/app/strings'

// A sheet: a choice, from the bottom, one thumb away (#562).
//
// Cecilija's questions are short and closed ("which title does this dancer
// have tonight?"), and a sheet answers them without leaving the screen the
// question was asked on. A screen that needs a form needs a screen.
//
// It is NOT draggable and does not pretend to be: the handle is there because
// a sheet without one does not read as a sheet, and the scrim is the way out.
// Escape closes it too, because the laptop reaches this component as well.
//
// A client component, and one of only two in this folder: it owns the key
// listener and the scrim's click. The options inside it are the caller's.
//
// **It renders into the BODY and not where it is written** (#624). The panel is
// `z-index: 31` and the tab bar is 20, which should have settled it; what it
// did not settle is that `.app__screen` animates a transform with
// `animation-fill-mode: both`, so the wrapper keeps a stacking context of its
// own for as long as the screen is on the page — and a z-index inside a
// stacking context cannot reach past it. Every sheet in the app was therefore
// trapped under the bar, which is what Josip photographed twice. A portal takes
// the sheet out of that wrapper and makes it a child of the body; the body IS
// `.app`, so the panel keeps every token it is drawn out of (`--card`, `--ink`,
// `--tabH`, `--shim`) and inherits nothing it should not. The CSS fill-mode is
// fixed as well, but the portal is what makes this correct rather than lucky:
// a modal belongs at the top of the document, not in the middle of a screen.
//
// `data-no-pull` survives the move, because pull-to-refresh reads `closest()`
// on the touched node and the attribute travels with the markup.

export interface SheetProps {
  open: boolean
  title?: React.ReactNode
  onClose: () => void
  /**
   * The sheet's answer, kept out of the scroll (#563).
   *
   * A sheet is short by design, but "short" is a phone in landscape away from
   * taller than the screen: the first one with five options and a paragraph
   * over it was 637 px on a 599 px viewport, with its title cut off the top and
   * nothing to scroll. The handle, the title and this row stay put; everything
   * between them scrolls. A sheet with no footer keeps its buttons in the
   * scrolling half, which is right for one that has none to keep.
   */
  footer?: React.ReactNode
  children: React.ReactNode
}

/**
 * The panel itself: the scrim, the handle, the title, the scroller, the footer.
 *
 * Split from `Sheet` in #624 because the two answer different questions. This
 * is WHAT a sheet looks like and it draws wherever it is put; `Sheet` is
 * whether it is open, how it closes, and WHERE in the document it goes. The
 * split is also what keeps the shape testable as markup: a portal renders into
 * a live DOM and never into a string, so a test of `Sheet` could only ever see
 * an empty one. Not in the `ui` barrel — every screen wants the sheet, not half
 * of one.
 */
export function SheetPanel({
  title,
  onClose,
  footer,
  children,
}: Omit<SheetProps, 'open'>) {
  return (
    <>
      {/* `data-no-pull` on both halves: a sheet covers the screen, and a
          wrapper transformed under it would drag the sheet with it (#562). The
          panel's `role="dialog"` would be caught anyway; the scrim has no role
          to catch. */}
      <button
        type="button"
        className="ui-sheet__scrim"
        aria-label={APP_STRINGS.ui.sheetClose}
        onClick={onClose}
        data-no-pull
      />
      <div className="ui-sheet" role="dialog" aria-modal="true" data-no-pull>
        <div className="ui-sheet__grab" aria-hidden="true" />
        {title != null && <h2>{title}</h2>}
        {/* `data-no-pull` again on the half that scrolls: the panel's own
            already shields it (the gesture reads `closest()`), and saying it
            here is what a reader moving this markup will see. */}
        <div className="ui-sheet__body" data-no-pull>
          {children}
        </div>
        {footer != null && <div className="ui-sheet__foot">{footer}</div>}
      </div>
    </>
  )
}

const subscribeToNothing = () => () => {}
const onClient = () => true
const onServer = () => false

export function Sheet({ open, title, onClose, footer, children }: SheetProps) {
  // The portal needs a DOM to aim at, and the server has none. Every sheet in
  // this app opens from a tap, so "not mounted yet" is never a state a reader
  // sees; this only keeps the first server render honest and hydration silent.
  //
  // `useSyncExternalStore` rather than a `useState` + `useEffect` pair: the
  // store has nothing to subscribe to and the two snapshots ARE the answer —
  // false on the server, true in the browser — so React reaches it during the
  // first client render instead of scheduling a second one.
  const mounted = useSyncExternalStore(subscribeToNothing, onClient, onServer)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !mounted) return null

  return createPortal(
    <SheetPanel title={title} onClose={onClose} footer={footer}>
      {children}
    </SheetPanel>,
    document.body,
  )
}

/** One row of a sheet: a mark, a name, and the state it is in now. */
export function SheetOption({
  on = false,
  lead,
  note,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  on?: boolean
  lead?: React.ReactNode
  note?: React.ReactNode
}) {
  const classes = ['ui-sheet__opt', on ? 'ui-sheet__opt--on' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={classes} aria-pressed={on} {...rest}>
      {lead}
      <div>
        {children}
        {note != null && <span>{note}</span>}
      </div>
    </button>
  )
}
