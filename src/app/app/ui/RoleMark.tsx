import type { DanceRole } from '@/lib/moreskant-profile'

// Who someone dances as (#562).
//
// Two facts in one 44px disc, and the split matters:
//
//   the DISC is the army    crni (ink), bili (red), bula (gold)
//   the GLYPH says which     — and WHICH fact the glyph is depends on the
//                             context the disc is drawn in.
//
// **The mark means ONE of two things and never both.** In a PROFILE context (a
// person shown as themselves) the disc is the army of their PRIMARY ROLE and
// the glyph is that role. In a NASTUP context (a person shown in an evening)
// the disc is the army and the glyph is THIS EVENING'S TITLE, or nothing.
//
// That is not a nicety of wording, it is the whole of what a crown on this app
// means. A title belongs to one evening's lineup and never to a person
// (CONTEXT.md → *Title*): the voditelj hands it out per izvedba, so the same
// dancer is a crni kralj on Tuesday and a plain crni on Friday. A crown drawn
// off a PROFILE in a nastup context would be a promise nobody made; a plain
// disc drawn off an evening in a profile context would hide the one thing a
// profile is for. So the caller says which question it is asking, in the type:
// `title` is the evening's answer, `role` is the person's, and the union below
// makes passing both a compile error rather than a judgement call.
//
// The EXCEPTION, and it is explicit: **Ljestvica wears no glyph at all.** A
// season's counts are not an evening, so its rows and its podium pass neither
// `title` nor `role` — army colour and initials only (`leaderboard-rank.ts`
// pins `title: null` in the row type itself, so the rule is enforced by tsc and
// not by memory).
//
// Four glyphs, four drawings, and both contexts draw the same four:
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

/**
 * Which glyph a PROFILE's primary role draws.
 *
 * `bula` deliberately maps to nothing. `ui-mark--titled` is the white ring that
 * marks the bula OF AN EVENING, and a bula by trade is not that: she gets the
 * plain gold disc her army already is, the same way a crni by trade gets a
 * plain ink one. The two kings and the otmanović are the only roles whose
 * profile fact has a drawing of its own.
 */
const GLYPH_OF_ROLE: Record<DanceRole, DanceTitle | null> = {
  crni: null,
  bili: null,
  crni_kralj: 'crni_kralj',
  otmanovic: 'otmanovic',
  bili_kralj: 'bili_kralj',
  bula: null,
}

interface RoleMarkBase {
  army: Army | null
  /**
   * Two letters, when the disc stands for a PERSON rather than for a glyph
   * (#573).
   *
   * Članovi lists the roster out of an evening, so no row has a title and every
   * disc would be a blank colour swatch. The initials give the row a mark that
   * is this dancer's and nobody else's, while the colour keeps saying which
   * army they dance for. A glyph always wins: a crown is the more specific
   * fact, and the two would collide in the same 44px.
   */
  initials?: string | null
  /**
   * What this disc says out loud, when the disc is the ONLY thing saying it
   * (#612).
   *
   * A mark beside a name needs none: the name is already there and the disc is
   * the decoration on it. A mark standing alone — the row of other dance roles
   * on a dancer's own profile — is a colour and nothing else to a screen
   * reader, and a colour is not a role. Given a label the span becomes an
   * `img`, so it is announced once, as a thing, rather than as an empty box.
   */
  label?: string | null
  /** 28px instead of 44px, for a name inside a column. */
  small?: boolean
  className?: string
}

/** A person shown in an EVENING: the glyph is that evening's title, or none. */
interface NastupMark extends RoleMarkBase {
  /** The title for THIS evening, or null for a dancer without one. */
  title?: DanceTitle | null
  role?: never
}

/** A person shown as THEMSELVES: the glyph is their dance role, or none. */
interface ProfileMark extends RoleMarkBase {
  /** The role this disc stands for; on the big disc, the reader's primary one. */
  role: DanceRole
  title?: never
}

export type RoleMarkProps = NastupMark | ProfileMark

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

export function RoleMark(props: RoleMarkProps) {
  const { army, initials = null, label = null, small = false, className } = props

  // The two contexts collapse to ONE drawing decision here, and only here: a
  // caller has already said which question it is asking, and everything below
  // this line treats the answer the same way. `props.role` is checked rather
  // than `props.title` because the profile branch is the narrower one — a
  // nastup mark may legitimately pass neither.
  const drawn: DanceTitle | null =
    props.role !== undefined ? GLYPH_OF_ROLE[props.role] : (props.title ?? null)

  const classes = [
    'ui-mark',
    army ? `ui-mark--${army}` : 'ui-mark--none',
    small ? 'ui-mark--sm' : '',
    // The white ring is the bula OF THE NIGHT and nothing else, which is why it
    // reads `drawn` rather than `props.role`: a bula by trade maps to no glyph
    // above, so she never picks the ring up from her profile.
    drawn === 'bula' ? 'ui-mark--titled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const glyph =
    drawn === 'crni_kralj' || drawn === 'bili_kralj' ? (
      <Crown base />
    ) : drawn === 'otmanovic' ? (
      <Crown base={false} />
    ) : null

  const shown = initials?.trim() ?? ''

  return (
    <span
      className={classes}
      data-title={drawn ?? 'none'}
      {...(label ? { role: 'img', 'aria-label': label, title: label } : {})}
    >
      {glyph ?? (shown !== '' ? <i aria-hidden="true">{shown}</i> : null)}
    </span>
  )
}
