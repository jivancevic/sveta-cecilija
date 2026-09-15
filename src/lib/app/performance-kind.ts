// What KIND an evening is, in one word and one tone (#591, was Q30 of #565).
//
// Every Cecilija surface that prints an evening's kind to a DANCER prints it
// from here: the hero on Početna and on Moreška, the Stanje head, the rows of
// the season. One module, so the three can never disagree about the same
// evening, and so a fourth surface gets the rule rather than a fourth copy of
// a ternary.
//
// **Three categories, not two.** Q30 read every non-`redovna` evening as
// *Vanredna*, which is the word the notebook has used for decades and is right
// for a ship group, a concert or a charity evening. It is wrong for the Moreška
// Experience: an Experience is a form of its own with its own postava (three
// pairs and a bula), it is the other half of *Ljestvica*'s two lists (#568),
// and a dancer reading a season wants to tell one from the other at a glance.
// So `experience` reads "Experience" and everything else that is not a redovna
// still reads "Vanredna" (glossary: *Vanredna izvedba*, *Moreška Experience*).
//
// Since #635 *Vanredna* is `dmc`, `gulliver` and `ostalo`: the koncert left it
// with every other Cecilija surface. The fallback below still catches one, and
// deliberately — no screen can reach a koncert any more (`SHOWN_PERFORMANCE_WHERE`
// keeps it out of every read and the detail loader refuses it by id), so this
// is a total function with an unreachable branch rather than a second opinion
// about what a koncert is. When the musicians get their screen the branch is
// where their word goes.
//
// The word is the English one on purpose: "Experience" is what the society
// calls the product, in Croatian conversation included, and *Moreška iskustvo*
// is the public site's copy rather than the notebook's word.
//
// **The tone is not a colour.** It names the category so a component can dress
// it — gold for a redovna, sunk for a vanredna, copper for an Experience — and
// `src/lib/` never knows a hex value.

import { APP_STRINGS } from './strings'

const S = APP_STRINGS.moreska

/** The three categories an evening is read as, for whatever dresses them. */
export type KindTone = 'regular' | 'extra' | 'experience'

/** Which of the three an evening's `shows.kind` is. */
export function kindTone(kind: string): KindTone {
  if (kind === 'redovna') return 'regular'
  if (kind === 'experience') return 'experience'
  return 'extra'
}

/**
 * The ONE word an evening is named by: "Redovna", "Vanredna" or "Experience".
 *
 * Never the client and never the kind name (Q30): which agency booked a ship
 * group changes nothing about turning up for it, and `dmc` is a database value
 * rather than a word anybody says.
 */
export function kindWord(kind: string): string {
  const tone = kindTone(kind)
  if (tone === 'regular') return S.regular
  if (tone === 'experience') return S.experienceWord
  return S.extra
}
