'use client'

import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Sheet } from '../../ui'
import { JoinCodeCard } from './JoinCodeCard'
import { PendingClaims, type PendingClaimRow } from './PendingClaims'

// The invitation half of Članovi, behind one icon (#573, Q37).
//
// Two things used to sit above the roster: the rehearsal code with its QR and
// the queue of people waiting to be let in. They are what a voditelj needs
// while standing in a hall at the start of a season, and the list is what they
// need for the rest of it, so the list is the screen and these are one tap away
// in the header. (A third, the bulk e-mail invitation, was retired with
// `Members.email` in #651: an invitation is handed over one dancer at a time,
// by SMS, from the profile.)
//
// One component rather than three, because the icon and the sheet share one
// piece of state and the icon lives in `AppShell`'s `actions` slot: the sheet
// is fixed to the viewport, so rendering it beside the button in the header
// costs nothing and keeps the state in one place.
//
// The badge on the icon is the queue: somebody is standing there waiting to be
// approved, and that is the only thing on this screen that is time-critical.

const S = APP_STRINGS.members

export function Invitations({
  code,
  validUntil,
  url,
  qr,
  claims,
}: {
  code: string | null
  validUntil: string | null
  url: string | null
  qr: string | null
  claims: PendingClaimRow[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="app__header-icon"
        onClick={() => setOpen(true)}
        aria-label={S.invitations}
        title={S.invitations}
      >
        <UserPlus size={22} aria-hidden="true" />
        {claims.length > 0 && <span className="app__header-icon-badge">{claims.length}</span>}
      </button>

      <Sheet
        open={open}
        title={S.invitations}
        onClose={() => setOpen(false)}
        footer={
          <Button variant="link" onClick={() => setOpen(false)}>
            {S.invitationsClose}
          </Button>
        }
      >
        <p className="app__sheet-body">{S.invitationsBody}</p>
        <JoinCodeCard code={code} validUntil={validUntil} url={url} qr={qr} />
        <PendingClaims claims={claims} />
      </Sheet>
    </>
  )
}
