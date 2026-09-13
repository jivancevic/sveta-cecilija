// A card: the object a screen is made of (#562, audit pattern 4).
//
// Before this, Cecilija drew everything flat on paper and separated it with
// hairlines, which is why nothing on it read as a thing you could touch. A
// card is white, rounded and lifted, and that is the whole of it: it carries no
// layout of its own beyond a column and a gap, because what goes inside is the
// screen's business.

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The small uppercase line above everything else. */
  eyebrow?: React.ReactNode
}

export function Card({ eyebrow, className, children, ...rest }: CardProps) {
  return (
    <div className={['ui-card', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {eyebrow != null && <div className="ui-card__eyebrow">{eyebrow}</div>}
      {children}
    </div>
  )
}
