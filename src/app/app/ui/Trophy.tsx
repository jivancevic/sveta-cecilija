// The place a row finished in, as a cup (#607, redrawn in #611).
//
// Three tones and nothing else: gold, silver, bronze. Anything below third gets
// no trophy, because a trophy for everybody is a bullet point.
//
// **A flat silhouette, not a drawing of a cup.** The first version outlined the
// bowl, stroked two handles and set the place inside the bowl; at 34px on a
// phone that is four competing details in a circle the size of a fingernail,
// and it read as clip art dropped into an otherwise quiet screen. Every
// scoreboard that gets this right — Strava's segment medals, Life Reset's rank
// column — draws one flat shape in one colour and lets the surrounding numeral
// carry the number.
//
// So the place is NOT inside the cup any more. It sits beside it, in the metal,
// in the serif the rest of this app sets numbers in: the podium's caption and
// the list's rank column both already print it, and tinting those is what makes
// gold, silver and bronze tell each other apart at a glance.

export interface TrophyProps {
  /** The rank this cup stands for. Nothing is drawn above 3. */
  place: number
  /** 20px instead of 26px, for a cup that stands in a list row. */
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
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {/* One path, one fill. The handles are part of the silhouette rather
            than two stroked arcs beside it, which is what keeps the shape
            readable when it is 20px wide. */}
        <path d="M7 3h10v1.5h3.2a1 1 0 0 1 1 1c0 2.7-1.9 4.9-4.5 5.4A5.5 5.5 0 0 1 13 13.8V17h3a1 1 0 0 1 1 1v2H7v-2a1 1 0 0 1 1-1h3v-3.2a5.5 5.5 0 0 1-3.7-2.9C4.7 10.4 2.8 8.2 2.8 5.5a1 1 0 0 1 1-1H7zm0 3H5.1c.3 1.3 1.1 2.3 2.2 2.8A7 7 0 0 1 7 8zm10 0v2c0 .3 0 .6-.1.8 1.1-.5 1.9-1.5 2.2-2.8z" />
      </svg>
    </span>
  )
}
