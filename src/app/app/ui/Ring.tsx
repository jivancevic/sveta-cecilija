// A number and how far along it is, in one disc (#562).
//
// "212 karata za sutra, od 350" is two facts, and the ring is the second one:
// the arc says "about two thirds" before the eye has read the digits. Used for
// a house filling up and for a door letting people in, never for money, which
// is a figure and not a proportion.
//
// **Two sizes** (#572). 72px is a figure inside a card next to other figures.
// `lg` is the whole point of the screen it is on: Skener's "ušlo X od Y" is
// read at arm's length, in the dark, by somebody holding a phone in one hand
// and a stranger's ticket in the other. The size is a prop rather than a
// screen-side override, which is the rule the shapes folder exists for.

export interface RingProps {
  value: number
  max: number
  /** What sits in the hole. Defaults to the value itself. */
  label?: React.ReactNode
  /**
   * `md` (the default) is a figure in a card; `lg` is a screen's subject.
   *
   * `card` is #611's: a ring that IS a card's content, on a screen that shows
   * two of them side by side. It sizes to its container rather than to the
   * viewport — `lg` is `68vw`, which inside a half-width card overflowed the
   * card and clipped its own arc — and draws a THIN stroke, because at 130px a
   * 22px band reads as a doughnut and the number inside it stops being the
   * subject.
   */
  size?: 'md' | 'lg' | 'card'
  className?: string
}

export function Ring({ value, max, label, size = 'md', className }: RingProps) {
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  return (
    <div
      className={['ui-ring', size === 'md' ? '' : `ui-ring--${size}`, className ?? '']
        .filter(Boolean)
        .join(' ')}
      style={{ ['--deg' as string]: `${Math.round(share * 360)}deg` }}
    >
      <i className="ui-ring__hole">{label ?? value}</i>
    </div>
  )
}
