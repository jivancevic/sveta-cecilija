// Cecilija's shared shapes (#562).
//
// Twenty-three components and one stylesheet (`ui.css`, loaded by the route
// group's layout). Fifteen landed with T1; Ljestvica (#568) brought the
// segmented control it needed and the count that runs up on first paint,
// Profil (#569) the switch, Narudžbe (#570) the row of filter chips Upiti
// reads too, and Statistika and Financije (#571) `Seasons` — Ljestvica's own
// pill row until a second screen needed it — and `Explain`, the "i" that keeps
// the rest of a caveat off the card. Each here rather than beside itself,
// which is the rule. `ScreenIcon` came the other way: it was `AppNav`'s private
// map until Više had to draw the same screens as rows.
//
// A screen composes these; a screen does not restyle them, and a
// screen that needs a twenty-third shape brings it here rather than inventing one
// beside itself — that is exactly how the app ended up with five kinds of
// button and no rule about which was primary (audit, pattern 2).
//
// `KindChip` is #592's: the hero had no disc to carry the kind's tone on, and
// the word was the third item of a grey sentence.
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
export { CountUp, type CountUpProps } from './CountUp'
export { DateDisc, type DateDiscProps, type DateDiscTone } from './DateDisc'
export { Explain, type ExplainProps } from './Explain'
export { FilterChips, type FilterChipItem, type FilterChipsProps } from './FilterChips'
export { Hero, type HeroProps } from './Hero'
export { KindChip, type KindChipProps, type KindChipTone } from './KindChip'
export { List, ListRow, type ListRowProps } from './ListRow'
export { Note, type NoteProps } from './Note'
export { Podium, type PodiumEntry, type PodiumProps } from './Podium'
export { Ring, type RingProps } from './Ring'
export { RoleMark, type Army, type DanceTitle, type RoleMarkProps } from './RoleMark'
export {
  ICON_STROKE,
  ICON_STROKE_ON,
  ScreenIcon,
  SWORDS_BLADE_LENGTH,
  SWORDS_PATHS,
  Swords,
  type ScreenIconProps,
} from './ScreenIcon'
export { Seasons, type SeasonsProps } from './Seasons'
export { Section, type SectionProps } from './Section'
export { Segmented, type SegmentedItem, type SegmentedProps } from './Segmented'
export { Sheet, SheetOption, type SheetProps } from './Sheet'
export { Switch, type SwitchProps } from './Switch'
export { Tile, Tiles, type TileProps } from './Tile'
export { Toast, type ToastProps } from './Toast'
