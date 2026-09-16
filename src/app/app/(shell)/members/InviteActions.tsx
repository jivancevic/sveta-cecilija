'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Note } from '../../ui'
import { normalizeMobile, smsHref, whatsappHref } from '@/lib/app/invite-link'
import { usePlatform } from '../../use-install'

// The invitation, on the dancer's own profile (#463, onto Članovi by #511, and
// off the list row onto the profile by #573).
//
// The list is a list of names now, so the invitation lost the per-row
// disclosure it lived behind and became the profile's quick actions: it is the
// thing a voditelj does while looking at one dancer, and it reads better with
// that dancer's name at the top of the screen than folded under a row.
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
// rather than only on a dancer who has an address, because an address must not
// reach an `/app` payload (ADR-0024's boundary, narrowed by ADR-0028 to the
// reader's OWN on Profil): the row does not know whether there is one, and the
// route answers with the sentence that sends the voditelj to "Kopiraj
// pozivnicu" when there is not. Since #651 the address it looks for is the
// dancer's own login's, so this button reaches only a dancer who has set one.

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
  const router = useRouter()
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
        // Minting opens a login where there was none, which changes the roster
        // and the bulk-invitation count on the cached Članovi tab (#593).
        router.refresh()
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
      if (res.ok) router.refresh()
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

  return (
    <section className="app__member-invite">
      <Note>{APP_STRINGS.inviteLink.channelHint}</Note>

      <div className="app__invite-actions">
        <Button variant="ghost" onClick={() => void mint()} disabled={busy !== null}>
          {busy === 'link' ? APP_STRINGS.inviteLink.working : APP_STRINGS.inviteLink.action}
        </Button>
        <Button variant="ghost" onClick={() => void sendMail()} disabled={busy !== null}>
          {busy === 'mail' ? APP_STRINGS.invite.sending : APP_STRINGS.invite.action}
        </Button>
      </div>

      {notice && <p className="app__invite-hint">{notice}</p>}

      {minted && (
        <>
          {/* The whole message, visible: the voditelj is about to send it. */}
          <p className="app__invite-message">{minted.message}</p>
          <div className="app__invite-actions">
            <a className="ui-btn ui-btn--primary" href={smsHref(dial, minted.message, phone)}>
              {APP_STRINGS.inviteLink.sms}
            </a>
            <a
              className="ui-btn ui-btn--ghost"
              href={whatsappHref(dial, minted.message)}
              target="_blank"
              rel="noreferrer"
            >
              {APP_STRINGS.inviteLink.whatsapp}
            </a>
            <Button variant="ghost" onClick={() => void copy()}>
              {copied ? APP_STRINGS.inviteLink.copiedShort : APP_STRINGS.inviteLink.copy}
            </Button>
          </div>
          {!dial && <p className="app__invite-hint">{`${nickname}: ${APP_STRINGS.inviteLink.noMobile}`}</p>}
        </>
      )}
    </section>
  )
}
