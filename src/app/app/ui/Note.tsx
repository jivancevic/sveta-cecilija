import { Info } from 'lucide-react'

// A note: something the reader is told, not something they do (#562).
//
// A sunk panel with an icon, inside the card it belongs to. The voditelj's
// message for an evening is the one that matters ("Skup u 20:15 iza pozornice")
// and it must never look like a control, which is why it has no edge, no
// shadow and nothing to press.

export interface NoteProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Defaults to an info glyph; a screen may hand in another Lucide icon. */
  icon?: React.ReactNode
}

export function Note({ icon, className, children, ...rest }: NoteProps) {
  return (
    <div className={['ui-note', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      <span className="ui-note__icon" aria-hidden="true">
        {icon ?? <Info size={18} strokeWidth={1.75} />}
      </span>
      <span>{children}</span>
    </div>
  )
}
