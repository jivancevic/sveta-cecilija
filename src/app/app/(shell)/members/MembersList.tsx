'use client'

import { KeyRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  foundLabel,
  memberListRows,
  MEMBER_FILTERS,
  type MemberFilter,
  type MemberListInput,
} from '@/lib/app/members-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { Card, Chip, FilterChips, List, ListRow, RoleMark, Section } from '../../ui'

// The roster list of Članovi (#511, in the redesign's skin since #573).
//
// The list is the screen now: the join code, the queue and the bulk invitation
// moved behind the one header icon (`Invitations`), because a voditelj opens
// this screen to find a dancer far more often than to run a rehearsal.
//
// A row is the T1 `ListRow` and says four things, which is what Q37 asked for:
// the disc with the dancer's initials in their army's colour, the nickname, the
// role with an army dot beside it, and a quiet mark when the person already
// holds a login. "Bez prijave" is the loud half of that pair on purpose: a
// dancer who cannot get in is the only row that needs doing something about.
//
// **The search and the chips both filter in the browser**, which is the one
// place this screen departs from Narudžbe and Upiti. Those two page through
// hundreds of rows, so their filter has to be an address the server can answer;
// this list is the whole society, tens of names, already in the page. Typing
// should narrow it on the keystroke, in a hall, on a connection that may be a
// bar of 3G. Both rules are pure and tested (`memberMatchesSearch`,
// `memberMatchesFilter`), so the fact that they run here changes nothing about
// what matches.
//
// The rows arrive as `MemberListInput`, which is the roster row WITHOUT the
// e-mail: this is a client component, so anything it is handed is in the HTML,
// and ADR-0024's boundary lets a mobile cross into `/app` and not an address.
// The page projects it away (`toMemberListInput`) rather than this file
// promising not to render it.

const S = APP_STRINGS.members

export function MembersList({
  members,
  memberIdsWithLogin,
}: {
  members: MemberListInput[]
  /** An array rather than a Set: a server component may not hand one down. */
  memberIdsWithLogin: string[]
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MemberFilter>('all')

  const withLogin = useMemo(() => new Set(memberIdsWithLogin), [memberIdsWithLogin])
  const rows = useMemo(
    () => memberListRows(members, withLogin, query, filter),
    [members, withLogin, query, filter],
  )

  return (
    <>
      <label className="app__members-search">
        <span className="app__sr-only">{S.searchLabel}</span>
        <input
          type="search"
          className="app__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={S.searchPlaceholder}
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      <FilterChips
        items={MEMBER_FILTERS.map((key) => ({ key, label: S.filters[key] }))}
        active={filter}
        label={S.filtersLabel}
        onSelect={(key) => setFilter(key as MemberFilter)}
      />

      <Section title={S.listTitle} aside={<span aria-live="polite">{foundLabel(rows.length)}</span>} />

      {rows.length === 0 ? (
        <Card className="app__empty">
          <p>{members.length === 0 ? S.emptyAll : S.empty}</p>
        </Card>
      ) : (
        <List className="app__members">
          {rows.map((row) => (
            <ListRow
              key={row.id}
              href={row.href}
              className={row.active ? undefined : 'app__member-row--retired'}
              lead={<RoleMark army={row.army} initials={row.initials} />}
              title={row.nickname}
              meta={
                <>
                  <i className={`app__army-dot app__army-dot--${row.army ?? 'none'}`} aria-hidden="true" />
                  {[row.roleLabel, row.name].filter(Boolean).join(' · ')}
                </>
              }
              trail={
                <span className="app__member-flags">
                  {!row.active && <Chip>{S.retired}</Chip>}
                  {/* The quiet login mark (Q37): a key, and nothing at all
                      where there is no login. Who is still missing one is a
                      question the "Bez prijave" chip answers on the whole
                      list, which is a better place for it than a red badge
                      repeated down seventy rows. */}
                  {row.hasLogin && (
                    <KeyRound className="app__member-in" size={15} aria-label={S.hasLogin} />
                  )}
                </span>
              }
            />
          ))}
        </List>
      )}
    </>
  )
}
