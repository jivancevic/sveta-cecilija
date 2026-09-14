import { APP_STRINGS } from '@/lib/app/strings'
import type { RankRow } from '@/lib/app/leaderboard-rank'
import { Chip, CountUp, ListRow, RoleMark } from '../../ui'

// One dancer's row, on either of the two screens that list them (#614).
//
// Ljestvica and the full list drew the same row twice, and by the time #614 had
// added a race bar, a nullable rank and a "this list is not ranked" state, each
// of those decisions existed in two places and two of them were already spelled
// differently. A row is one object with one set of rules; the two screens
// differ in what they hang off it, which is what `meta` and `children` are for.
//
// **The bar behind the row is the count, given a length** (Q2). No new data:
// `--share` is this dancer's count against the leader's, which is already
// printed at the end of the row. 21, 20, 19, 18, 17, 17, 17 is the tightest
// race a season can have and as a column of digits it read exactly like
// 21, 12, 8, 4.
//
// **A rank of null is not a rank.** A dancer who has danced nothing shares that
// non-place with everybody else who has not started, and a list too small to be
// ranked has no places at all (#614). The column still holds its width in both
// cases, because that is what keeps every mark on the screen in one line.

const S = APP_STRINGS.board

export function BoardRow({
  row,
  season,
  ranked,
  pinned = false,
  animateMine = false,
  meta,
  className,
}: {
  row: RankRow
  season: number
  /** A list under the ranking floor prints counts and no places. */
  ranked: boolean
  /** The reader's own row, pinned under a list that cut them off. */
  pinned?: boolean
  /** Run the reader's own count up on first paint. Ljestvica only. */
  animateMine?: boolean
  /** The second line: the full list's role breakdown. */
  meta?: React.ReactNode
  className?: string
}) {
  const place = ranked && row.rank !== null ? row.rank : null
  return (
    <ListRow
      // Every row opens that dancer's season (#608). The screen stopped being a
      // dead end here: seventy nicknames, each now a way in.
      href={`/app/leaderboard/${row.memberId}?season=${season}`}
      className={['app__lb-race', row.me ? 'app__lb-row--me' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      style={{ '--share': row.share } as React.CSSProperties}
      lead={
        <span
          className="app__lb-lead"
          data-place={place !== null && place <= 3 ? place : undefined}
        >
          {/* The pinned row carries its place in its TITLE ("ti · 24."), so the
              column is left empty rather than printing 24 twice. */}
          <i className="app__lb-rank">{pinned || place === null ? '' : S.rank(place)}</i>
          <RoleMark army={row.army} title={row.title} initials={row.initials} small />
        </span>
      }
      title={pinned && place !== null ? S.pinned(place) : row.nickname}
      meta={meta}
      trail={
        <b className="app__lb-count">
          {row.me && animateMine ? <CountUp value={row.performances} /> : row.performances}
        </b>
      }
    >
      {/* The pinned row says "ti" in its own title — unless it has no place to
          put there, and then the chip is the only thing marking it. */}
      {row.me && !(pinned && place !== null) && <Chip tone="gold">{S.you}</Chip>}
    </ListRow>
  )
}
