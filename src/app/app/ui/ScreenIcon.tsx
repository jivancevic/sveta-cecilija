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
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
      <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
      <path d="M5 14l4 4" />
      <path d="M7 17l-4 4" />
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
