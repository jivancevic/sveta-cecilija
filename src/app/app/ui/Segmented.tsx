'use client'

// Two or three views of one screen, in one control (#568).
//
// The shape the old `.app__segments` was reaching for: a sunk track with a
// white thumb under the chosen word, the same object the tab bar is, one size
// down. It is not navigation — every panel is already on the page, server
// rendered — so it owns no state of its own and no URL: it reports a choice and
// the screen decides what that means.
//
// A tablist rather than a row of links, because that is what it is: the panels
// are siblings on one screen, and a reader on a keyboard should hear "tab 1 of
// 2" rather than be sent somewhere.

export interface SegmentedItem<K extends string> {
  key: K
  label: React.ReactNode
}

export interface SegmentedProps<K extends string> {
  items: readonly SegmentedItem<K>[]
  value: K
  onSelect: (key: K) => void
  /** What the whole control is, for a screen reader. */
  label: string
  /** The id of the panel the chosen tab controls, and the prefix of the tab ids. */
  panelId: string
  className?: string
}

export function Segmented<K extends string>({
  items,
  value,
  onSelect,
  label,
  panelId,
  className,
}: SegmentedProps<K>) {
  return (
    <div
      className={['ui-seg', className ?? ''].filter(Boolean).join(' ')}
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          id={`${panelId}-${item.key}`}
          aria-controls={panelId}
          aria-selected={value === item.key}
          className={`ui-seg__item${value === item.key ? ' ui-seg__item--on' : ''}`}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
