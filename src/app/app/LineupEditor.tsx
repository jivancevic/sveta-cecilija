'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import { DANCE_ROLES, LINEUP_ROLES, type LineupRole } from '@/lib/moreskant-profile'
import { compareLineupRows, roleWarnings } from '@/lib/lineup/rules'
import type { LineupPerson, LineupRow } from '@/lib/app/detail-loaders'

// The Postava editor (#432), living on *Stanje* since #658.
//
// It used to be a card on the Izvedbe detail, which a `moreskant` login does not
// unlock — so once one evening's list could be delegated to a dancer (ADR-0029),
// a Zaduženi could hand out the four titles on Stanje and had nowhere to record
// an unusual role. It moved rather than being copied: two editors of the same
// record diverge the first time one of them is fixed.
//
// **Confirming left with the move.** Potvrdi and Otključaj used to be here and
// are now only in Stanje's action block, where #566 put them: one button, one
// place. This editor saves a draft and nothing else, and the four-title rule
// still refuses on CONFIRM under the row lock.
//
// The whole list is one form and Spremi replaces it: that is the sentence the
// route implements too (`POST /api/app/lineup` deletes and re-inserts in a
// transaction), so what the thumb does and what the database does are the same
// operation. Nothing here is optimistic — a postava is a record of who danced,
// and a row that appears before the server agreed would be a claim rather than
// a record.
//
// "Napravi iz prisutnosti" needs no round trip: the suggestion is a pure
// function of data the page already loaded, so the server computed it in the
// loader and handed it down. Pressing the button REPLACES the working list,
// which is what "napravi" means; the voditelj then adjusts and saves.
//
// A role the dancer's profile does not list is a WARNING and still saves
// (story 29). The warnings are recomputed in the browser by calling the SAME
// pure function the server calls (`roleWarnings`), so the line appears the
// moment the select changes and can never say something the route would not:
// one rule, imported, rather than a second implementation of it that agrees
// until somebody edits one of them.

export function LineupEditor({
  performanceId,
  initialEntries,
  suggested,
  roster,
  confirmed,
  experience,
}: {
  performanceId: string
  initialEntries: LineupRow[]
  suggested: LineupRow[]
  roster: LineupPerson[]
  confirmed: boolean
  /**
   * A Moreška Experience (#620): the one kind of evening that HAS a voditelj.
   *
   * Every other kind offers the six dance roles and nothing else, because the
   * route refuses a `voditelj` line on them outright — a dropdown that offers a
   * value the server will 400 is a trap, and this one had been offering it on
   * every evening since the role existed.
   */
  experience: boolean
}) {
  const router = useRouter()
  const [entries, setEntries] = useState<LineupRow[]>(initialEntries)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState<null | 'save'>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rosterById = useMemo(
    () => new Map(roster.map((p) => [p.memberId, p])),
    [roster],
  )
  const inLineup = useMemo(() => new Set(entries.map((e) => e.memberId)), [entries])
  const available = roster.filter((p) => !inLineup.has(p.memberId))

  // `roleWarnings` is the server's function, imported: it is pure, so the
  // browser can ask it the same question the route will. The roster is shaped
  // back into the `AttendanceMember` it reads — nickname and roles are all it
  // looks at, and there is no email anywhere near this payload (ADR-0024).
  const warnings = useMemo(() => {
    const members = roster.map((p) => ({
      id: p.memberId,
      nickname: p.nickname,
      roles: p.roles,
      active: true,
      isMoreskant: true,
    }))
    return new Map(
      roleWarnings(entries, members).map((w) => [w.memberId, `${w.message} ${APP_STRINGS.lineup.warningSuffix}`]),
    )
  }, [entries, roster])

  // Every mutation re-sorts, so the list stays in the one order the dancer's
  // view also uses (`compareLineupRows`): a role change moves a new kralj to
  // the top instead of leaving the page in an order nothing else shares.
  function setRole(memberId: string, role: LineupRole) {
    setEntries((rows) =>
      rows.map((r) => (r.memberId === memberId ? { ...r, role } : r)).sort(compareLineupRows),
    )
  }

  function remove(memberId: string) {
    setEntries((rows) => rows.filter((r) => r.memberId !== memberId))
  }

  function add(memberId: string) {
    const person = rosterById.get(memberId)
    if (!person) return
    setEntries((rows) =>
      [
        ...rows,
        {
          memberId,
          nickname: person.nickname,
          // Their first listed role is the least surprising default; a member
          // with no roles at all falls back to crni and warns until changed.
          role: person.roles[0] ?? 'crni',
        },
      ].sort(compareLineupRows),
    )
    setPick('')
  }

  async function post(url: string, body: unknown, kind: 'save') {
    if (busy) return null
    setBusy(kind)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const parsed = (await res.json().catch(() => null)) as
        | { ok?: true; error?: string }
        | null
      if (!res.ok || !parsed?.ok) {
        setError(parsed?.error ?? APP_STRINGS.lineup.failed)
        return null
      }
      return parsed
    } catch {
      setError(APP_STRINGS.lineup.failed)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    const ok = await post(
      '/api/app/lineup',
      { performanceId, entries: entries.map((e) => ({ memberId: e.memberId, role: e.role })) },
      'save',
    )
    if (!ok) return
    setMessage(APP_STRINGS.lineup.saved)
    router.refresh()
  }

  return (
    <section className="app__lineup">
      <h2 className="app__army-head">
        <span>{APP_STRINGS.lineup.title}</span>
        <span className="app__chip">{entries.length}</span>
      </h2>

      <p className="app__lineup-state">
        {confirmed ? APP_STRINGS.lineup.confirmedNote : APP_STRINGS.lineup.draftNote}
      </p>

      {!confirmed && suggested.length > 0 && (
        <button
          type="button"
          className="app__button app__button--small"
          onClick={() => setEntries([...suggested].sort(compareLineupRows))}
          disabled={busy !== null}
        >
          {APP_STRINGS.lineup.fromAttendance}
        </button>
      )}

      {entries.length === 0 ? (
        <p className="app__empty">{APP_STRINGS.lineup.empty}</p>
      ) : (
        <ul className="app__people">
          {entries.map((entry) => (
            <li key={entry.memberId} className="app__lineup-row">
              <span className="app__person-name">{entry.nickname}</span>
              <span className="app__person-controls">
                <select
                  className="app__select"
                  aria-label={entry.nickname}
                  value={entry.role}
                  disabled={confirmed || busy !== null}
                  onChange={(e) => setRole(entry.memberId, e.target.value as LineupRole)}
                >
                  {(experience ? LINEUP_ROLES : DANCE_ROLES).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                {!confirmed && (
                  <button
                    type="button"
                    className="app__move"
                    onClick={() => remove(entry.memberId)}
                    disabled={busy !== null}
                  >
                    {APP_STRINGS.lineup.remove}
                  </button>
                )}
              </span>
              {warnings.has(entry.memberId) && (
                <span className="app__lineup-warning">{warnings.get(entry.memberId)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!confirmed && (
        <div className="app__lineup-add">
          {available.length === 0 ? (
            <p className="app__empty">{APP_STRINGS.lineup.nobodyToAdd}</p>
          ) : (
            <select
              className="app__select"
              aria-label={APP_STRINGS.lineup.add}
              value={pick}
              disabled={busy !== null}
              onChange={(e) => add(e.target.value)}
            >
              <option value="">{APP_STRINGS.lineup.addPlaceholder}</option>
              {available.map((person) => (
                <option key={person.memberId} value={person.memberId}>
                  {person.nickname}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="app__lineup-actions">
        {!confirmed && (
          <button
            type="button"
            className="app__button"
            onClick={save}
            disabled={busy !== null}
          >
            {busy === 'save' ? APP_STRINGS.lineup.saving : APP_STRINGS.lineup.save}
          </button>
        )}
      </div>

      {message && <p className="app__alarm-result">{message}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </section>
  )
}
