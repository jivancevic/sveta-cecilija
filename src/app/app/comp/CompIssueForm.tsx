'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  compIssueView,
  holderName,
  matchMembers,
  type MemberOption,
} from '@/lib/app/comp-screen'
import type { SellOption } from '@/lib/app/partner-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { Stepper } from '../Stepper'
import { DrainBanner } from '../DrainBanner'

// "Podijeli gratis" (#506), ported from the Backoffice `CompIssueForm`.
//
// Same flow and same guarantees: the counts go to `/api/comp/issue`, which
// re-reads the member, re-does the seat maths inside the per-show advisory lock
// and awaits the ticket e-mail so the answer can say whether it actually left.
// The steppers' ceiling is the courtesy half of the capacity rule, never the
// rule (`comp-screen.ts`).
//
// The member is REQUIRED and the button says so by staying disabled: per-member
// reporting is the whole reason comps carry a Member link (ADR-0019), and an
// unattributed comp would be a seat nobody can account for. "Dodaj člana" is
// there because the person standing at the desk is sometimes not on the list
// yet, and sending the secretary to the Backoffice mid-conversation is how a
// comp ends up attributed to the wrong person.
//
// The holder name is the THIRD name around a comp: the member is who received
// it, the holder is what gets printed, and whoever claims the QR overwrites it
// with their own. It prefills from the member and stops prefilling the moment
// it is touched.

const BANNER_MS = 10000

const S = APP_STRINGS.gratis

interface CompDone {
  orderId: string
  code: string
  ticketCount: number
  emailStatus: 'sent' | 'skipped' | 'failed'
  emailTo: string | null
}

export function CompIssueForm({
  shows,
  members: initialMembers,
}: {
  shows: SellOption[]
  members: MemberOption[]
}) {
  const router = useRouter()
  const [members, setMembers] = useState(initialMembers)
  const [showId, setShowId] = useState(shows.find((s) => !s.soldOut)?.id ?? shows[0]?.id ?? '')
  const [memberId, setMemberId] = useState('')
  const [query, setQuery] = useState('')
  const [adults, setAdults] = useState(0)
  const [children, setChildren] = useState(0)
  const [typedHolder, setTypedHolder] = useState('')
  const [holderEdited, setHolderEdited] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<CompDone | null>(null)

  // Adding a member without leaving the form.
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [savingMember, setSavingMember] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)

  const member = members.find((m) => m.id === memberId) ?? null
  const holder = holderName({ member, typed: typedHolder, edited: holderEdited })
  const view = compIssueView({ shows, showId, memberId, adults, children, busy })
  const matches = useMemo(() => matchMembers(members, query), [members, query])

  const dismiss = useCallback(() => setDone(null), [])

  const openPdf = (orderId: string) =>
    window.open(`/api/orders/${orderId}/tickets.pdf`, '_blank', 'noopener')

  async function addMember() {
    const name = newName.trim()
    if (!name || savingMember) return
    setSavingMember(true)
    setMemberError(null)
    try {
      const res = await fetch('/api/comp/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = (await res.json().catch(() => ({}))) as { member?: MemberOption }
      if (!res.ok || !body.member) {
        setMemberError(S.addMemberFailed)
        return
      }
      const created = body.member
      setMembers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'hr')))
      // Picked straight away: the person adding a member is adding the one they
      // are about to attribute this comp to.
      setMemberId(created.id)
      setQuery('')
      setNewName('')
      setAdding(false)
    } catch {
      setMemberError(S.addMemberFailed)
    } finally {
      setSavingMember(false)
    }
  }

  async function submit() {
    if (!view.canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/comp/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId,
          memberId,
          adults,
          children,
          buyerName: holder.trim() || null,
          email: email.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        orderId?: string
        code?: string
        ticketCount?: number
        emailStatus?: string
        emailTo?: string | null
      }
      if (!res.ok || !body.orderId) {
        setError(res.status === 409 ? S.tooMany : S.failed)
        return
      }
      openPdf(body.orderId)
      setDone({
        orderId: body.orderId,
        code: body.code ?? '',
        ticketCount: body.ticketCount ?? view.total,
        emailStatus:
          body.emailStatus === 'sent' || body.emailStatus === 'failed' ? body.emailStatus : 'skipped',
        emailTo: typeof body.emailTo === 'string' ? body.emailTo : null,
      })
      setAdults(0)
      setChildren(0)
      setMemberId('')
      setQuery('')
      setTypedHolder('')
      setHolderEdited(false)
      setEmail('')
      router.refresh()
    } catch {
      setError(S.network)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app__comp-issue">
      <h2 className="app__month-head">
        <span>{S.issueTitle}</span>
      </h2>

      {done && <IssuedBanner done={done} onDone={dismiss} onOpenPdf={() => openPdf(done.orderId)} />}

      {shows.length === 0 ? (
        <p className="app__empty">{S.noShows}</p>
      ) : (
        <>
          <label className="app__comp-name" htmlFor="comp-show">
            {S.show}
          </label>
          <select
            id="comp-show"
            className="app__select app__select--wide"
            value={showId}
            onChange={(e) => {
              setShowId(e.target.value)
              setError(null)
            }}
          >
            {shows.map((s) => (
              <option key={s.id} value={s.id} disabled={s.soldOut}>
                {s.label} · {s.soldOut ? S.soldOut : S.seatsLeft(s.remaining)}
              </option>
            ))}
          </select>

          <label className="app__comp-name" htmlFor="comp-member">
            {S.member}
          </label>
          <input
            id="comp-member"
            type="text"
            className="app__input"
            value={query}
            placeholder={S.memberSearch}
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setQuery(e.target.value)}
          />

          {members.length === 0 ? (
            <p className="app__comp-hint">{S.noMembers}</p>
          ) : matches.length === 0 ? (
            <p className="app__comp-hint">{S.noMatch}</p>
          ) : (
            <ul className="app__member-list">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={
                      m.id === memberId
                        ? 'app__member-row app__member-row--picked'
                        : 'app__member-row'
                    }
                    aria-pressed={m.id === memberId}
                    disabled={busy}
                    onClick={() => setMemberId(m.id === memberId ? '' : m.id)}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {adding ? (
            <div className="app__member-add">
              <input
                type="text"
                className="app__input"
                value={newName}
                placeholder={S.newMemberName}
                disabled={savingMember}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button
                type="button"
                className="app__button"
                disabled={savingMember || newName.trim() === ''}
                onClick={addMember}
              >
                {savingMember ? S.savingMember : S.saveMember}
              </button>
              <button
                type="button"
                className="app__button app__button--link"
                disabled={savingMember}
                onClick={() => setAdding(false)}
              >
                {S.cancel}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="app__button app__button--link app__button--quiet"
              onClick={() => setAdding(true)}
            >
              {S.addMember}
            </button>
          )}
          {memberError && <p className="app__error">{memberError}</p>}

          <div className="app__comp-steppers">
            <Stepper
              label={S.adults}
              value={adults}
              max={view.maxAdults}
              disabled={busy}
              onChange={setAdults}
            />
            <Stepper
              label={S.children}
              value={children}
              max={view.maxChildren}
              disabled={busy}
              onChange={setChildren}
            />
          </div>

          <label className="app__field">
            <span>{S.holder}</span>
            <input
              type="text"
              value={holder}
              placeholder={S.holderHint}
              disabled={busy}
              onChange={(e) => {
                setHolderEdited(true)
                setTypedHolder(e.target.value)
              }}
            />
          </label>

          <label className="app__field">
            <span>{S.email}</span>
            <input
              type="email"
              value={email}
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <p className="app__comp-hint">{S.emailHint}</p>

          {error && <p className="app__error">{error}</p>}

          <button
            type="button"
            className="app__button"
            disabled={!view.canSubmit}
            onClick={submit}
          >
            {busy ? S.issuing : S.issue}
          </button>
          {memberId === '' && view.total > 0 && <p className="app__comp-hint">{S.memberRequired}</p>}
        </>
      )}
    </section>
  )
}

/**
 * The confirmation.
 *
 * A failed e-mail is the one outcome that needs a decision (print the PDF, or
 * resend from the order), so that banner stays put; sent and skipped drain away
 * like the partner sale's, because there is nothing to do about either.
 */
function IssuedBanner({
  done,
  onDone,
  onOpenPdf,
}: {
  done: CompDone
  onDone: () => void
  onOpenPdf: () => void
}) {
  const line =
    done.emailStatus === 'sent'
      ? S.emailSent(done.emailTo ?? '')
      : done.emailStatus === 'failed'
        ? S.emailFailed(done.emailTo ?? '')
        : S.emailSkipped

  const body = (
    <div className="app__sell-done">
      <b>{S.doneTitle}</b>
      <span>{S.doneBody(done.ticketCount, done.code)}</span>
      <span className="app__comp-email">{line}</span>
      <button type="button" className="app__button app__button--link" onClick={onOpenPdf}>
        {S.openPdf}
      </button>
    </div>
  )

  if (done.emailStatus === 'failed') {
    return (
      <div className="app__drain app__drain--warn" role="status">
        {body}
      </div>
    )
  }

  return (
    <DrainBanner ms={BANNER_MS} onDone={onDone} tone="good">
      {body}
    </DrainBanner>
  )
}
