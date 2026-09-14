import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'
import { pluralize } from '@/lib/app/roster-loaders'
import type { BoardView, LeaderboardKind, MyStanding, RankRow } from '@/lib/app/leaderboard-rank'
import { Chip, CountUp, List, ListRow, Podium, RoleMark, Section } from '../../ui'

// The Ljestvica panel (#457, reskinned and split in #568; glossary: *Ljestvica*).
//
// A server component: a ranked list of forty nicknames is forty rows of HTML,
// and nothing on it changes without a page load. The only two things the
// browser does are the podium's rise (CSS) and the count that runs up on the
// reader's own row and on the three steps (`CountUp`).
//
// **One season is two lists** (#568, Q36): Moreška, which is every kind of
// evening except the Experience, and Experience on its own. Ranking both in one
// column told a dancer with twelve Redovne that they were behind somebody with
// fifteen Experiences, which is not a comparison anybody in the society makes.
//
// What is deliberately NOT here, and has not been since #457: any treatment of
// the bottom of the list. No red, no "zadnji", no "fali ti još". A dancer with
// two evenings is on the same list as one with twenty because they are in the
// same society, and a board that shames the bottom is a board people stop
// opening.
//
// And no crown that was not given tonight: a *titula* belongs to one evening's
// lineup and never to a person (CONTEXT.md → *Title*), so every mark here is an
// army and `title` is null. The season's counts contain no title to draw.

const S = APP_STRINGS.board

export interface BoardList {
  kind: LeaderboardKind
  label: string
  view: BoardView
  /** Where the reader stands on THIS list; null when they have no row on it. */
  standing: MyStanding | null
  /** Confirmed evenings of this list's kinds, for the empty case. */
  confirmed: number
}

/** The count on a row: the reader's own arrives, everybody else's is printed. */
function Count({ row }: { row: RankRow }) {
  return (
    <b className="app__lb-count">
      {row.me ? <CountUp value={row.performances} /> : row.performances}
    </b>
  )
}

function Row({ row, pinned = false }: { row: RankRow; pinned?: boolean }) {
  return (
    <ListRow
      className={row.me ? 'app__lb-row--me' : undefined}
      lead={
        <span className="app__lb-lead">
          {/* The pinned row carries its place in its TITLE ("ti · 24."), so the
              column is left empty rather than printing 24 twice; it still holds
              its width, which is what keeps every mark on the screen in line. */}
          <i className="app__lb-rank">{pinned ? '' : S.rank(row.rank)}</i>
          <RoleMark army={row.army} title={row.title} small />
        </span>
      }
      title={pinned ? S.pinned(row.rank) : row.nickname}
      meta={row.fullSeason ? S.fullSeason : undefined}
      trail={<Count row={row} />}
    >
      {row.me && !pinned && <Chip tone="gold">{S.you}</Chip>}
    </ListRow>
  )
}

/** "Ti si 5. s 11 nastupa. Još 2 nastupa do 4. mjesta." */
function Standing({ standing }: { standing: MyStanding }) {
  const counted = (n: number) => pluralize(n, APP_STRINGS.moreska.count)
  return (
    <p className="app__lb-standing">
      {/* The first half takes the instrumental ("s 1 nastupom"), the second the
          nominative ("Još 1 nastup"). Two cases, two word sets, one sentence. */}
      {S.standing(standing.rank, pluralize(standing.performances, S.withCount))}{' '}
      {/* The place NAMED is the one those evenings actually reach: a tie shares
          a rank, so from rank 3 behind two dancers at the top the sentence says
          "do 1. mjesta", never "do 2." (#457 review). */}
      <span>
        {standing.toNextPlace === null || standing.nextPlace === null
          ? S.leading
          : S.toNextPlace(counted(standing.toNextPlace), standing.nextPlace)}
      </span>
    </p>
  )
}

function OneList({ list, season }: { list: BoardList; season: number }) {
  const { view } = list
  const empty = view.podium.length === 0 || list.confirmed === 0

  return (
    <section className="app__lb-list">
      <Section title={list.label} aside={empty ? undefined : pluralize(view.total, S.onList)} />

      {empty ? (
        <p className="app__empty">
          {list.kind === 'experience' ? S.emptyExperience : S.empty}
        </p>
      ) : (
        <>
          <Podium
            large
            entries={view.podium.map((row) => ({
              id: row.memberId,
              label: row.nickname,
              value: <CountUp value={row.performances} />,
              mark: <RoleMark army={row.army} title={row.title} small />,
              caption: S.place(row.rank),
              me: row.me,
            }))}
          />

          {list.standing && <Standing standing={list.standing} />}

          {view.rows.length > 0 && (
            <List>
              {view.rows.map((row) => (
                <Row key={row.memberId} row={row} />
              ))}
            </List>
          )}

          {/* The reader's own place is never behind a "vidi cijeli popis": a
              dancer who is 34th opened this screen to see 34. */}
          {view.pinned && (
            <List className="app__lb-pinned">
              <Row row={view.pinned} pinned />
            </List>
          )}

          <Link
            className="ui-btn ui-btn--link app__lb-all"
            href={`/app/leaderboard/full?season=${season}&kind=${list.kind}`}
          >
            {S.seeAll}
          </Link>
        </>
      )}
    </section>
  )
}

export function Board({ lists, season }: { lists: BoardList[]; season: number }) {
  return (
    <div className="app__lb">
      {lists.map((list) => (
        <OneList key={list.kind} list={list} season={season} />
      ))}

      <p className="app__lb-footer">
        {S.footer(
          pluralize(
            lists.reduce((sum, l) => sum + l.confirmed, 0),
            S.confirmedCount,
          ),
        )}
      </p>
    </div>
  )
}
