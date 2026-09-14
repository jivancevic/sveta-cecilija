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
  /**
   * One quiet line UNDER the heading, belonging to it (#627).
   *
   * Two screens wrote this by hand and both had to drag the line back up with
   * a negative margin, because a caption dropped into a group's flow is spaced
   * as though it were a widget of its own. Passing it here says what it is:
   * part of the heading, four pixels under it, whatever the group's gap.
   */
  note?: React.ReactNode
  className?: string
}

export function Section({ title, aside, note, className }: SectionProps) {
  const head = (
    <div className={['ui-section', className ?? ''].filter(Boolean).join(' ')}>
      <h3>{title}</h3>
      {aside != null && <span className="ui-small">{aside}</span>}
    </div>
  )
  if (note == null) return head
  return (
    <div className="ui-section-block">
      {head}
      <p className="ui-section__note">{note}</p>
    </div>
  )
}
