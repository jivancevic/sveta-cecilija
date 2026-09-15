import Link from 'next/link'

// A row of filters, as chips (#570, Q40).
//
// Narudžbe and Upiti both narrow a list by picking one of a short set, and
// until now both did it with a `<select>` that submits itself: two taps, a
// native wheel over the screen, and no way to see what the other options were
// without opening it. A chip row says all of them at once and the active one is
// filled, which is the same "where am I" the tab bar draws.
//
// Deliberately NOT the `Chip` component: a `Chip` is a fact about the row it
// sits on and is never the way to do something. This is navigation — every chip
// is a `Link` to an address of the list — so it is its own shape with its own
// name, which also means it keeps working with no JavaScript.
//
// The row scrolls sideways rather than wrapping: a season's worth of
// performances is twenty chips, and a control that grows to four lines pushes
// the list it filters off the screen.

export interface FilterChipItem {
  /** Matches `active`; the unfiltered chip's key is the empty string. */
  key: string
  label: React.ReactNode
  /** Where this chip leads. Omitted when the row narrows a list in the page. */
  href?: string
}

export interface FilterChipsProps {
  items: readonly FilterChipItem[]
  /** The key of the chip that is on. */
  active: string
  /** What this row filters, for a screen reader. */
  label: string
  /**
   * The other kind of list (#573).
   *
   * Članovi is the whole society, already in the page, and its search narrows
   * it on the keystroke rather than through the URL. A chip row there is a
   * choice, not an address, so it is a row of buttons. Hand in `onSelect` and
   * leave `href` off the items; hand in neither and every chip is a link, which
   * is what Narudžbe and Upiti want and what keeps working with no JavaScript.
   */
  onSelect?: (key: string) => void
  className?: string
}

export function FilterChips({ items, active, label, onSelect, className }: FilterChipsProps) {
  return (
    <nav
      className={['ui-filters', className ?? ''].filter(Boolean).join(' ')}
      aria-label={label}
      // The strip scrolls sideways, so pull-to-refresh must not arm on it
      // (#633): the pull's own axis lock would hand the touch back after a few
      // millimetres, and this hands it back before the first one.
      data-no-pull=""
    >
      {items.map((item) => {
        const on = item.key === active
        if (!item.href) {
          return (
            <button
              key={item.key}
              type="button"
              className={`ui-filter${on ? ' ui-filter--on' : ''}`}
              aria-pressed={on}
              onClick={() => onSelect?.(item.key)}
            >
              {item.label}
            </button>
          )
        }
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`ui-filter${on ? ' ui-filter--on' : ''}`}
            aria-current={on ? 'true' : undefined}
            // A filter chip is a destination, and `scroll={false}` is what keeps
            // the list from jumping to the top of the document every time one is
            // picked: the reader is looking at the chips, not at the header.
            scroll={false}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
