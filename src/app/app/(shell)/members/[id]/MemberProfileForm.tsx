'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MemberRosterRow } from '@/lib/app/members-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Note, Section, Switch, Toast } from '../../../ui'
import { RolePicker } from '../RolePicker'

// The profile form of Članovi (#511): the six fields a voditelj owns.
//
// It sends a PATCH of the whole set rather than of what changed, which is
// deliberate: the route reads only the keys that are present, so sending all
// six means "this is the profile now" and there is no diffing to get wrong.
// The two nullable fields go as `''` when cleared, which the route reads as
// null, because an absent key would mean "leave it alone".
//
// `name` is a fact and not a field: it reaches comp reporting and the
// promo-code picker, so it belongs to the blagajna (`canEditAttributionField`),
// and the route refuses it. Showing it disabled rather than hidden is the
// honest version — the voditelj needs to see WHO this is, and a disabled input
// would invite a tap that goes nowhere.
//
// One Spremi at the foot and no per-field save (#573): the six fields are one
// answer to "who is this dancer now", and a form with two ways to commit is a
// form where half the changes are lost. The two flags are T1's `Switch`, which
// is the same control the account screen uses for the push toggle.
//
// Every refusal is whatever the server said, verbatim: the rules are
// `validateAndNormaliseMoreskant`, shared with the collection hook, so the
// sentence a voditelj reads here is the same one the Backoffice would show.

const S = APP_STRINGS.members

export function MemberProfileForm({ member }: { member: MemberRosterRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [nickname, setNickname] = useState(member.nickname ?? '')
  const [mobile, setMobile] = useState(member.mobile ?? '')
  const [email, setEmail] = useState(member.email ?? '')
  const [active, setActive] = useState(member.active)
  const [yearRound, setYearRound] = useState(member.yearRound)
  const [picked, setPicked] = useState<{ roles: string[]; primaryRole: string }>({
    roles: member.roles,
    primaryRole: member.primaryRole ?? '',
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/app/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname,
          mobile,
          email,
          roles: picked.roles,
          primaryRole: picked.primaryRole,
          active,
          yearRound,
        }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(body?.error ?? S.saveFailed)
        setBusy(false)
        return
      }
      setSaved(true)
      // The header shows the nickname, and the list under it is a server fact.
      router.refresh()
    } catch {
      setError(S.saveFailed)
    }
    setBusy(false)
  }

  return (
    <form className="app__member-form" onSubmit={submit}>
      <Toast message={S.saved} open={saved} />

      <Section title={S.profileTitle} />
      <Note>{S.profileIntro}</Note>

      {error && <p className="app__answer-error">{error}</p>}

      <p className="app__member-fact">
        <span>{S.name}</span>
        <strong>{member.name}</strong>
      </p>

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
        <small>{S.mobileHint}</small>
      </label>

      <label className="app__field">
        <span>{S.email}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          autoComplete="off"
          inputMode="email"
        />
        <small>{S.emailHint}</small>
      </label>

      <RolePicker
        roles={picked.roles}
        primaryRole={picked.primaryRole}
        onChange={setPicked}
        disabled={busy}
      />

      <Switch
        checked={active}
        onChange={setActive}
        disabled={busy}
        label={S.active}
        note={S.activeHint}
      />

      <Switch
        checked={yearRound}
        onChange={setYearRound}
        disabled={busy}
        label={S.yearRound}
        note={S.yearRoundHint}
      />

      <Button type="submit" variant="primary" disabled={busy} check pop={saved}>
        {busy ? S.saving : S.save}
      </Button>
    </form>
  )
}
