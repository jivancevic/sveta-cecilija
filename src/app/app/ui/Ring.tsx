// A number and how far along it is, in one 72px disc (#562).
//
// "212 karata za sutra, od 350" is two facts, and the ring is the second one:
// the arc says "about two thirds" before the eye has read the digits. Used for
// a house filling up and for a door letting people in, never for money, which
// is a figure and not a proportion.

export interface RingProps {
  value: number
  max: number
  /** What sits in the hole. Defaults to the value itself. */
  label?: React.ReactNode
  className?: string
}

export function Ring({ value, max, label, className }: RingProps) {
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  return (
    <div
      className={['ui-ring', className ?? ''].filter(Boolean).join(' ')}
      style={{ ['--deg' as string]: `${Math.round(share * 360)}deg` }}
    >
      <i className="ui-ring__hole">{label ?? value}</i>
    </div>
  )
}
