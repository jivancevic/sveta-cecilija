// Who someone dances as, tonight (#562).
//
// Two facts in one 44px disc, and the split matters:
//
//   the DISC is the army    crni (ink), bili (red), bula (gold)
//   the GLYPH is the TITLE  and the title belongs to this evening only, never
//                           to the person. The voditelj hands it out per
//                           izvedba (glossary: *Title*), so the same dancer is
//                           a crni kralj on Tuesday and a plain crni on Friday.
//
// Four titles, four drawings:
//   crni kralj    a grey crown WITH its base, on ink
//   otmanović     the same crown WITHOUT the base, on ink
//   bili kralj    a gold crown on red
//   bula          a gold disc; the bula OF THE NIGHT gets the white ring
//
// The crowns are drawn here rather than taken from Lucide: a crown with and
// without a base is the whole distinction between the two crni titles, and no
// icon set ships that pair.

export type Army = 'crni' | 'bili' | 'bula'
export type DanceTitle = 'crni_kralj' | 'otmanovic' | 'bili_kralj' | 'bula'

export interface RoleMarkProps {
  army: Army | null
  /** The title for THIS evening, or null for a dancer without one. */
  title?: DanceTitle | null
  /** 28px instead of 44px, for a name inside a column. */
  small?: boolean
  className?: string
}

function Crown({ base }: { base: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {base ? (
        <>
          <path d="m3 7 4.5 4.5L12 4l4.5 7.5L21 7l-2 11H5z" />
          <path d="M5 21h14" />
        </>
      ) : (
        <path d="m3 8 4.5 4.5L12 5l4.5 7.5L21 8l-2 11H5z" />
      )}
    </svg>
  )
}

export function RoleMark({ army, title = null, small = false, className }: RoleMarkProps) {
  const classes = [
    'ui-mark',
    army ? `ui-mark--${army}` : 'ui-mark--none',
    small ? 'ui-mark--sm' : '',
    title === 'bula' ? 'ui-mark--titled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const glyph =
    title === 'crni_kralj' || title === 'bili_kralj' ? (
      <Crown base />
    ) : title === 'otmanovic' ? (
      <Crown base={false} />
    ) : null

  return (
    <span className={classes} data-title={title ?? 'none'}>
      {glyph}
    </span>
  )
}
