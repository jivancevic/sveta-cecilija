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
  // **The track IS the sentence above it** (#633). It used to fill towards the
  // next PLACE while the line over it talked about a percentile, so two
  // different numbers were stacked on top of each other and Josip asked what
  // the bar meant. It is the percentile now, and the "još 1 nastup do 14.
  // mjesta" line below keeps its own words and gets no bar of its own.
  //
  // `betterThan` is deliberately null rather than 0 for a reader nobody is
  // behind, so the empty track is the whole of what that reader is told. The
  // leader is the other null and fills it.
  const leader = standing.rank === 1
  const filled = standing.betterThan !== null ? standing.betterThan / 100 : leader ? 1 : 0

  return (
    <Card className="app__lb-you">
      <div className="app__lb-you-top">
        <span className="app__lb-you-rank">
          {animate ? <CountUp value={standing.rank} /> : standing.rank}
          {/* An ORDINAL dot, which means it sits on the baseline (#624). It was
              a `<sup>`, which put it up beside the top of the digits where it
              read as a footnote marker or a degree sign rather than as the dot
              in "petnaesti". Croatian writes an ordinal with a full stop after
              the numeral, so the full stop has to look like one. */}
          <i>.</i>
        </span>
        <span className="app__lb-you-txt">
          <b>{pluralize(standing.performances, APP_STRINGS.moreska.count)}</b>
          {/* Q6: the same rank, said the way a person hears it. Beside the
              number and never instead of it — the rank is what gets talked
              about at a rehearsal. */}
          {/* Null and last is not null and first (#633): "vodiš ljestvicu"
              belongs to the dancer at the top, and the one at the bottom, whom
              `betterThan` spares a "bolji si od 0%", is told nothing rather
              than told they are winning. */}
          {standing.betterThan !== null ? (
            <span>{S.mine.betterThan(standing.betterThan)}</span>
          ) : (
            leader && <span>{S.mine.leading}</span>
          )}
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
