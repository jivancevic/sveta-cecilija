// A toast: "it landed", and nothing else (#562).
//
// It says what happened in the past tense and it never carries an action, so
// there is nothing to miss by not reading it. It sits above the tab bar rather
// than over it, because the bar is the one thing that must never be covered.
//
// Presentational on purpose: the caller owns "is it showing", which is the only
// state there is, so a server screen and a client island can both render it and
// neither has to own a timer it did not start.

export interface ToastProps {
  message: React.ReactNode
  open: boolean
  className?: string
}

export function Toast({ message, open, className }: ToastProps) {
  return (
    <div
      className={['ui-toast', open ? 'ui-toast--on' : '', className ?? ''].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  )
}
