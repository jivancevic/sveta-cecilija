import Link from 'next/link'

// The top three of Ljestvica, as three steps (#562, grown up in #568).
//
// Second, first, third, left to right, the way a podium actually stands, with
// the winner's step in gold. It rises when it appears, which is the one piece
// of celebration this app allows itself, and it says nothing about the reader's
// own place: that line goes under it, in the tile's caption.
//
// Two sizes, one shape. The small one is the glance on Početna, inside a tile
// half a phone wide. The `large` one is the head of the Ljestvica screen: the
// same three steps, tall enough to carry a `RoleMark` and a caption, because
// there the podium IS the screen's first sentence rather than a preview of it.
//
// **`large` is a SIZE and not a feature list** (#612). It gates the mark and
// the caption, which are text that does not fit in a tile; it does NOT gate the
// cup, which is 26px of drawing and is the whole reason a reader knows the
// middle step is first place rather than merely tallest. A caller opts into a
// cup by passing one, at either size, and Ljestvica's own podium is untouched
// by that because it was already passing three.

export interface PodiumEntry {
  /**
   * Where this step leads (#608). A podium that cannot be tapped was the
   * biggest hole in Ljestvica: the three people the screen is loudest about
   * were the three you could learn least about.
   */
  href?: string
  /** A nickname: "Brko". */
  label: string
  /** The count that put them there; a node, so a screen can count it up. */
  value: React.ReactNode
  /**
   * A distinct key. Two moreškanti can share a nickname and `label` alone
   * would then collide; the screens pass the member id.
   */
  id?: string
  /** The 28px mark above the name on the large podium (a `RoleMark`). */
  mark?: React.ReactNode
  /**
   * The cup above the mark (a `Trophy`), #607, at either size since #612.
   *
   * Its own slot rather than part of `mark`, because the two say different
   * things — the cup is the PLACE and the mark is the PERSON — and a caller
   * that had to stack them itself would decide the order three times over.
   */
  cup?: React.ReactNode
  /** The line under the name: "1. mjesto". Large podium only. */
  caption?: React.ReactNode
  /** The reader's own step, marked the way their row in the list is. */
  me?: boolean
}

export interface PodiumProps {
  /** In finishing order: first, second, third. Fewer than three is fine. */
  entries: PodiumEntry[]
  /** The head of a screen rather than the glance inside a tile. */
  large?: boolean
  className?: string
}

/** Second on the left, first in the middle, third on the right. */
const PLACES = [1, 0, 2] as const

export function Podium({ entries, large = false, className }: PodiumProps) {
  const classes = ['ui-podium', large ? 'ui-podium--lg' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {PLACES.map((index) => {
        const entry = entries[index]
        if (!entry) return null
        const step = [
          'ui-podium__step',
          `ui-podium__step--${index + 1}`,
          entry.me ? 'ui-podium__step--me' : '',
        ]
          .filter(Boolean)
          .join(' ')
        const body = (
          <>
            {entry.cup}
            {large && entry.mark}
            <b>{entry.value}</b>
            <span className="ui-podium__name">{entry.label}</span>
            {large && entry.caption != null && (
              <small className="ui-podium__place">{entry.caption}</small>
            )}
          </>
        )
        return entry.href ? (
          <Link key={entry.id ?? entry.label} href={entry.href} className={step}>
            {body}
          </Link>
        ) : (
          <div key={entry.id ?? entry.label} className={step}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
