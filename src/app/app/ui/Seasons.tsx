import Link from 'next/link'

// The row of years a screen is read through (#568, lifted here by #571).
//
// Ljestvica drew it first, beside itself, as `.app__lb-season`. Statistika and
// Financije need the same object, and three spellings of one control is exactly
// what the shapes folder exists to prevent — so the pills moved here and the
// leaderboard composes them like everybody else.
//
// **Links, never a select.** A season is a server navigation: the whole screen
// is re-read for the year, the URL carries it, and Back means the previous
// year. A `<select>` bought a client island for the same journey and hid the
// other years behind a tap. The caller builds the href, because a screen knows
// what else its query string has to survive the move (`?part=` on Ljestvica,
// the month on Financije).
//
// A server component: it has no state of its own, and the current year is a
// prop rather than a thing it works out.

export interface SeasonsProps {
  seasons: readonly number[]
  /** The year being read now. */
  season: number
  /** Where a year goes. The caller keeps the rest of the query string. */
  href: (year: number) => string
  /** What the row is, for a screen reader. */
  label: string
  className?: string
}

export function Seasons({ seasons, season, href, label, className }: SeasonsProps) {
  // One season is not a choice (#614, finding 14). A lone gold pill reads as a
  // filter somebody switched on, and tapping it does nothing — so where there
  // is nothing to pick, the year is a caption.
  if (seasons.length <= 1) {
    return <p className={['ui-seasons__one', className ?? ''].filter(Boolean).join(' ')}>{season}</p>
  }

  return (
    <nav className={['ui-seasons', className ?? ''].filter(Boolean).join(' ')} aria-label={label}>
      {seasons.map((year) => {
        const on = year === season
        return (
          <Link
            key={year}
            href={href(year)}
            className={`ui-season${on ? ' ui-season--on' : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            {year}
          </Link>
        )
      })}
    </nav>
  )
}
