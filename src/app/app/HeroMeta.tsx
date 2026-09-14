import { KindChip } from './ui'
import type { KindTone } from '@/lib/app/performance-kind'

// The hero's second line: "Ponedjeljak · 21:00 · [Redovna]" (#592).
//
// Both screens that draw a hero draw this — Početna and Moreška share
// `heroView()`, so they share its line too and the same evening cannot read
// two ways on two screens.
//
// The kind is a chip rather than the third item of a grey sentence: of the
// three facts on the line it is the only one that changes the shape of the
// evening, and it wears the same tone its disc wears down in the season list.
// A split day has no kind here at all — each half carries its own.

export function HeroMeta({
  lead,
  kind,
  tone,
}: {
  /** "Ponedjeljak · 21:00" */
  lead: string
  /** "Redovna", or null on a day with two nastupa in it. */
  kind: string | null
  tone: KindTone
}) {
  return (
    <>
      <span>{lead}</span>
      {kind && <KindChip tone={tone}>{kind}</KindChip>}
    </>
  )
}
