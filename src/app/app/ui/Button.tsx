import { Check } from 'lucide-react'

// The one button of Cecilija (#562, audit pattern 2, Q25).
//
// Five spellings, one shape, and the rule that goes with them: ONE primary per
// screen. If a screen wants two, the screen has two jobs. The audit found five
// unrelated button treatments across thirteen screens and no rule about which
// one was the answer; this is the rule.
//
//   primary      the thing you came to do. Gold, with gold's own shadow.
//   ghost        the other thing you might do. An inset hairline, no fill.
//   done         an answer already given. Wider, because it is a statement.
//   link         a way out that is not a decision.
//   destructive  red, last, and never without a confirmation in front of it.
//
// Deliberately NOT a client component: no hooks and no directive, so a server
// screen can render it and a client island can hand it an `onClick`. The press
// (scale .97 for 120ms) and the confirmation pop are CSS; `pop` fires on the
// answer LANDING, never on the tap, so what a dancer sees is the server
// agreeing with them.

export type ButtonVariant = 'primary' | 'ghost' | 'done' | 'link' | 'destructive'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Draws the tick that pops and writes itself. */
  check?: boolean
  /** Play the confirmation once. The caller turns it off again. */
  pop?: boolean
  /** Present but not available: dimmed, still focusable, still explains itself. */
  off?: boolean
}

export function Button({
  variant = 'ghost',
  check = false,
  pop = false,
  off = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'ui-btn',
    `ui-btn--${variant}`,
    off ? 'ui-btn--off' : '',
    pop ? 'ui-btn--pop' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      {check && <Check className="ui-check" size={20} strokeWidth={2.25} aria-hidden="true" />}
      {children}
    </button>
  )
}
