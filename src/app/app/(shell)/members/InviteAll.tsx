'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Note, Section } from '../../ui'

// "Pošalji pozivnice svima" (#462), inside the invitations sheet since #573.
//
// It goes only to the dancers whose row carries an e-mail, and its answer says
// so per outcome. Hidden once nobody is missing a login, because then it has
// nothing to do; the count is the server's, so the button appears and
// disappears with the roster rather than with what this component believes.
//
// Lifted out of `MembersList` when the list became the screen: the bulk
// invitation is an act of the invitation half, and it was the last thing
// keeping that half in the middle of a list of names.

export function InviteAll({ missing }: { missing: number }) {
  const router = useRouter()
  const [state, setState] = useState<{ busy: boolean; message: string | null }>({
    busy: false,
    message: null,
  })

  if (missing <= 0) return null

  async function sendAll() {
    if (state.busy) return
    setState({ busy: true, message: null })
    try {
      const res = await fetch('/api/app/invite/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null
      setState({
        busy: false,
        message: body?.message ?? body?.error ?? APP_STRINGS.inviteAll.unexpected,
      })
      // A login was minted for every dancer who had none, so the roster's
      // "missing" count and this very button are now stale (#593). The tabs are
      // prefetched, so nothing re-reads the server unless it is asked to.
      if (res.ok) router.refresh()
    } catch {
      setState({ busy: false, message: APP_STRINGS.inviteAll.unexpected })
    }
  }

  return (
    <>
      <Section title={APP_STRINGS.inviteAll.action} />
      <Note>{APP_STRINGS.inviteLink.channelHint}</Note>
      <Button variant="ghost" disabled={state.busy} onClick={() => void sendAll()}>
        {state.busy ? APP_STRINGS.inviteAll.sending : APP_STRINGS.inviteAll.action}
      </Button>
      {state.message && <p className="app__invite-hint">{state.message}</p>}
    </>
  )
}
