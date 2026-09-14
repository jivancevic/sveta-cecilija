'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import type { MemberOption } from '@/lib/app/comp-screen'
import type { SellOption } from '@/lib/app/partner-screen'
import { Button, Sheet } from '../../ui'
import { CompIssueForm } from './CompIssueForm'

// "Podijeli gratis", now behind one button (#570, Q44).
//
// The form is eight controls long — an evening, a member search with an inline
// Dodaj člana, two steppers, the printed holder and an address — and it used to
// sit open at the top of the screen, above the two things anybody reads more
// often: who has had how many this season, and what was handed out last. A
// screen opens on its records and asks for the form.
//
// So this owns exactly one thing: whether the sheet is open. The form inside it
// is unchanged and still posts to `/api/comp/issue`, and the sheet stays open
// after a comp is issued on purpose — the answer (how many seats, which code,
// whether the e-mail actually left, the PDF to print) is in there, and closing
// it would throw that away. `router.refresh()` has already updated the table
// underneath by the time the reader closes it.

const S = APP_STRINGS.gratis

export function CompIssueSheet({
  shows,
  members,
}: {
  shows: SellOption[]
  members: MemberOption[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="ui-btns app__comp-open">
        <Button variant="primary" onClick={() => setOpen(true)}>
          {S.issueTitle}
        </Button>
      </div>

      <Sheet
        open={open}
        title={S.issueTitle}
        onClose={() => setOpen(false)}
        footer={
          <Button variant="ghost" className="ui-btn--wide" onClick={() => setOpen(false)}>
            {S.close}
          </Button>
        }
      >
        <CompIssueForm shows={shows} members={members} />
      </Sheet>
    </>
  )
}
