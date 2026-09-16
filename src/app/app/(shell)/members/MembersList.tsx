'use client'

import { useMemo, useState } from 'react'
import {
  isMissing,
  MEMBER_FILTERS,
  MEMBER_MARKS,
  memberFilterCounts,
  memberMatchesFilter,
  type MemberAccess,
  type MemberFilter,
  type MemberMark,
} from '@/lib/app/member-marks'
import {
  foundLabel,
  memberListRows,
  type MemberListInput,
} from '@/lib/app/members-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Card, Chip, FilterChips, List, ListRow, RoleMark, Section, Sheet } from '../../ui'

// The roster list of Članovi (#511, in the redesign's skin since #573, with
// #653's three marks on every row).
//
// The list is the screen: the join code, the queue and the bulk invitation
// moved behind the one header icon (`Invitations`), because a voditelj opens
// this screen to find a dancer far more often than to run a rehearsal.
//
// **A row now answers the three questions a voditelj actually has** (#653): is
// the app on that phone, will it ring, can that person get back in on their
// own. One glyph per column and the STATE is carried by weight rather than by a
// second emoji — 🔔/🔕 reads logical in the head and breaks the scan on the
// page, because the eye looks down a column for the same shape at different
// weights and not for two shapes. The slots are a fixed grid, so seventy-six
// rows read as three columns rather than as a ragged right edge.
//
// **The marks are not tappable.** The row is already a link to the profile, and
// three 20px targets inside a target is a thumb miss that opens the wrong
// person. Everything they could have led to is in the legend sheet behind the
// count over the list, which is also where the counts live, so "what do these
// mean" and "who is missing what" open with the same tap.
//
// **The search and the chips both filter in the browser**, which is the one
// place this screen departs from Narudžbe and Upiti. Those two page through
// hundreds of rows, so their filter has to be an address the server can answer;
// this list is the whole society, tens of names, already in the page. Typing
// should narrow it on the keystroke, in a hall, on a connection that may be a
// bar of 3G. The rules are pure and tested (`memberMatchesSearch`,
// `memberMatchesFilter`, `memberFilterCounts`), so the fact that they run here
// changes nothing about what matches.
//
// The rows arrive as `MemberListInput`, which is the roster row WITHOUT the
// e-mail, and the marks arrive as a decided `MemberAccess` per id: this is a
// client component, so anything it is handed is in the HTML, and ADR-0028 keeps
// a dancer's address on their own Profil. What crosses is a yes-or-no.

const S = APP_STRINGS.members

/** One glyph per column, in the order the columns are drawn. */
const GLYPH: Record<MemberMark, string> = {
  installed: '📲',
  notifications: '🔔',
  access: '🔑',
}

export function MembersList({
  members,
  access,
}: {
  members: MemberListInput[]
  /**
   * The decided marks by Member id, or null when the signal could not be read.
   * A plain object rather than a Map: a server component may not hand one down.
   */
  access: Record<string, MemberAccess> | null
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MemberFilter>('all')
  const [legend, setLegend] = useState(false)

  // The search first, the chip second, so the counts describe the list the
  // reader is looking at rather than the whole roster.
  const searched = useMemo(
    () => memberListRows(members, access, query),
    [members, access, query],
  )
  const counts = useMemo(() => memberFilterCounts(searched), [searched])
  const rows = useMemo(
    () => searched.filter((row) => memberMatchesFilter(row.access, filter)),
    [searched, filter],
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

      {access !== null && (
        <FilterChips
          items={MEMBER_FILTERS.map((key) => ({
            key,
            label: (
              <>
                {S.filters[key]}
                <b className="app__member-chip-count">{counts[key]}</b>
              </>
            ),
          }))}
          active={filter}
          label={S.filtersLabel}
          onSelect={(key) => setFilter(key as MemberFilter)}
        />
      )}

      <Section
        title={S.listTitle}
        aside={
          access === null ? (
            <span aria-live="polite">{foundLabel(rows.length)}</span>
          ) : (
            <button
              type="button"
              className="app__member-legend-open"
              onClick={() => setLegend(true)}
              aria-label={S.marks.legendOpen}
            >
              <span aria-live="polite">{foundLabel(rows.length)}</span>
              <span className="app__member-legend-glyphs" aria-hidden="true">
                {MEMBER_MARKS.map((mark) => GLYPH[mark]).join('')}
              </span>
            </button>
          )
        }
      />

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
                  <Marks access={row.access} />
                </span>
              }
            />
          ))}
        </List>
      )}

      <Sheet
        open={legend}
        title={S.marks.legendTitle}
        onClose={() => setLegend(false)}
        footer={
          <Button variant="ghost" onClick={() => setLegend(false)}>
            {APP_STRINGS.ui.sheetClose}
          </Button>
        }
      >
        <ul className="app__member-legend">
          {MEMBER_MARKS.map((mark) => (
            <li key={mark}>
              <span className="app__mark app__mark--yes" aria-hidden="true">
                {GLYPH[mark]}
              </span>
              <div>
                <b>{S.marks[mark]}</b>
                <span>
                  {S.marks.missing(
                    S.marks.missingLabels[mark],
                    searched.filter((row) => row.access != null && isMissing(row.access, mark))
                      .length,
                  )}
                </span>
              </div>
            </li>
          ))}
          <li>
            <span className="app__mark app__mark--unknown" aria-hidden="true" />
            <div>
              <b>{S.marks.state.unknown}</b>
              <span>{S.marks.unknownNote}</span>
            </div>
          </li>
          <li>
            <span className="app__member-never" aria-hidden="true">
              {S.marks.neverIn}
            </span>
            <div>
              <b>{S.marks.neverIn}</b>
              <span>{S.marks.neverInNote}</span>
            </div>
          </li>
        </ul>
      </Sheet>
    </>
  )
}

/** The right-hand side of one row: three marks, or the words "nije ušao". */
function Marks({ access }: { access: MemberAccess | null }) {
  if (access === null) return null
  if (access.kind === 'never-in') {
    return <span className="app__member-never">{S.marks.neverIn}</span>
  }
  return (
    <span className="app__member-marks">
      {MEMBER_MARKS.map((mark) => {
        const answer = access[mark]
        const label = `${S.marks[mark]}: ${S.marks.state[answer]}`
        // "ne znam" draws a RULE rather than a dimmed glyph: a dash and a
        // grayscale emoji differ in tone when compared side by side and in
        // SHAPE at arm's length, and on day one the whole install column is
        // this one. A blob that is not there is what "nobody has it" looks
        // like; a line is what "nothing measured" looks like.
        return answer === 'unknown' ? (
          <span key={mark} className="app__mark app__mark--unknown" role="img" aria-label={label} />
        ) : (
          <span key={mark} className={`app__mark app__mark--${answer}`} role="img" aria-label={label}>
            {GLYPH[mark]}
          </span>
        )
      })}
    </span>
  )
}
