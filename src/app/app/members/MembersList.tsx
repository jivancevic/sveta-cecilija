'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { foundLabel, memberListRows, type MemberListInput } from '@/lib/app/members-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { InviteActions } from './InviteActions'

// The roster list of Članovi (#511): search, a row per moreškant, and the
// invitation on the row itself.
//
// **The search filters in the browser rather than in the URL**, which is the
// one place this screen departs from Narudžbe and Upiti. Those two page through
// hundreds of rows, so their filter has to be an address the server can answer;
// this list is the whole society, tens of names, already in the page. Typing
// should narrow it on the keystroke, in a hall, on a connection that may be a
// bar of 3G. The matching rule itself is pure and tested
// (`memberMatchesSearch`), so the fact that it runs here changes nothing about
// what matches.
//
// A row is a link to the profile and a button beside it, never a link wrapping
// a button: "Pozovi" is a write and the name is a navigation, and one tap
// target that did both would be the wrong one half the time.
//
// The rows arrive as `MemberListInput`, which is the roster row WITHOUT the
// e-mail: this is a client component, so anything it is handed is in the HTML,
// and ADR-0024's boundary lets a mobile cross into `/app` and not an address.
// The page projects it away (`toMemberListInput`) rather than this file
// promising not to render it.

export function MembersList({
  members,
  memberIdsWithLogin,
}: {
  members: MemberListInput[]
  /** An array rather than a Set: a server component may not hand one down. */
  memberIdsWithLogin: string[]
}) {
  const [query, setQuery] = useState('')
  const [inviteAll, setInviteAll] = useState<{ busy: boolean; message: string | null }>({
    busy: false,
    message: null,
  })

  const withLogin = useMemo(() => new Set(memberIdsWithLogin), [memberIdsWithLogin])
  const rows = useMemo(
    () => memberListRows(members, withLogin, query),
    [members, withLogin, query],
  )
  const missing = useMemo(() => members.filter((m) => !withLogin.has(m.id)).length, [members, withLogin])

  async function sendAll() {
    if (inviteAll.busy) return
    setInviteAll({ busy: true, message: null })
    try {
      const res = await fetch('/api/app/invite/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null
      setInviteAll({
        busy: false,
        message: body?.message ?? body?.error ?? APP_STRINGS.inviteAll.unexpected,
      })
    } catch {
      setInviteAll({ busy: false, message: APP_STRINGS.inviteAll.unexpected })
    }
  }

  return (
    <section className="app__more-block">
      <h2 className="app__month-head">
        <span>{APP_STRINGS.members.listTitle}</span>
      </h2>

      <label className="app__members-search">
        <span className="app__members-search-label">{APP_STRINGS.members.searchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={APP_STRINGS.members.searchPlaceholder}
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      <p className="app__members-count" aria-live="polite">
        {foundLabel(rows.length)}
      </p>

      {/* The bulk invitation, which only goes to the dancers whose row carries
          an e-mail; its answer says so per outcome (#462). Hidden once nobody
          is missing a login, because then it has nothing to do. */}
      {missing > 0 && (
        <div className="app__members-bulk">
          <button
            type="button"
            className="app__button app__button--quiet"
            onClick={sendAll}
            disabled={inviteAll.busy}
          >
            {inviteAll.busy ? APP_STRINGS.inviteAll.sending : APP_STRINGS.inviteAll.action}
          </button>
          {inviteAll.message && <p className="app__invite-hint">{inviteAll.message}</p>}
        </div>
      )}

      <p className="app__invite-hint">{APP_STRINGS.inviteLink.channelHint}</p>

      {rows.length === 0 ? (
        <div className="app__empty-state">
          {members.length === 0 ? APP_STRINGS.members.emptyAll : APP_STRINGS.members.empty}
        </div>
      ) : (
        <div className="app__members">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`app__member-row${row.active ? '' : ' app__member-row--retired'}`}
            >
              <Link className="app__member-open" href={row.href}>
                <span className="app__member-name">
                  <strong>{row.nickname}</strong>
                  <small>
                    {[row.name, row.roleLabel].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <span className="app__member-flags">
                  {!row.active && (
                    <span className="app__badge">{APP_STRINGS.members.retired}</span>
                  )}
                  <span
                    className={`app__badge${row.hasLogin ? ' app__badge--in' : ' app__badge--out'}`}
                  >
                    {row.hasLogin ? APP_STRINGS.members.hasLogin : APP_STRINGS.members.noLogin}
                  </span>
                  <span aria-hidden="true">›</span>
                </span>
              </Link>

              <InviteActions id={row.id} nickname={row.nickname} mobile={row.mobile} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
