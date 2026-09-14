// The date of one evening, as a disc (#562).
//
// Gold is Redovna, the evening the society exists for and the only kind that
// sells tickets to the public; copper is the Moreška Experience, which is a
// form of its own (#591); everything else is a sunk disc. A season read down
// the list is then a column of gold dots with the other work between them,
// which is what a voditelj is actually looking for.
//
// The tone is a CATEGORY and never a colour: it arrives from
// `src/lib/app/performance-kind.ts`, which knows the three kinds a dancer reads
// and no hex value at all. `gold` stays as the boolean spelling of
// `tone="regular"` for the callers that only ever had two answers.
//
// Both strings arrive formatted: the day of the month and the three-letter
// weekday, in Europe/Zagreb, from the loader. A component never reads a clock.

/** The three categories a disc can wear, `KindTone` restated for the skin. */
export type DateDiscTone = 'regular' | 'extra' | 'experience'

const TONE_CLASS: Record<DateDiscTone, string> = {
  regular: 'ui-date--gold',
  extra: '',
  experience: 'ui-date--experience',
}

export interface DateDiscProps {
  /** "14" */
  day: string | number
  /** "pon" */
  weekday?: string
  /** Which of the three categories the evening is (#591). Wins over `gold`. */
  tone?: DateDiscTone
  /** True for a Redovna evening: the two-answer spelling of `tone`. */
  gold?: boolean
  className?: string
}

export function DateDisc({ day, weekday, tone, gold = false, className }: DateDiscProps) {
  const resolved: DateDiscTone = tone ?? (gold ? 'regular' : 'extra')
  const classes = ['ui-date', TONE_CLASS[resolved], className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes}>
      <b>{day}</b>
      {weekday && <span>{weekday}</span>}
    </div>
  )
}
