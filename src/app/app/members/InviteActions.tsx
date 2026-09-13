'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { normalizeMobile, smsHref, whatsappHref } from '@/lib/app/invite-link'
import { usePlatform } from '../use-install'

// The invitation, on the dancer's own row (#463, moved onto Članovi by #511).
//
// One tap on "Kopiraj pozivnicu" mints a FRESH seven-day link
// (`POST /api/app/invite/link`, which opens the login if there is none) and the
// row opens into the three ways to hand it over: SMS first and recommended,
// WhatsApp because a voditelj with no SMS plan will otherwise paste it
// somewhere worse, and Kopiraj for everything else.
//
// The minted message stays on the row rather than going straight to the
// clipboard, because a clipboard write here is invisible: the voditelj is about
// to leave for Messages and needs to see WHAT they are sending before they do.
//
// Nothing is optimistic and nothing is cached: each tap mints a new link, which
// is what makes a second press the answer to "the message got lost" (#419,
// story 7).
//
// "Pošalji e-mailom" is the older channel (#424) and is offered unconditionally
// rather than only on a dancer who has an address, because an e-mail must never
// reach an `/app` payload (ADR-0024's PII boundary): the row does not know
// whether there is one, and the route answers "Član nema e-mail adresu" when
// there is not. One fewer field crossing the boundary for one extra tap.

interface Minted {
  link: string
  message: string
  mobile: string | null
}

export function InviteActions({
  id,
  nickname,
  mobile,
}: {
  id: string
  nickname: string
  mobile: string | null
}) {
  const [busy, setBusy] = useState<'link' | 'mail' | null>(null)
  const [minted, setMinted] = useState<Minted | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // `usePlatform()` rather than `readPlatform()`: a client component is
  // server-rendered too, and `navigator` does not exist there. It answers null
  // until the browser does, which only decides the `sms:` separator below.
  const platform = usePlatform()

  async function mint() {
    if (busy) return
    setNotice(null)
    setBusy('link')
    try {
      const res = await fetch('/api/app/invite/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: id }),
      })
      const body = (await res.json().catch(() => null)) as
        | { error?: string; link?: string; message?: string; mobile?: string | null }
        | null
      if (!res.ok || !body?.link || !body?.message) {
        setNotice(body?.error ?? APP_STRINGS.inviteLink.failed)
      } else {
        setMinted({ link: body.link, message: body.message, mobile: body.mobile ?? mobile })
        setCopied(false)
      }
    } catch {
      setNotice(APP_STRINGS.inviteLink.failed)
    }
    setBusy(null)
  }

  async function sendMail() {
    if (busy) return
    setNotice(null)
    setBusy('mail')
    try {
      const res = await fetch('/api/app/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: id }),
      })
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null
      setNotice(body?.message ?? body?.error ?? APP_STRINGS.invite.unexpected)
    } catch {
      setNotice(APP_STRINGS.invite.unexpected)
    }
    setBusy(null)
  }

  async function copy() {
    if (!minted) return
    try {
      await navigator.clipboard.writeText(minted.message)
      setCopied(true)
    } catch {
      setNotice(APP_STRINGS.inviteLink.copyFailed)
    }
  }

  // iOS and Android disagree about the `sms:` separator and each ignores the
  // other's silently (#455 owns the detector).
  const phone = platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'other'
  const dial = normalizeMobile(minted?.mobile ?? mobile)

  // Behind a disclosure, one per row: the list a voditelj scrolls is one line
  // per dancer, and the invitation is one tap under the name it belongs to.
  return (
    <details className="app__member-invite">
      <summary>{APP_STRINGS.members.invite}</summary>
      <div className="app__invite-actions">
        <button
          type="button"
          className="app__button app__button--quiet"
          onClick={mint}
          disabled={busy !== null}
        >
          {busy === 'link' ? APP_STRINGS.inviteLink.working : APP_STRINGS.inviteLink.action}
        </button>
        <button
          type="button"
          className="app__button app__button--quiet"
          onClick={sendMail}
          disabled={busy !== null}
        >
          {busy === 'mail' ? APP_STRINGS.invite.sending : APP_STRINGS.invite.action}
        </button>
      </div>

      {notice && <p className="app__invite-hint">{notice}</p>}

      {minted && (
        <>
          {/* The whole message, visible: the voditelj is about to send it. */}
          <p className="app__invite-message">{minted.message}</p>
          <div className="app__invite-actions">
            <a className="app__button" href={smsHref(dial, minted.message, phone)}>
              {APP_STRINGS.inviteLink.sms}
            </a>
            <a
              className="app__button app__button--quiet"
              href={whatsappHref(dial, minted.message)}
              target="_blank"
              rel="noreferrer"
            >
              {APP_STRINGS.inviteLink.whatsapp}
            </a>
            <button type="button" className="app__button app__button--quiet" onClick={copy}>
              {copied ? APP_STRINGS.inviteLink.copiedShort : APP_STRINGS.inviteLink.copy}
            </button>
          </div>
          {!dial && <p className="app__invite-hint">{`${nickname}: ${APP_STRINGS.inviteLink.noMobile}`}</p>}
        </>
      )}
    </details>
  )
}
