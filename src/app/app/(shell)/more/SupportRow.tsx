'use client'

import { useState } from 'react'
import { ChevronRight, LifeBuoy } from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'
import { supportMailto, type SupportMailInput } from '@/lib/app/support-mail'
import { Sheet } from '../../ui'

// "Podrška" (#569, Q20): a row that opens a sheet with one sentence and one
// address.
//
// A sheet rather than a screen, because there is nothing to do here beyond
// reading two lines and, if it comes to that, tapping the address. A screen for
// that would be a navigation a person has to come back from.
//
// **E-mail, and never a telephone number** (CLAUDE.md, #383, #548). The only
// number the society has on any register is the president's private mobile, and
// the rule that keeps it off a buyer's screen is about the number rather than
// about the audience. `info@moreska.eu` is answered within 24 hours, by a
// person, from Gmail; nobody is on duty and there is no helpline, so the sheet
// says exactly that and promises nothing faster.
//
// **The mail arrives knowing which build and which account** (#637). It used to
// be a bare `mailto:` with no subject and no body, so every "ne radi mi" cost a
// round trip asking the two questions that are always asked first. The body is
// assembled in `support-mail.ts`, where the reasoning and the tests live; this
// component only hands it the two facts the server page already knows.

const S = APP_STRINGS.support

export function SupportRow({ commit, username }: SupportMailInput) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="ui-row" onClick={() => setOpen(true)}>
        <span className="app__row-icon" aria-hidden="true">
          <LifeBuoy size={22} strokeWidth={1.75} />
        </span>
        <span className="ui-row__body">
          <b>{S.title}</b>
        </span>
        <span className="app__row-chev" aria-hidden="true">
          <ChevronRight size={20} strokeWidth={1.75} />
        </span>
      </button>

      <Sheet open={open} title={S.title} onClose={() => setOpen(false)}>
        <p className="app__sheet-body">{S.body}</p>
        {/* A real anchor: a mailto is a navigation the phone completes, not a
            decision this app makes. */}
        <a className="ui-btn ui-btn--primary" href={supportMailto({ commit, username })}>
          {S.email}
        </a>
      </Sheet>
    </>
  )
}
