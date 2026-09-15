import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import { pluralize } from '@/lib/app/roster-loaders'
import { MARK_OF_ROLE } from '@/lib/app/leaderboard-rank'
import { flameNiz } from '@/lib/app/niz'
import type {
  BoardView,
  Leaders,
  LeaderboardKind,
  MyStanding,
  RankRow,
  RivalNews,
  SeasonKing,
} from '@/lib/app/leaderboard-rank'
import type { AttendanceStatus } from '@/lib/attendance/rules'
import { Answer } from '../moreska/Answer'
import { Card, CountUp, Flame, List, ListRow, Podium, RoleMark, Section, Trophy } from '../../ui'
import { BoardRow } from './BoardRow'
import { StandingCard } from './StandingCard'

// The Ljestvica panel (#457, split in two lists by #568, gamified by #607,
// rebuilt from the phone by #614; glossary: *Ljestvica*).
//
// A server component: a ranked list of forty nicknames is forty rows of HTML,
// and nothing on it changes without a page load. The two things the browser
// does are the podium's rise (CSS) and the count that runs up on the reader's
// own card; the one exception is the Dolazim pair on the projection card, which
// is the same client island Moreška uses and the same single write.
//
// **One season is two lists** (#568, Q36): Moreška, which is every kind of
// evening except the Experience, and Experience on its own. Ranking both in one
// column told a dancer with twelve Redovne that they were behind somebody with
// fifteen Experiences, which is not a comparison anybody in the society makes.
//
// #614 is what a phone showed, and it is mostly about TIME:
//
//   - **The screen was an archive.** Every number looked backwards, and the one
//     sentence that looked forward was set as a grey caption under the podium.
//     It is now the first card, with the reader's own place in it (Q1).
//   - **The season had no clock.** One line under each heading says how many
//     evenings are left, because a rank with no deadline is a verdict (Q3).
//   - **Nothing said what tonight is worth.** The app knows what is coming and
//     whether the reader has answered, so it says what one evening would change
//     and puts Dolazim beside it (Q4). No other scoreboard can do this, because
//     no other scoreboard knows what its reader is about to be asked to do.
//   - **The list had no shape.** 21, 20, 19, 18, 17, 17, 17 is the tightest race
//     a season can have and it read exactly like 21, 12, 8, 4. A bar behind each
//     row, drawn from the count that is already printed at the end of it (Q2).
//   - **A list too small to rank was ranked anyway.** Two Experiences bought a
//     third place and the same gold mark twenty-one moreške buys, which is how
//     a reward gets devalued. Under the floor the list is counted, not placed.
//
// **The three steps wear the society's own blades** (#607, redrawn #611 and
// #614). The mark carries the RANK, which is what makes a tie legible without a
// sentence about ties: equal counts share a rank and the next one skips, so two
// dancers on 21 both wear gold and no silver is drawn at all — and since #614
// the steps themselves stand level in that case, because a staircase under two
// equal firsts asserts an order the ranking denies.
//
// No crown on the winner, though every reference app puts one there: in this
// app a crown means a *titula*, a titula belongs to one evening's lineup and
// never to a person (CONTEXT.md → *Title*), and a crown on the season's leader
// would say something the lineups do not contain.
//
// The rows under the podium carry no mark. There the metal is on the RANK
// NUMERAL and as a hairline around the disc, so the top three keep the initials
// that say who they are: swapping a mark in for the disc took the identity away
// from exactly the three people a reader is most likely to be looking for.
//
// What is deliberately NOT here, and has not been since #457: any treatment of
// the bottom of the list. No red, no "zadnji", no "fali ti još". A dancer with
// two evenings is on the same list as one with twenty because they are in the
// same society, and a board that shames the bottom is a board people stop
// opening. The rank movement and the rival line obey the same rule from the
// other side: both are on the reader's own card and nobody else's, because a
// nudge on somebody else's row is a comment on their effort.

const S = APP_STRINGS.board

/** What the next nastup would be worth to the reader (#614, Q4). */
export interface BoardProjection {
  performanceId: string
  memberId: string
  /** The weekday as it reads after "u": "srijedu". */
  day: string
  /**
   * The place that one evening would reach, or null for a reader who has not
   * danced one yet: they are not climbing to a place, they are entering.
   */
  place: number | null
  answer: AttendanceStatus | null
  /** Whether the answer route would still take an answer from them. */
  canAnswer: boolean
}

export interface BoardList {
  kind: LeaderboardKind
  label: string
  view: BoardView
  /** Where the reader stands on THIS list; null when they have no row on it. */
  standing: MyStanding | null
  /** Confirmed evenings of this list's kinds, for the empty case. */
  confirmed: number
  /** Evenings of this list's kinds still to come, for the clock (#614, Q3). */
  remaining: number
  /**
   * Whether this list is big enough to be ranked at all (#614). An unranked
   * list draws no podium and no places: a leader line, and a plain count.
   */
  ranked: boolean
  /** Who leads an unranked list, and on how many. */
  leaders: Leaders | null
  /**
   * How far the reader moved on the last confirmed evening, or null when there
   * is nothing to say. Only the Moreška list carries one: "nakon zadnje
   * moreške" is the sentence, and an Experience is not one.
   */
  movement?: number | null
  /** Who the reader went past on that evening, or who went past them. */
  rival?: RivalNews | null
  /** What the next evening of this kind would change. Moreška only. */
  projection?: BoardProjection | null
}

/**
 * What the next evening would be worth, with Dolazim beside it (#614, Q4).
 *
 * The write is Moreška's own `Answer`, unchanged: one component, one route, so
 * an answer given here is the same answer given there and the army is still
 * decided on the server. Only rendered when that evening would actually move
 * the reader up — an invitation to dance for no change is not an invitation.
 */
function NextUp({ projection }: { projection: BoardProjection }) {
  const coming = projection.answer === 'coming'
  const { day, place } = projection
  const line =
    place === null
      ? coming
        ? S.next.firstComing(day)
        : S.next.first(day)
      : coming
        ? S.next.coming(day, place)
        : S.next.ask(day, place)
  return (
    <Card className="app__lb-next">
      <p className="app__lb-next-line">{line}</p>
      <Answer
        performanceId={projection.performanceId}
        memberId={projection.memberId}
        current={projection.answer}
        disabled={!projection.canAnswer}
        small
      />
    </Card>
  )
}

/** The leader line of a list too small to rank (#614, finding 02). */
function LeaderLine({ leaders }: { leaders: Leaders }) {
  const shown = leaders.nicknames.slice(0, 3)
  const names = S.leadersAnd(shown, Math.max(0, leaders.nicknames.length - shown.length))
  return (
    <p className="app__lb-leaders">
      <b>{S.leadersLine(names, leaders.count, leaders.nicknames.length > 1)}</b>
      <span>{S.unranked}</span>
    </p>
  )
}

/**
 * Kralj sezone (#614, Q8): how many times each titula was given, and to whom.
 *
 * A season's COUNTER, exactly as a rank is — never a crown on a profile. The
 * numbers are the ones the title chips on the full list already show, said once
 * at the foot of the board instead of only behind a filter.
 */
/** The disc for one titula: the army in colour, the crown as the glyph. */
function TitleMark({ role }: { role: SeasonKing['role'] }) {
  const spec = MARK_OF_ROLE[role]
  return <RoleMark army={spec.army} role={spec.role} />
}

function Kings({ kings, season }: { kings: SeasonKing[]; season: number }) {
  return (
    <section className="app__lb-group">
      <Section title={S.kings.title} note={S.kings.note} />
      <List>
        {kings.map((king) => (
          <ListRow
            key={king.role}
            href={`/app/leaderboard/full?season=${season}&kind=moreska&role=${king.role}`}
            // The TITLE's own disc, not the podium's gold blades (#614): three
            // rows wearing the winner's mark would spend it three more times
            // on the same screen, which is the reward inflation this ticket is
            // partly about. The disc is the one the chips and the tallies draw
            // for that role, so a reader recognises it from the full list.
            lead={<TitleMark role={king.role} />}
            title={ROLE_LABELS[king.role]}
            meta={S.kings.line(king.nicknames.join(' i '), king.count)}
            trail={<ChevronRight size={18} strokeWidth={2} aria-hidden="true" className="app__lb-chev" />}
          />
        ))}
      </List>
    </section>
  )
}

function OneList({ list, season }: { list: BoardList; season: number }) {
  const { view } = list
  const empty = view.podium.length === 0 || list.confirmed === 0
  // A reader whose own row is on the list but at zero: no rank, and the card is
  // replaced by the plain fact (#614, finding 03).
  const notStarted = !empty && view.me != null && list.standing === null

  return (
    <section className="app__lb-list">
      {/* The season's clock is the heading's own caption (Q3, #627), so it
          rides in `note` rather than as a block the group would space out. */}
      <Section
        title={list.label}
        aside={empty ? undefined : pluralize(view.total, S.onList)}
        note={
          list.remaining > 0
            ? S.remaining(pluralize(list.remaining, S.remainingCount[list.kind]))
            : S.remainingNone
        }
      />

      {empty ? (
        <p className="app__empty">
          {list.kind === 'experience' ? S.emptyExperience : S.empty}
        </p>
      ) : (
        <>
          {list.ranked ? (
            <Podium
              large
              framed
              entries={view.podium.map((row) => ({
                id: row.memberId,
                label: row.nickname,
                value: <CountUp value={row.performances} />,
                href: `/app/leaderboard/${row.memberId}?season=${season}`,
                // The RANK, not the position: two dancers who share first both
                // get gold blades and level steps (#614, finding 01). A step
                // always has one — an unranked list draws no podium at all.
                place: row.rank ?? undefined,
                cup: <Trophy place={row.rank ?? 0} className="ui-podium__cup" />,
                mark: (
                  <RoleMark army={row.army} title={row.title} initials={row.initials} small />
                ),
                // The niz belongs on the podium too (#633). It was already on
                // every row of the list below and on nobody's step, so the
                // three dancers a reader looks at FIRST were the three the
                // screen said nothing about. Same rule as a row: three or
                // more, and only while it is still running.
                badge: (() => {
                  const niz = flameNiz(row.niz)
                  return niz === null ? undefined : <Flame count={niz} />
                })(),
                // The place stays, in words, under the step. The audit asked
                // for it to go as a repetition of the cup and the position —
                // and it would be, on a podium whose steps are 1, 2, 3. On
                // this board a tie is ordinary (the season's own top is three
                // dancers on 17), and there the metal is the only thing left
                // saying which place a step is: two golds and a bronze, with
                // no silver drawn at all. The word is what makes that legible
                // without asking anybody to know the convention.
                caption: (
                  <span className="app__lb-podium-place" data-place={row.rank ?? undefined}>
                    {S.place(row.rank ?? 0)}
                  </span>
                ),
                me: row.me,
              }))}
            />
          ) : (
            list.leaders && <LeaderLine leaders={list.leaders} />
          )}

          {list.standing && (
            <StandingCard
              standing={list.standing}
              movement={list.movement}
              rival={list.rival}
            />
          )}
          {notStarted && <p className="app__lb-standing">{S.mine.none[list.kind]}</p>}

          {list.projection && <NextUp projection={list.projection} />}

          {view.rows.length > 0 && (
            <List>
              {view.rows.map((row) => (
                <BoardRow
                  key={row.memberId}
                  row={row}
                  season={season}
                  ranked={list.ranked}
                  animateMine
                />
              ))}
            </List>
          )}

          {/* The reader's own place is never behind a "vidi cijeli popis": a
              dancer who is 34th opened this screen to see 34. */}
          {view.pinned && (
            <List className="app__lb-pinned">
              <BoardRow
                row={view.pinned}
                season={season}
                ranked={list.ranked}
                animateMine
                pinned
              />
            </List>
          )}

          {/* A button rather than a line of blue text (#614, finding 14): it
              was the only way off this screen and it looked like a caption. */}
          <Link
            className="ui-btn ui-btn--ghost app__lb-all"
            href={`/app/leaderboard/full?season=${season}&kind=${list.kind}`}
          >
            {S.seeAll}
            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
          </Link>
        </>
      )}
    </section>
  )
}

export function Board({
  lists,
  season,
  kings = [],
}: {
  lists: BoardList[]
  season: number
  /** Q8, from the Moreška list's titles. Empty in a season with no postava. */
  kings?: SeasonKing[]
}) {
  return (
    <div className="app__lb">
      {lists.map((list) => (
        <OneList key={list.kind} list={list} season={season} />
      ))}

      {kings.length > 0 && <Kings kings={kings} season={season} />}

      {/* What the flame means, said once under the board rather than on twenty
          rows (#628), and only where one can actually be seen: the Moreška
          list, podium included since #633. The Experience list has no niz,
          because an Experience is not a link in the chain. */}
      {lists.some(
        (list) =>
          list.kind === 'moreska' &&
          [
            ...list.view.podium,
            ...list.view.rows,
            ...(list.view.pinned ? [list.view.pinned] : []),
          ].some((row) => flameNiz(row.niz) !== null),
      ) && <p className="app__lb-footer">{APP_STRINGS.profile.nizLegend}</p>}

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
