// Cecilija's shared shapes (#562).
//
// Fifteen components and one stylesheet (`ui.css`, loaded by the route group's
// layout). A screen composes these; a screen does not restyle them, and a
// screen that needs a sixteenth shape brings it here rather than inventing one
// beside itself — that is exactly how the app ended up with five kinds of
// button and no rule about which was primary (audit, pattern 2).
//
// `PullToRefresh` renders `Toast` — imported from its own file rather than
// through this barrel, because a client island should not pull fifteen shapes
// into its bundle to use one. Everything else lands as the screen tickets
// rebuild their screens (T2 onwards), and until then the only thing keeping
// these honest is `ui.test.ts`, which renders every one of them.

export { ArmyBar, type ArmyBarProps } from './ArmyBar'
export { armyStatus, type ArmyStatus } from './army-status'
export { Button, type ButtonProps, type ButtonVariant } from './Button'
export { Card, type CardProps } from './Card'
export { Chip, type ChipProps, type ChipTone } from './Chip'
export { DateDisc, type DateDiscProps } from './DateDisc'
export { Hero, type HeroProps } from './Hero'
export { List, ListRow, type ListRowProps } from './ListRow'
export { Note, type NoteProps } from './Note'
export { Podium, type PodiumEntry, type PodiumProps } from './Podium'
export { Ring, type RingProps } from './Ring'
export { RoleMark, type Army, type DanceTitle, type RoleMarkProps } from './RoleMark'
export { Section, type SectionProps } from './Section'
export { Sheet, SheetOption, type SheetProps } from './Sheet'
export { Tile, Tiles, type TileProps } from './Tile'
export { Toast, type ToastProps } from './Toast'
