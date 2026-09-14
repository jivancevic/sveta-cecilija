import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'
import { pluralize } from '@/lib/app/roster-loaders'
import type { BoardView, LeaderboardKind, MyStanding, RankRow } from '@/lib/app/leaderboard-rank'
import { Chip, CountUp, List, ListRow, Podium, RoleMark, Section, Trophy } from '../../ui'

// The Ljestvica panel (#457, split in two lists by #568, gamified by #607;
// glossary: *Ljestvica*).
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
// **The three steps wear cups** (#607, redrawn in #611). The trophy carries the
// RANK, which is what makes a tie legible without a sentence about ties: equal
// counts share a rank and the next one skips, so two dancers on 21 both wear a
// gold cup and no silver is drawn at all. The cup is a flat silhouette and the
// place is printed under it in the same metal — the first version put the digit
// inside the bowl, where at 34px it was four details fighting in the space of a
// fingernail and the whole podium read as clip art.
//
// The rows under it carry no cup. There the metal is on the RANK NUMERAL and as
// a hairline around the disc, so the top three keep the initials that say who
// they are: swapping a cup in for the disc took the identity away from exactly
// the three people a reader is most likely to be looking for.
//
// **Every disc carries initials** (#607). `RoleMark` has had them since #573
// for exactly this case — a list of people out of an evening, where no disc has
// a title to draw and every one would be a blank colour swatch. The letters are
// of the NAME, because the nickname is already printed beside the disc and
// "who is Cici" is the question they answer.
//
// What is deliberately NOT here, and has not been since #457: any treatment of
// the bottom of the list. No red, no "zadnji", no "fali ti još". A dancer with
// two evenings is on the same list as one with twenty because they are in the
// same society, and a board that shames the bottom is a board people stop
// opening. The rank movement obeys the same rule from the other side: it is on
// the reader's own row and nobody else's, because a nudge on somebody else's
// row is a comment on their effort.
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
  /**
   * How far the reader moved on the last confirmed evening, or null when there
   * is nothing to say. Only the Moreška list carries one: "nakon zadnje
   * moreške" is the sentence, and an Experience is not one.
   */
  movement?: number | null
}

/** The count on a row: the reader's own arrives, everybody else's is printed. */
function Count({ row }: { row: RankRow }) {
  return (
    <b className="app__lb-count">
      {row.me ? <CountUp value={row.performances} /> : row.performances}
    </b>
  )
}

/** The disc beside a name: the army in colour, the person in two letters. */
function Mark({ row }: { row: RankRow }) {
  return <RoleMark army={row.army} title={row.title} initials={row.initials} small />
}

function Row({
  row,
  season,
  pinned = false,
}: {
  row: RankRow
  season: number
  pinned?: boolean
}) {
  return (
    <ListRow
      // Every row opens that dancer's season (#608). The screen stopped being a
      // dead end here: seventy nicknames, each now a way in.
      href={`/app/leaderboard/${row.memberId}?season=${season}`}
      className={row.me ? 'app__lb-row--me' : undefined}
      lead={
        <span
          className="app__lb-lead"
          data-place={!pinned && row.rank <= 3 ? row.rank : undefined}
        >
          {/* The pinned row carries its place in its TITLE ("ti · 24."), so the
              column is left empty rather than printing 24 twice; it still holds
              its width, which is what keeps every mark on the screen in line. */}
          <i className="app__lb-rank">{pinned ? '' : S.rank(row.rank)}</i>
          <Mark row={row} />
        </span>
      }
      title={pinned ? S.pinned(row.rank) : row.nickname}
      trail={<Count row={row} />}
    >
      {row.me && !pinned && <Chip tone="gold">{S.you}</Chip>}
    </ListRow>
  )
}

/** "▲2 nakon zadnje moreške" — the reader's own row and nobody else's. */
function Movement({ places }: { places: number }) {
  return (
    <span className="app__lb-move" data-dir={places > 0 ? 'up' : 'down'}>
      <b aria-hidden="true">{S.movement(places)}</b>
      <span className="app__sr-only">{S.movementLabel(places)}</span>
      <i aria-hidden="true">{S.movementSince}</i>
    </span>
  )
}

/** "Ti si 5. s 11 nastupa. Još 2 nastupa do 4. mjesta. ▲2 nakon zadnje moreške" */
function Standing({ standing, movement }: { standing: MyStanding; movement?: number | null }) {
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
      {/* Null when the reader did not move: a zero is not news, and printing it
          every week turns the one piece of news on the screen into furniture. */}
      {movement != null && <Movement places={movement} />}
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
              href: `/app/leaderboard/${row.memberId}?season=${season}`,
              cup: <Trophy place={row.rank} className="ui-podium__cup" />,
              mark: <Mark row={row} />,
              // The cup carries no numeral any more (#611): a digit inside a
              // 26px silhouette was unreadable, so the place is printed here,
              // in the metal its cup is drawn in, where it can be read.
              caption: (
                <span className="app__lb-podium-place" data-place={row.rank}>
                  {S.place(row.rank)}
                </span>
              ),
              me: row.me,
            }))}
          />

          {list.standing && <Standing standing={list.standing} movement={list.movement} />}

          {view.rows.length > 0 && (
            <List>
              {view.rows.map((row) => (
                <Row key={row.memberId} row={row} season={season} />
              ))}
            </List>
          )}

          {/* The reader's own place is never behind a "vidi cijeli popis": a
              dancer who is 34th opened this screen to see 34. */}
          {view.pinned && (
            <List className="app__lb-pinned">
              <Row row={view.pinned} season={season} pinned />
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
