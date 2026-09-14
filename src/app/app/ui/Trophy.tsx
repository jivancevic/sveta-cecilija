// The place a row finished in (#607, redrawn in #611, re-DRAWN again in #614).
//
// Three tones and nothing else: gold, silver, bronze. Anything below third gets
// no mark at all, because a trophy for everybody is a bullet point.
//
// **It is the society's own blades, not a sports cup** (#614, Q9). The shape
// until now was the generic trophy every fitness app puts at the top of a
// leaderboard — a 143-year-old sword dance had a stock gym icon on its podium,
// while the tab bar two centimetres below it was already wearing the crossed
// swords that ARE this society's mark. Same geometry as `Swords`, in the metal
// of the place: one drawing, three colours, and a top three that could not
// belong to any other app.
//
// The place itself is NOT drawn inside it. It sits beside it, in the metal, in
// the serif the rest of this app sets numbers in: at 26px on a phone a numeral
// inside a silhouette is unreadable, and the podium's step and the list's rank
// column both already print the number.

import { SWORDS_PATHS } from './ScreenIcon'

export interface TrophyProps {
  /** The rank these blades stand for. Nothing is drawn above 3. */
  place: number
  /** 20px instead of 26px, for a mark that stands in a list row. */
  small?: boolean
  className?: string
}

export function Trophy({ place, small = false, className }: TrophyProps) {
  if (!Number.isInteger(place) || place < 1 || place > 3) return null

  const classes = ['ui-trophy', `ui-trophy--${place}`, small ? 'ui-trophy--sm' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} role="img" aria-label={`${place}. mjesto`}>
      {/* Stroked, exactly as the tab bar draws it, so the two read as one mark
          in two places rather than as two drawings of a sword. The width is a
          touch heavier than the nav's, because here it is 26px and alone. */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {SWORDS_PATHS.blades.map((d) => (
          <path key={d} d={d} />
        ))}
        {SWORDS_PATHS.hilts.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  )
}
