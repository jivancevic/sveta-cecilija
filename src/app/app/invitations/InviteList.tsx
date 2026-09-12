'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import {
  normalizeMobile,
  smsHref,
  whatsappHref,
  type InviteCandidate,
} from '@/lib/app/invite-link'
import { usePlatform } from '../use-install'

// "Kopiraj pozivnicu", on the voditelj's own phone (#463).
//
// One tap mints the invitation (`POST /api/app/invite/link`, which opens the
// login if there is none) and the row opens into the three ways to hand it
// over: SMS first and recommended, WhatsApp because a voditelj with no SMS plan
// will otherwise paste it somewhere worse, and Kopiraj for everything else.
//
// The minted message stays on the row rather than being copied straight to the
// clipboard, because a clipboard write here is invisible: the voditelj is about
// to leave for Messages and needs to see WHAT they are sending before they do.
//
// Nothing is optimistic and nothing is cached: each tap mints a FRESH seven-day
// link, which is what makes a second press the answer to "the message got lost"
// (#419, story 7).

interface Minted {
  link: string
  message: string
  mobile: string | null
}

export function InviteList({ candidates }: { candidates: InviteCandidate[] }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [minted, setMinted] = useState<Record<string, Minted>>({})
  const [error, setError] = useState<string | null>(null)

  async function mint(candidate: InviteCandidate) {
    if (busyId) return
    setError(null)
    setBusyId(candidate.id)
    try {
      const res = await fetch('/api/app/invite/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: candidate.id }),
      })
      const body = (await res.json().catch(() => null)) as
        | { error?: string; link?: string; message?: string; mobile?: string | null }
        | null
      if (!res.ok || !body?.link || !body?.message) {
        setError(body?.error ?? APP_STRINGS.inviteLink.failed)
        setBusyId(null)
        return
      }
      setMinted((current) => ({
        ...current,
        [candidate.id]: {
          link: body.link!,
          message: body.message!,
          mobile: body.mobile ?? candidate.mobile,
        },
      }))
    } catch {
      setError(APP_STRINGS.inviteLink.failed)
    }
    setBusyId(null)
  }

  const waiting = candidates.filter((c) => !c.hasLogin)
  const joined = candidates.filter((c) => c.hasLogin)

  return (
    <>
      {error && <p className="app__answer-error">{error}</p>}

      {waiting.length === 0 ? (
        <div className="app__empty-state">{APP_STRINGS.inviteLink.empty}</div>
      ) : (
        <div className="app__pick">
          {waiting.map((c) => (
            <InviteRow
              key={c.id}
              candidate={c}
              minted={minted[c.id]}
              busy={busyId === c.id}
              disabled={busyId !== null}
              onMint={() => mint(c)}
            />
          ))}
        </div>
      )}

      {/* Already in, and still here: re-issuing is the whole answer to a lost
          phone, and "Kopiraj pozivnicu" is idempotent. Behind a disclosure, so
          the list a voditelj is working through is only the ones still to do. */}
      {joined.length > 0 && (
        <details className="app__past">
          <summary>{APP_STRINGS.inviteLink.joined(joined.length)}</summary>
          <div className="app__pick">
            {joined.map((c) => (
              <InviteRow
                key={c.id}
                candidate={c}
                minted={minted[c.id]}
                busy={busyId === c.id}
                disabled={busyId !== null}
                onMint={() => mint(c)}
              />
            ))}
          </div>
        </details>
      )}
    </>
  )
}

function InviteRow({
  candidate,
  minted,
  busy,
  disabled,
  onMint,
}: {
  candidate: InviteCandidate
  minted?: Minted
  busy: boolean
  disabled: boolean
  onMint: () => void
}) {
  const [copied, setCopied] = useState(false)
  // `usePlatform()` rather than `readPlatform()`: a client component is
  // server-rendered too, and `navigator` does not exist there. It answers null
  // until the browser does, which only decides the `sms:` separator below.
  const platform = usePlatform()

  if (!minted) {
    return (
      <button
        type="button"
        className="app__more-row app__pick-row"
        disabled={disabled}
        onClick={onMint}
      >
        <span className="app__pick-name">
          <strong>{candidate.nickname || candidate.name}</strong>
          <small>
            {[candidate.nickname ? candidate.name : null, candidate.mobile || APP_STRINGS.inviteLink.noMobile]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </span>
        <span aria-hidden="true">{busy ? APP_STRINGS.inviteLink.working : '›'}</span>
      </button>
    )
  }

  // iOS and Android disagree about the `sms:` separator and each ignores the
  // other's silently (#455 owns the detector).
  const phone = platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'other'
  const mobile = normalizeMobile(minted.mobile)

  async function copy() {
    try {
      await navigator.clipboard.writeText(minted!.message)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="app__invite-row">
      <p className="app__invite-who">
        <strong>{candidate.nickname || candidate.name}</strong>
      </p>
      {/* The whole message, visible: the voditelj is about to send it. */}
      <p className="app__invite-message">{minted.message}</p>
      <div className="app__invite-actions">
        <a className="app__button" href={smsHref(mobile, minted.message, phone)}>
          {APP_STRINGS.inviteLink.sms}
        </a>
        <a
          className="app__button app__button--quiet"
          href={whatsappHref(mobile, minted.message)}
          target="_blank"
          rel="noreferrer"
        >
          {APP_STRINGS.inviteLink.whatsapp}
        </a>
        <button type="button" className="app__button app__button--quiet" onClick={copy}>
          {copied ? APP_STRINGS.inviteLink.copiedShort : APP_STRINGS.inviteLink.copy}
        </button>
      </div>
    </div>
  )
}
