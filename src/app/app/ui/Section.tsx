// The line that divides a screen into parts (#562).
//
// "RUJAN" on the left, "5 izvedbi" on the right, and a list under it. This is
// the ONE place the uppercase micro-label survives (Q25): as a heading it says
// "a new group starts here", which is exactly what it is for. On a button or a
// chip it said nothing and made the whole app read as a printed programme.

export interface SectionProps {
  /** The uppercase heading. */
  title: React.ReactNode
  /** The quiet count on the right. */
  aside?: React.ReactNode
  className?: string
}

export function Section({ title, aside, className }: SectionProps) {
  return (
    <div className={['ui-section', className ?? ''].filter(Boolean).join(' ')}>
      <h3>{title}</h3>
      {aside != null && <span className="ui-small">{aside}</span>}
    </div>
  )
}
