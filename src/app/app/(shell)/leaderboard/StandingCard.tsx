import { APP_STRINGS } from '@/lib/app/strings'
import { pluralize } from '@/lib/app/roster-loaders'
import type { MyStanding, RivalNews } from '@/lib/app/leaderboard-rank'
import { Card, CountUp } from '../../ui'

// The reader's own standing, as a card (#614, Q1).
//
// It replaces a sentence. Until now the board printed "Ti si 13. s 13 nastupa.
// Još 1 nastup do 11. mjesta." in small muted text wedged between the podium
// and the list — the most valuable information on the screen, set as a
// footnote. Every number on this card is one the screen already had; what
// changed is that the screen addresses the reader instead of reporting on
// everybody.
//
// **Shared by the board and by Moja sezona**, which is how the two can never
// disagree about where the reader stands. It is never drawn on somebody else's
// profile: the movement arrow and the rival line are a message TO a person, and
// on a third party's screen they would be a comment on their effort — the same
// rule that keeps the bottom of Ljestvica unmarked.

const S = APP_STRINGS.board

/** "▲2" — the direction as a glyph, the distance as a number. */
function Movement({ places }: { places: number }) {
  return (
    <span className="app__lb-move" data-dir={places > 0 ? 'up' : 'down'}>
      <b aria-hidden="true">{S.movement(places)}</b>
      <span className="app__sr-only">{S.movementLabel(places)}</span>
      {/* The arrow on its own is ambiguous — two places since when. The words
          stay, stacked under it, where they cost a line of 11px type rather
          than the width of the card. */}
      <i aria-hidden="true">{S.movementSince}</i>
    </span>
  )
}

export function StandingCard({
  standing,
  movement,
  rival,
  /** Count the rank up on first paint, as the board's own numbers do. */
  animate = true,
}: {
  standing: MyStanding
  movement?: number | null
  rival?: RivalNews | null
  animate?: boolean
}) {
  const counted = (n: number) => pluralize(n, APP_STRINGS.moreska.count)
  // The track fills towards the next place. At the top it is full, which reads
  // as "there is nothing above this" rather than as a bar that failed to load.
  const goal =
    standing.toNextPlace === null
      ? standing.performances
      : standing.performances + standing.toNextPlace
  const filled = goal > 0 ? Math.min(1, standing.performances / goal) : 1

  return (
    <Card className="app__lb-you">
      <div className="app__lb-you-top">
        <span className="app__lb-you-rank">
          {animate ? <CountUp value={standing.rank} /> : standing.rank}
          <sup>.</sup>
        </span>
        <span className="app__lb-you-txt">
          <b>{pluralize(standing.performances, APP_STRINGS.moreska.count)}</b>
          {/* Q6: the same rank, said the way a person hears it. Beside the
              number and never instead of it — the rank is what gets talked
              about at a rehearsal. */}
          <span>
            {standing.betterThan === null ? S.mine.leading : S.mine.betterThan(standing.betterThan)}
          </span>
        </span>
        {/* Null when the reader did not move: a zero is not news, and printing
            it every week turns the one piece of news on the screen into
            furniture. */}
        {movement != null && <Movement places={movement} />}
      </div>

      <div className="app__lb-you-track" aria-hidden="true">
        <i style={{ width: `${Math.round(filled * 100)}%` }} />
      </div>

      <p className="app__lb-you-goal">
        {standing.toNextPlace === null || standing.nextPlace === null ? (
          <b>{S.leading}</b>
        ) : (
          <>
            {/* The place NAMED is the one those evenings actually reach: a tie
                shares a rank, so from third behind two dancers at the top the
                line says "do 1. mjesta", never "do 2." (#457 review). */}
            <b>{S.mine.toNext(counted(standing.toNextPlace), standing.nextPlace)}</b>
            {standing.ahead && (
              <span>
                {' · '}
                {S.mine.ahead(standing.ahead.nickname, standing.ahead.performances)}
              </span>
            )}
          </>
        )}
      </p>

      {rival && (
        <p className="app__lb-you-rival">
          {rival.kind === 'passed'
            ? S.rival.passed(rival.nickname)
            : S.rival.overtaken(rival.nickname)}
        </p>
      )}
    </Card>
  )
}
