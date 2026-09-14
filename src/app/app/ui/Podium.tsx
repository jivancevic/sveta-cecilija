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
//
// **A staircase only where there is an order** (#614). Equal counts share a
// rank on this board — routinely, not exceptionally — and until now the second
// of two dancers who both read "1. mjesto" stood on a lower step. The steps now
// take their height and their metal from the RANK, and the 2-1-3 arrangement is
// used only when the three ranks are actually different; a tie stands level, in
// finishing order.

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
  /**
   * The RANK this step stands for, when it is not simply its position (#614).
   *
   * Ljestvica shares a rank between equal counts and skips the next one, so the
   * top three of a small list are routinely 1, 1, 3 — and the staircase then
   * put two dancers who both read "1. mjesto" on steps of different heights.
   * The geometry asserted an order the caption denied, on the loudest part of
   * the screen. With the rank in hand the podium draws a staircase only when
   * there is an order to draw, and equal ranks get equal steps side by side.
   *
   * Defaults to the position, which is what a caller with no ties has anyway.
   */
  place?: number
}

export interface PodiumProps {
  /** In finishing order: first, second, third. Fewer than three is fine. */
  entries: PodiumEntry[]
  /** The head of a screen rather than the glance inside a tile. */
  large?: boolean
  /**
   * Stand the steps on a sunk ground of their own (#614, finding 07).
   *
   * Until now the podium was three cards on the same paper as everything under
   * it, with the middle one barely raised, and nothing said "this is the
   * ceremonial part of the screen". The ground is the whole trick: it makes the
   * top three a display case rather than three more rows.
   */
  framed?: boolean
  className?: string
}

/** Second on the left, first in the middle, third on the right. */
const PLACES = [1, 0, 2] as const

export function Podium({ entries, large = false, framed = false, className }: PodiumProps) {
  // The rank each step stands for; its position when the caller has no ties to
  // tell it about.
  const ranks = entries.map((entry, index) => entry.place ?? index + 1)
  // A staircase only where there is an order to draw. With 1, 1, 3 the three
  // steps stay in finishing order left to right and the two firsts stand level:
  // swapping them into the 2-1-3 arrangement would put one of two equal dancers
  // on a lower step, which is the fault this exists to fix (#614).
  const staircase = new Set(ranks).size === ranks.length
  // Only where there is NO staircase at all. With 1, 2, 2 the winner still
  // stands above the two seconds — the rise comes off the rank class, so it
  // survives on its own; flattening every step there would have put an outright
  // winner level with the pair behind them (#614 review).
  const level = new Set(ranks).size === 1
  const classes = [
    'ui-podium',
    large ? 'ui-podium--lg' : '',
    framed ? 'ui-podium--framed' : '',
    // Three dancers on the same count: the rise is PADDING above the content,
    // and with nobody standing higher it is a hand's width of empty step over
    // all three of them.
    level ? 'ui-podium--level' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {(staircase ? PLACES : entries.map((_, i) => i)).map((index) => {
        const entry = entries[index]
        if (!entry) return null
        const step = [
          'ui-podium__step',
          `ui-podium__step--${ranks[index]}`,
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
