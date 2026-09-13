// A chip: a fact about the row it sits on (#562).
//
// It is never a button and never the way to do something. Three tones and no
// more: plain for a state, gold for something new, warn for a number that is
// short. The dashed chip that used to mean "no answer yet" is gone with every
// other dashed edge (audit pattern 1) — a broken line reads as "nothing here"
// in every UI language, and half this app was wearing it.

export type ChipTone = 'plain' | 'gold' | 'warn'

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
