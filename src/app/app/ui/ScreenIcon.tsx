import {
  CalendarDays,
  ChartColumn,
  Ellipsis,
  FileText,
  Gift,
  House,
  Inbox,
  Receipt,
  ScanLine,
  Store,
  Trophy,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react'
import type { AppScreenKey } from '@/lib/app/screens'

// One drawing per screen (#472, moved here by #569).
//
// It lived inside `AppNav` while the bar and the sidebar were the only two
// things that drew a screen. Više lists the overflow as rows now, and a row
// wants the same picture its tab has: a reader who finds Statistika in Više
// and later gets it as a tab must recognise it as the same screen. So the map
// is a shared shape rather than a client component's private constant, and
// there is still exactly ONE place that says what Narudžbe looks like.
//
// Deliberately not `'use client'`: Lucide's icons are plain function components
// with no hooks, so a server screen renders them without shipping anything.
//
// Icons are Lucide at stroke 1.75 (1.9 on the tab you are on), with ONE
// exception drawn by hand: the crossed swords. The moreška is a sword dance, no
// icon set ships the right pair of blades, and an emoji in a navigation bar is
// not a decision this app makes. Since #565 the blades belong to **Moreška**,
// the dancer's screen, and Izvedbe wears a calendar: the swords are the dance,
// and Izvedbe is now a schedule the blagajna reads.

export const ICON_STROKE = 1.75
export const ICON_STROKE_ON = 1.9

/**
 * The geometry of the crossed swords, on a 24×24 viewBox.
 *
 * Exported because a second place draws them: the Dolazim button
 * (`AnswerPair.tsx`) answers the question with the picture of the Moreška tab,
 * and it animates the two halves apart — the blades redraw, the hilts fade in
 * behind them. A copy of these paths over there was how the button came to
 * carry a different pair of swords than the bar it sits under (#592), so the
 * data lives here and both drawings read it.
 *
 * `blades` are the two long diagonal strokes, one per sword, and they are the
 * only two paths any caller animates; `hilts` is the guard, the grip and the
 * pommel of each.
 */
export const SWORDS_PATHS = {
  blades: ['M14.5 17.5 3 6V3h3l11.5 11.5', 'M14.5 6.5 18 3h3v3l-3.5 3.5'],
  hilts: ['M13 19l6-6', 'M16 16l4 4', 'M19 21l2-2', 'M5 14l4 4', 'M7 17l-4 4'],
} as const

/**
 * The longest blade's path length, rounded up (the geometry above measures
 * 38.5 units; `getTotalLength()` in the browser agrees).
 *
 * `app.css` draws both blades with this one `stroke-dasharray`, which is why it
 * is the LONGEST and not an average: a dash shorter than the path leaves a gap
 * in the middle of the sword. The short blade finishes its stroke earlier in
 * the same animation, which is the two of them meeting.
 */
export const SWORDS_BLADE_LENGTH = 39

/** The blades: the one drawing in Cecilija that is Cecilija's own. */
export function Swords({ strokeWidth = ICON_STROKE }: { strokeWidth?: number }) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SWORDS_PATHS.blades.map((d) => (
        <path key={d} d={d} />
      ))}
      {SWORDS_PATHS.hilts.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

type IconFor = (props: { size: number; strokeWidth: number }) => React.ReactNode

const ICONS: Record<AppScreenKey, IconFor> = {
  home: (p) => <House {...p} aria-hidden="true" />,
  moreska: (p) => <Swords strokeWidth={p.strokeWidth} />,
  performances: (p) => <CalendarDays {...p} aria-hidden="true" />,
  orders: (p) => <Receipt {...p} aria-hidden="true" />,
  members: (p) => <Users {...p} aria-hidden="true" />,
  leaderboard: (p) => <Trophy {...p} aria-hidden="true" />,
  scan: (p) => <ScanLine {...p} aria-hidden="true" />,
  sell: (p) => <Store {...p} aria-hidden="true" />,
  statement: (p) => <FileText {...p} aria-hidden="true" />,
  inquiries: (p) => <Inbox {...p} aria-hidden="true" />,
  comp: (p) => <Gift {...p} aria-hidden="true" />,
  users: (p) => <UserCog {...p} aria-hidden="true" />,
  stats: (p) => <ChartColumn {...p} aria-hidden="true" />,
  finance: (p) => <Wallet {...p} aria-hidden="true" />,
  more: (p) => <Ellipsis {...p} aria-hidden="true" />,
}

export interface ScreenIconProps {
  screen: AppScreenKey
  /** The heavier stroke of the tab you are standing on. */
  on?: boolean
  size?: number
}

export function ScreenIcon({ screen, on = false, size = 24 }: ScreenIconProps) {
  return <>{ICONS[screen]({ size, strokeWidth: on ? ICON_STROKE_ON : ICON_STROKE })}</>
}
