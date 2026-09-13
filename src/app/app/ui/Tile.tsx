import Link from 'next/link'

// A tile: a card that is also a door (#562).
//
// Two to a row on a phone, each one a glance at a screen you can open. The
// glance is the point — a tile that carries only a label and a chevron is a
// list row wearing a card, and this app has list rows.
//
// It renders a `Link` when it is given an `href` and a `button` otherwise, so
// a tile that opens a sheet and a tile that opens a screen look the same to a
// thumb and different to a keyboard, which is correct.

interface TileBase {
  eyebrow?: React.ReactNode
  /** The line under the figure: what the figure means. */
  caption?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export type TileProps = TileBase &
  (
    | ({ href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>)
    | ({ href?: undefined } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>)
  )

export function Tile({ eyebrow, caption, className, children, ...rest }: TileProps) {
  const classes = ['ui-tile', className ?? ''].filter(Boolean).join(' ')
  const inside = (
    <>
      {eyebrow != null && <div className="ui-card__eyebrow">{eyebrow}</div>}
      {children}
      {caption != null && <div className="ui-small">{caption}</div>}
    </>
  )

  if ('href' in rest && rest.href) {
    const { href, ...link } = rest as { href: string }
    return (
      <Link href={href} className={classes} {...link}>
        {inside}
      </Link>
    )
  }

  const button = rest as React.ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button type="button" className={classes} {...button}>
      {inside}
    </button>
  )
}

/** The two-up grid tiles live in. Nothing else uses it. */
export function Tiles({ children }: { children: React.ReactNode }) {
  return <div className="ui-tiles">{children}</div>
}
