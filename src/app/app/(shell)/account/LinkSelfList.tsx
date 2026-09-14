'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import type { LinkSelfCandidate } from '@/lib/app/link-self'
import type { DanceRole } from '@/lib/moreskant-profile'
import { List, Note } from '../../ui'

// The one tap of "Poveži svoj račun s članom" (#462).
//
// Deliberately NOT optimistic, unlike the Dolazim buttons: this is a one-way
// write that decides who an account is, and showing it as done before the
// server agreed would leave a voditelj believing they are linked to somebody
// they are not. So the row goes busy, and on success the browser lands back on
// `/app`, where the two answer buttons it was missing are now in the hero. That
// arrival is the confirmation; a toast here would be read and then dismissed
// on a screen the person is leaving anyway.
//
// Every refusal it can show comes from the route, which speaks the same
// sentences this list would (`link-self.ts`): a line that is missing and a tap
// that is refused are one rule, and two wordings would look like two.

/**
 * The second line of a row: the real name, then the roles.
 *
 * A voditelj is looking for THEMSELVES here, and a list of nicknames alone is a
 * list of people they know by a different name half the time. The roles are
 * what settles the two Ivans.
 */
function subtitle(c: LinkSelfCandidate): string {
  const ordered = [
    ...(c.primaryRole ? [c.primaryRole] : []),
    ...c.roles.filter((r) => r !== c.primaryRole),
  ]
  const roles = ordered.map((r) => ROLE_LABELS[r as DanceRole] ?? r).join(', ')
  return [c.nickname ? c.name : null, roles].filter(Boolean).join(' · ')
}

export function LinkSelfList({ candidates }: { candidates: LinkSelfCandidate[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function link(memberId: string) {
    if (busyId) return
    setError(null)
    setBusyId(memberId)
    try {
      const res = await fetch('/api/app/link-self', {
        method: 'POST',
        // The `/app` request guard requires JSON: a cross-site HTML form can
        // only send the other three content types.
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(body?.error ?? APP_STRINGS.linkSelf.failed)
        setBusyId(null)
        return
      }
      // Stay busy through the navigation: the row must not go back to looking
      // tappable while the new page is on its way.
      startTransition(() => {
        router.replace('/app')
        router.refresh()
      })
    } catch {
      setError(APP_STRINGS.linkSelf.failed)
      setBusyId(null)
    }
  }

  return (
    <>
      {error && <Note>{error}</Note>}
      <List>
        {candidates.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ui-row"
            disabled={busyId !== null}
            onClick={() => link(c.id)}
          >
            <span className="ui-row__body">
              <b>{c.nickname || c.name}</b>
              <span>{subtitle(c)}</span>
            </span>
            <span className="ui-small" aria-hidden="true">
              {busyId === c.id ? APP_STRINGS.linkSelf.linking : '›'}
            </span>
          </button>
        ))}
      </List>
    </>
  )
}
