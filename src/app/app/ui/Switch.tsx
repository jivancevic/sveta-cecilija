// A switch: one thing this device does or does not do (#569).
//
// The eighteenth shape, and it exists because Profil asks two questions of that
// kind — does this phone ring, and which skin does it wear — and the app had no
// answer for the first except a button whose label changed from "Uključi" to
// "Isključi". A label that changes is a control you have to read to know the
// state of; a switch you can see the state of from across a table.
//
// It is a `role="switch"` button rather than a checkbox, because that is what
// it is: the change lands immediately (the subscribe call goes out on the tap),
// there is no form around it and nothing to submit. `aria-checked` carries the
// state, so a screen reader hears "uključeno" rather than a label it has to
// interpret.
//
// Presentational, like `Button` and `Toast`: the caller owns "is it on", which
// on this screen is a fact of the browser, not of the server. No directive, so
// a server screen could render a read-only one.
//
// The whole row is the target, all 56 of its pixels: a thumb aiming at a 34px
// track in a moving bus misses, and the label beside it is the obvious thing to
// be pressing anyway.

export interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  /** The bold line: what this switch turns on. */
  label: React.ReactNode
  /** The quiet second line, when the label needs one. */
  note?: React.ReactNode
  /** Mid-flight: the track dims and the tap is refused until it lands. */
  busy?: boolean
  disabled?: boolean
  className?: string
}

export function Switch({
  checked,
  onChange,
  label,
  note,
  busy = false,
  disabled = false,
  className,
}: SwitchProps) {
  const off = disabled || busy
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      disabled={off}
      onClick={() => onChange(!checked)}
      className={['ui-switch', className ?? ''].filter(Boolean).join(' ')}
    >
      <span className="ui-switch__body">
        <b>{label}</b>
        {note != null && <span>{note}</span>}
      </span>
      <span className="ui-switch__track" aria-hidden="true">
        <span className="ui-switch__thumb" />
      </span>
    </button>
  )
}
