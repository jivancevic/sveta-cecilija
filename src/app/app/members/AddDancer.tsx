'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { RolePicker } from './RolePicker'

// "Dodaj plesača" (#511): the moreškant who is not in the table at all.
//
// Until now that meant opening the Backoffice on a laptop, and in practice it
// meant it did not happen at the rehearsal where the person was standing. So it
// sits next to the join code, which is the other thing done standing in a room.
//
// Four fields and no more: a name, a nickname and the roles are what make a
// dancer a dancer (ADR-0024), and a mobile is what makes an invitation
// sendable. Everything else about the row — the note, the attribution half — is
// the Backoffice's and is not offered here.
//
// Behind a disclosure, closed: the screen is a list first, and adding somebody
// is a once-a-season act that should not be the first thing under the thumb.

const S = APP_STRINGS.members

export function AddDancer() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [mobile, setMobile] = useState('')
  const [picked, setPicked] = useState<{ roles: string[]; primaryRole: string }>({
    roles: [],
    primaryRole: '',
  })

  function reset() {
    setName('')
    setNickname('')
    setMobile('')
    setPicked({ roles: [], primaryRole: '' })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/app/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          nickname,
          // An empty field is an absent one rather than a cleared one: this row
          // does not exist yet, so there is nothing to clear.
          ...(mobile.trim() === '' ? {} : { mobile }),
          roles: picked.roles,
          primaryRole: picked.primaryRole,
        }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(body?.error ?? S.saveFailed)
        setBusy(false)
        return
      }
      setDone(S.added(nickname.trim() || name.trim()))
      reset()
      setOpen(false)
      // The list is a server fact: re-read it rather than splicing a row in.
      router.refresh()
    } catch {
      setError(S.saveFailed)
    }
    setBusy(false)
  }

  return (
    <section className="app__more-block">
      {done && <p className="app__members-done">{done}</p>}

      {!open ? (
        <button
          type="button"
          className="app__button app__button--quiet"
          onClick={() => {
            setOpen(true)
            setDone(null)
          }}
        >
          {S.addOpen}
        </button>
      ) : (
        <form className="app__member-form" onSubmit={submit}>
          <h2 className="app__month-head">
            <span>{S.addTitle}</span>
          </h2>
          <p className="app__comp-intro">{S.addIntro}</p>

          {error && <p className="app__answer-error">{error}</p>}

          <label className="app__field">
            <span>{S.name}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              autoComplete="off"
              required
            />
          </label>

          <label className="app__field">
            <span>{S.nickname}</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={busy}
              autoComplete="off"
              required
            />
          </label>

          <label className="app__field">
            <span>{S.mobile}</span>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              disabled={busy}
              autoComplete="off"
              inputMode="tel"
            />
          </label>

          <RolePicker
            roles={picked.roles}
            primaryRole={picked.primaryRole}
            onChange={setPicked}
            disabled={busy}
          />

          <div className="app__invite-actions">
            <button type="submit" className="app__button" disabled={busy}>
              {busy ? S.adding : S.addSubmit}
            </button>
            <button
              type="button"
              className="app__button app__button--quiet"
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
              disabled={busy}
            >
              {S.addCancel}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
