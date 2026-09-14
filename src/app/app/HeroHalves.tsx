import Link from 'next/link'
import type { HeroHalf } from '@/lib/app/moreska-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { Answer } from './moreska/Answer'

// A day with TWO nastupa in it, inside the one hero (#591).
//
// Both screens that draw a hero draw this: Početna and Moreška share
// `heroView()`, so they share the split too and a dancer never finds the
// morning Experience on one screen and not on the other.
//
// The shared half of the card is the DAY — the header and the big date, drawn
// by `Hero` above this — and everything under it is per evening: its own time,
// its own category, its own answer. The answer pair is the whole reason the
// split exists: a dancer may be in one of the two and not in the other, and an
// evening you cannot answer for from the screen you are looking at is an
// evening you answer for late.
//
// No ArmyBar in a half, by decision: the bar is a statement about ONE evening's
// two lines, and two bars under one date is a chart rather than an answer. The
// headcount is still here, as the one quiet line "crni 7 · bili 5", and the
// whole evening is one tap away at Stanje.
//
// Markup and CSS are a first pass (#591 is the logic half); #592 dresses it.

export function HeroHalves({
  halves,
  moreLabel,
  memberId,
}: {
  halves: HeroHalf[]
  /** "još 1 nastup taj dan ›" when the day holds more than these two. */
  moreLabel: string | null
  /** Null for a voditelj who does not dance: they read the day, they answer nothing. */
  memberId: string | null
}) {
  return (
    <>
      <div className="app__hero-halves">
        {halves.map((half) => (
          <div className="app__hero-half" key={half.id}>
            <Link className="app__hero-half-head" href={half.href}>
              <b>{half.time}</b>
              <span>{[half.title, half.place].filter(Boolean).join(' · ')}</span>
            </Link>

            {memberId && (
              <Answer
                small
                performanceId={half.id}
                memberId={memberId}
                current={half.answer}
                currentArmy={half.army}
                disabled={!half.canAnswer}
                lockNote={half.canAnswer ? null : APP_STRINGS.answer.locked}
              />
            )}

            {half.armiesLine && <p className="app__hero-half-armies">{half.armiesLine}</p>}
          </div>
        ))}
      </div>

      {/* The third evening and beyond. A link into the agenda rather than a
          third half: the hero is the day at a glance, and a glance is two. */}
      {moreLabel && (
        <Link className="app__hero-more" href="/app/moreska">
          {moreLabel}
        </Link>
      )}
    </>
  )
}
