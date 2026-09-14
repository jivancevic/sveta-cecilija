import type { DateDiscTone } from './DateDisc'

// Which KIND an evening is, as a pill (#592).
//
// The same three tones the DateDisc wears, in the one place a hero has no disc
// to wear them on: "Ponedjeljak · 16:30 · [Vanredna]". Until #592 that last
// word was part of the same grey sentence as the weekday and the time, so the
// one fact on the line that changes the shape of the evening read exactly like
// the two that do not.
//
// Gold is Redovna, ink is Vanredna, copper is the Moreška Experience — the
// same pairing as the disc, so a dancer reading the hero and then the season
// below it is reading one colour language. The tone is a CATEGORY and never a
// colour: it comes from `kindTone()` in `src/lib/app/performance-kind.ts`,
// which knows no hex.

export type KindChipTone = DateDiscTone

const TONE_CLASS: Record<KindChipTone, string> = {
  regular: 'ui-kindchip--regular',
  extra: 'ui-kindchip--extra',
  experience: 'ui-kindchip--experience',
}

export interface KindChipProps {
  tone: KindChipTone
  /** "Redovna", "Vanredna" or "Experience", already chosen by `kindWord()`. */
  children?: React.ReactNode
  className?: string
}

export function KindChip({ tone, children, className }: KindChipProps) {
  const classes = ['ui-kindchip', TONE_CLASS[tone], className ?? ''].filter(Boolean).join(' ')
  return <span className={classes}>{children}</span>
}
