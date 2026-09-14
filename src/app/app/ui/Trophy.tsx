// The place a row finished in, as a cup (#607).
//
// Three tones and nothing else: gold, silver, bronze. Anything below third gets
// no trophy, because a trophy for everybody is a bullet point.
//
// **The digit inside the bowl is not decoration.** Ljestvica is read on a phone
// at night, where gold and bronze are two warm circles of nearly the same
// value; the numeral is what tells them apart, and it is also what makes a tie
// legible — ranks share and skip, so two dancers on the same count both wear a
// gold cup with a 1 in it and no silver is drawn at all. A reader seeing two
// golds and then a bronze has read the tie correctly without being told about
// it.
//
// Drawn here rather than taken from Lucide for the same reason `RoleMark`'s
// crowns are: no icon set ships a cup with a number in its bowl, and the number
// is the point.

export interface TrophyProps {
  /** The rank this cup stands for. Nothing is drawn above 3. */
  place: number
  /** 26px instead of 34px, for a cup that stands in a list row. */
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
      <svg viewBox="0 0 32 32" aria-hidden="true">
        {/* The bowl, then the two handles, then stem and base. Every shape
            takes its fill from a token so the night skin moves all three tones
            together. */}
        <path className="ui-trophy__bowl" d="M9 5h14v7a7 7 0 0 1-14 0z" />
        <path className="ui-trophy__handle" d="M9 7H6.4a3.6 3.6 0 0 0 3.6 6.2" />
        <path className="ui-trophy__handle" d="M23 7h2.6a3.6 3.6 0 0 1-3.6 6.2" />
        <path className="ui-trophy__stem" d="M14.4 19h3.2v4h-3.2z" />
        <rect className="ui-trophy__base" x="10.2" y="23" width="11.6" height="3.2" rx="1.3" />
        {/* Labrada, because a place is a number and numbers are the serif's
            job everywhere else on this screen. */}
        <text className="ui-trophy__place" x="16" y="13.4" textAnchor="middle">
          {place}
        </text>
      </svg>
    </span>
  )
}
