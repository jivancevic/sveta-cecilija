'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import type { Handover } from '@/lib/app/users-account'

// The two pieces every action on Korisnici shares (#510).
//
// `Sheet` is the confirmation Narudžbe and Izvedbe already use: in the flow
// under the buttons, never a modal, because on a phone a dialog is a wall of
// system chrome over the decision it is about.
//
// `HandoverPanel` is this screen's own, and it is the reason the sheet exists
// at all. A temporary password and a sign-in link are both LIVE CREDENTIALS
// that are shown exactly once, so the panel states that in a sentence, offers
// one tap to copy, and has a Gotovo that closes it rather than a timeout that
// takes it away while somebody is still reading.

const S = APP_STRINGS.users

export function Sheet({
  title,
  body,
  error,
  busy,
  confirm,
  confirmLabel,
  close,
  children,
}: {
  title: string
  body: string
  error: string | null
  busy: boolean
  /** Null is a sheet that explains why there is nothing to confirm. */
  confirm: (() => void) | null
  confirmLabel?: string
  close: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="app__sheet" role="group" aria-label={title}>
      <p className="app__sheet-title">{title}</p>
      <p className="app__sheet-body">{body}</p>
      {children}
      {error && <p className="app__error">{error}</p>}
      <div className="app__sheet-buttons">
        {confirm && (
          <button type="button" className="app__button" disabled={busy} onClick={confirm}>
            {busy ? S.actions.working : (confirmLabel ?? S.actions.confirm)}
          </button>
        )}
        <button type="button" className="app__button app__button--link" disabled={busy} onClick={close}>
          {S.actions.cancel}
        </button>
      </div>
    </div>
  )
}

/** One tap to copy, with the value still readable for a person typing it out. */
function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // No clipboard permission (an insecure origin, an old browser): the value
      // is on the screen and selectable, which is the fallback that always
      // works. Nothing is said, because nothing went wrong for the reader.
      setCopied(false)
    }
  }

  return (
    <div className="app__handover-row">
      <code className="app__handover-value">{value}</code>
      <button type="button" className="app__button app__button--small" onClick={() => void copy()}>
        {copied ? S.actions.copied : S.actions.copy}
      </button>
    </div>
  )
}

/**
 * What the reader has to take away before closing the sheet.
 *
 * `none` is not a failure of the account — the row exists — so it names the
 * repair (press Resetiraj lozinku) instead of an error.
 */
export function HandoverPanel({
  handover,
  close,
}: {
  handover: Handover
  close: () => void
}) {
  if (handover.kind === 'none') {
    // Only a create reaches this: a reset that cannot mint a token answers 500,
    // because nothing has happened yet and 500 is the honest ending. Here the
    // ACCOUNT exists, so the panel says so and names the repair rather than
    // reading as "that failed", which would have the reader press Novi korisnik
    // again into their own username.
    return (
      <div className="app__handover">
        <p className="app__handover-title">{S.handover.noneTitle}</p>
        <p className="app__handover-body">{S.handover.noneBody}</p>
        <button type="button" className="app__button app__button--link" onClick={close}>
          {S.handover.done}
        </button>
      </div>
    )
  }

  const password = handover.kind === 'password'

  return (
    <div className="app__handover">
      <p className="app__handover-title">
        {password ? S.handover.passwordTitle : S.handover.linkTitle}
      </p>
      <p className="app__handover-body">
        {password ? S.handover.passwordBody : S.handover.linkBody}
      </p>
      <CopyRow value={password ? handover.password : handover.link} />
      <button type="button" className="app__button app__button--link" onClick={close}>
        {S.handover.done}
      </button>
    </div>
  )
}
