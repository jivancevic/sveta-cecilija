'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button } from './Button'
import { Sheet } from './Sheet'

// The rest of an explanation, one tap away (#571, decision Q46).
//
// Financije is a screen of figures that each need a caveat: this money is not
// profit, that money is not collected yet, a promo code is not an extra amount.
// Printed in full under every card, the caveats were longer than the figures
// and the screen read as a disclaimer with numbers in it.
//
// So a card keeps the ONE sentence that says what the figure is, and this is
// where the rest lives: a small "i" beside the heading, and a sheet under it
// with the whole explanation. Nothing is lost and nothing is buried in a
// tooltip a thumb cannot open.
//
// **One component for every card**, rather than a popover per figure: the
// caveats are read rarely and one at a time, so the sheet Cecilija already has
// is the right surface and there is no second way to say the same thing.

export interface ExplainProps {
  /** The sheet's heading. Usually the card's own title. */
  title: React.ReactNode
  /** The rest of the explanation. */
  children: React.ReactNode
  className?: string
}

export function Explain({ title, children, className }: ExplainProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={['ui-explain', className ?? ''].filter(Boolean).join(' ')}
        aria-label={APP_STRINGS.ui.explain}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Info size={15} strokeWidth={2.25} aria-hidden="true" />
      </button>

      <Sheet
        open={open}
        title={title}
        onClose={() => setOpen(false)}
        footer={
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {APP_STRINGS.ui.sheetClose}
          </Button>
        }
      >
        <p className="ui-explain__body">{children}</p>
      </Sheet>
    </>
  )
}
