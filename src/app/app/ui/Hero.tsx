import Link from 'next/link'
import { Card } from './Card'

// The one card a screen is opened FOR (#562).
//
// On Početna and on Izvedbe that is the next evening, and the day of the month
// is the biggest thing this app ever draws: 80px of Labrada, readable at arm's
// length in a dark rehearsal room. There is never a second hero on a screen;
// if a screen wants two, it is two screens.
//
// `day` and `month` are handed in already formatted. A date is formatted in
// Europe/Zagreb by the loader, never by a component, or a phone in another
// timezone shows the wrong evening.

export interface HeroProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: React.ReactNode
  /** "14" — the day of the month, on its own. */
  day?: React.ReactNode
  /** "rujna" — the month in the genitive, beside it. */
  month?: React.ReactNode
  /** "Sutra · 21:00 · Redovna" */
  meta?: React.ReactNode
  /**
   * Where the CARD leads, when the card as a whole is a way somewhere (#620).
   *
   * Josip's sentence: any tap on the next-nastup widget opens the Moreška tab,
   * except the two answer buttons and the bar, which already do something. So
   * it is a cover link stretched over the card rather than a `<Link>` wrapped
   * around it: everything inside stays exactly the control it was, and the
   * three things that ARE controls sit above the cover in `ui.css`. A wrapping
   * anchor would put a button inside a link, which is invalid and which no
   * phone gets right.
   */
  href?: string
  /** What the cover link announces, since it has no text of its own. */
  hrefLabel?: string
}

export function Hero({
  eyebrow,
  day,
  month,
  meta,
  href,
  hrefLabel,
  className,
  children,
  ...rest
}: HeroProps) {
  return (
    <Card
      eyebrow={eyebrow}
      className={['ui-card--hero', className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      {href && (
        <Link className="ui-hero__cover" href={href} aria-label={hrefLabel}>
          <span className="app__sr-only">{hrefLabel}</span>
        </Link>
      )}
      {day != null && (
        <div className="ui-hero__day">
          <b>{day}</b>
          {month != null && <span>{month}</span>}
        </div>
      )}
      {meta != null && <div className="ui-hero__meta">{meta}</div>}
      {children}
    </Card>
  )
}
