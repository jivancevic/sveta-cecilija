'use client'

import { useEffect } from 'react'
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

export interface SheetProps {
  open: boolean
  title?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}

export function Sheet({ open, title, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

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
        {children}
      </div>
    </>
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
