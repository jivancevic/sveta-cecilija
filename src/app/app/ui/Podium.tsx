// The top three of Ljestvica, as three steps (#562).
//
// Second, first, third, left to right, the way a podium actually stands, with
// the winner's step in gold. It rises when it appears, which is the one piece
// of celebration this app allows itself, and it says nothing about the reader's
// own place: that line goes under it, in the tile's caption.

export interface PodiumEntry {
  /** A nickname: "Brko". */
  label: string
  /** The count that put them there. */
  value: number | string
}

export interface PodiumProps {
  /** In finishing order: first, second, third. Fewer than three is fine. */
  entries: PodiumEntry[]
  className?: string
}

/** Second on the left, first in the middle, third on the right. */
const PLACES = [1, 0, 2] as const

export function Podium({ entries, className }: PodiumProps) {
  return (
    <div className={['ui-podium', className ?? ''].filter(Boolean).join(' ')}>
      {PLACES.map((index) => {
        const entry = entries[index]
        if (!entry) return null
        return (
          <div key={entry.label} className={`ui-podium__step ui-podium__step--${index + 1}`}>
            <b>{entry.value}</b>
            {entry.label}
          </div>
        )
      })}
    </div>
  )
}
