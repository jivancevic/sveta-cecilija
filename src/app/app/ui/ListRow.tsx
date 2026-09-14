import Link from 'next/link'

// One row of a list, and the list around it (#562).
//
// 72px tall, because that is what a thumb hits in a moving bus, and one row
// says exactly three things: the mark on the left (a date disc, a role mark, an
// icon), the two lines in the middle, and one chip on the right. A row that
// wants a fourth thing is a screen.
//
// Like `Tile`, it becomes a `Link`, a `button` or a plain `div` from what it is
// given, so a row that is only a record does not pretend to be tappable.

interface RowBase {
  /** The 44 to 48px mark on the left: a DateDisc, a RoleMark, an icon. */
  lead?: React.ReactNode
  /** The bold first line. */
  title?: React.ReactNode
  /** The muted second line. */
  meta?: React.ReactNode
  /** One chip, or a chevron, on the right. */
  trail?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

// `title` is omitted from both sides on purpose: the DOM's own `title`
// attribute is a string, and a row whose first line is a fragment (a name with
// an order code under it, #570) would otherwise fail to type-check against it.
// The tooltip is no loss — a row this size says what it is on the row.
export type ListRowProps = RowBase &
  (
    | ({ href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'title'>)
    | ({ href?: undefined } & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'title'>)
  )

export function ListRow({ lead, title, meta, trail, className, children, ...rest }: ListRowProps) {
  const classes = ['ui-row', className ?? ''].filter(Boolean).join(' ')
  const inside = (
    <>
      {lead}
      {(title != null || meta != null) && (
        <div className="ui-row__body">
          {title != null && <b>{title}</b>}
          {meta != null && <span>{meta}</span>}
        </div>
      )}
      {children}
      {trail}
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

  return (
    <div className={classes} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
      {inside}
    </div>
  )
}

/** The card the rows sit in: one shadow for the group, hairlines inside it. */
export function List({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['ui-list', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}
