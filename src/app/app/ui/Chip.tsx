// A chip: a fact about the row it sits on (#562).
//
// It is never a button and never the way to do something. The dashed chip that
// used to mean "no answer yet" is gone with every other dashed edge (audit
// pattern 1) — a broken line reads as "nothing here" in every UI language, and
// half this app was wearing it.
//
// Five tones, and the split down the middle is what keeps them honest:
//
//   FILLED    plain (a state), gold (something new), warn (a number that is short)
//   OUTLINED  outline (a quiet aside), green (a fact that is settled and good)
//
// A filled chip is a STATE the row is in; an outlined one is an aside about the
// row. That is why "za 3 dana" is outlined and "dolaziš" is not: one is the
// reader's own answer, the other is the calendar counting. And it is why POPIS
// is `green` rather than `yes`-filled — a filled green in this app is the
// Dolazim button, and a chip that wears a button's skin is read as one.

export type ChipTone = 'plain' | 'gold' | 'warn' | 'outline' | 'green' | 'red'

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone
}

export function Chip({ tone = 'plain', className, children, ...rest }: ChipProps) {
  const classes = ['ui-chip', tone === 'plain' ? '' : `ui-chip--${tone}`, className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  )
}
