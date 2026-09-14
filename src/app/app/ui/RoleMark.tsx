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
//   otmanović     the same crown WITHOUT the base and with an O in it, on ink
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
  /**
   * Two letters, when the disc stands for a PERSON rather than for a title
   * (#573).
   *
   * Članovi lists the roster out of an evening, so no row has a title and every
   * disc would be a blank colour swatch. The initials give the row a mark that
   * is this dancer's and nobody else's, while the colour keeps saying which
   * army they dance for. A title always wins: an evening's crown is the more
   * specific fact, and the two would collide in the same 44px.
   */
  initials?: string | null
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
        <>
          <path d="m3 8 4.5 4.5L12 5l4.5 7.5L21 8l-2 11H5z" />
          {/* The O of Otmanović, inside the crown's body (#592). The crown
              without its base was the whole of the distinction from a kralj,
              which is a difference nobody can name at 44px and nobody at all
              at 32; the letter is the name. Labrada, because the letter is a
              title and titles are the serif's job, and `stroke="none"` because
              everything else in this svg is a drawn line and a stroked letter
              at 9.5px fills its own counter. */}
          <text
            x="12"
            y="17.4"
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="700"
            stroke="none"
            fill="currentColor"
            style={{ fontFamily: 'var(--serif)' }}
          >
            O
          </text>
        </>
      )}
    </svg>
  )
}

export function RoleMark({
  army,
  title = null,
  initials = null,
  small = false,
  className,
}: RoleMarkProps) {
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

  const shown = initials?.trim() ?? ''

  return (
    <span className={classes} data-title={title ?? 'none'}>
      {glyph ?? (shown !== '' ? <i aria-hidden="true">{shown}</i> : null)}
    </span>
  )
}
