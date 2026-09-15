// The niz, drawn (#628). Glossary: CONTEXT.md → *Niz*.
//
// **Two drawings of one thing, and the size is which one.** In a list row the
// number sits BESIDE the flame, the way Duolingo draws a Friend Streak: at
// 16px a digit inside the glyph is a smudge. On the profile, where there is
// room, the number sits INSIDE it — that is the shape Josip asked for, and it
// is what Quizlet, Mimo and Numo all do at that size.
//
// **One new colour, ember, and nothing else in the app uses it.** Gold is
// already spent on the reader's own row and on the podium, so a gold flame
// would vanish into its own background; red is the bili army. A flame that is
// not orange does not read as a flame.
//
// **One state.** It is only ever drawn for a niz that is still running
// (`flameNiz` decides), so there is no broken-run variant to draw muted: the
// caller draws nothing at all instead.

import { APP_STRINGS } from '@/lib/app/strings'

export interface FlameProps {
  /** The niz. The caller has already applied `flameNiz`. */
  count: number
  /** The profile's drawing: big, with the number inside the glyph. */
  large?: boolean
  className?: string
}

/** The glyph, at whatever size the box around it is. */
function Glyph() {
  return (
    <svg viewBox="0 0 24 28" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 0c1 5-3 6.5-5.2 9.6C4.6 12.4 4 15 4 17c0 5.5 3.9 9 8 9s8-3.5 8-9c0-3.2-1.4-6-3.6-8.4-.8 1.5-1.8 2.3-2.8 2.5C14.4 7.5 14 3.2 12 0Z"
      />
    </svg>
  )
}

export function Flame({ count, large = false, className }: FlameProps) {
  const classes = ['ui-flame', large ? 'ui-flame--lg' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  // The screen reader gets the sentence rather than "flame 7", because a flame
  // means nothing said out loud. The digits are `aria-hidden` so it is not read
  // twice.
  return (
    <span className={classes} role="img" aria-label={APP_STRINGS.ui.flame(count)}>
      <Glyph />
      <b aria-hidden="true">{count}</b>
    </span>
  )
}
