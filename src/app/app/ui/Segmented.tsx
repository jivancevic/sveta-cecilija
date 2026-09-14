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
//
// **Two modes, one shape** (#569). Profil needed the same object for a SETTING
// — Svijetla · Tamna · Kao sustav — and a setting has no panel to control: a
// `role="tab"` with an `aria-controls` pointing at nothing is a lie a screen
// reader repeats out loud. So `mode="options"` renders the identical control as
// a radiogroup. The alternative was a screen restyling `ui-seg` beside itself,
// which is the one thing the shapes exist to prevent.

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
  /**
   * `tabs` (the default) switches between panels already on the screen;
   * `options` is a setting with no panel behind it.
   */
  mode?: 'tabs' | 'options'
  /**
   * The id of the panel the chosen tab controls, and the prefix of the item
   * ids. Required in `tabs` mode; in `options` mode it only names the buttons.
   */
  panelId?: string
  className?: string
}

export function Segmented<K extends string>({
  items,
  value,
  onSelect,
  label,
  mode = 'tabs',
  panelId,
  className,
}: SegmentedProps<K>) {
  const tabs = mode === 'tabs'
  return (
    <div
      className={['ui-seg', className ?? ''].filter(Boolean).join(' ')}
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
    >
      {items.map((item) => {
        const on = value === item.key
        return (
          <button
            key={item.key}
            type="button"
            role={tabs ? 'tab' : 'radio'}
            id={panelId ? `${panelId}-${item.key}` : undefined}
            aria-controls={tabs ? panelId : undefined}
            aria-selected={tabs ? on : undefined}
            aria-checked={tabs ? undefined : on}
            className={`ui-seg__item${on ? ' ui-seg__item--on' : ''}`}
            onClick={() => onSelect(item.key)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
