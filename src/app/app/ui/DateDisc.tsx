// The date of one evening, as a disc (#562).
//
// Gold is Redovna, the evening the society exists for and the only kind that
// sells tickets to the public; everything else is a sunk disc. A season read
// down the list is then a column of gold dots with the other work between
// them, which is what a voditelj is actually looking for.
//
// Both strings arrive formatted: the day of the month and the three-letter
// weekday, in Europe/Zagreb, from the loader. A component never reads a clock.

export interface DateDiscProps {
  /** "14" */
  day: string | number
  /** "pon" */
  weekday?: string
  /** True for a Redovna evening. */
  gold?: boolean
  className?: string
}

export function DateDisc({ day, weekday, gold = false, className }: DateDiscProps) {
  const classes = ['ui-date', gold ? 'ui-date--gold' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes}>
      <b>{day}</b>
      {weekday && <span>{weekday}</span>}
    </div>
  )
}
