import { APP_STRINGS } from '@/lib/app/strings'

// "Are we enough tonight?", in one pure function (#562).
//
// The ArmyBar draws it and `/app/performances` will read it, so it lives apart
// from the component: a sentence about an evening is a domain fact, and the
// only way two screens can ever disagree about whether the moreška can be
// danced is if two of them compute it.
//
// The threshold is per evening and per army (#503's Pragovi), so it is an
// argument here and never a constant.

export interface ArmyStatus {
  /** True when BOTH armies have reached their threshold. */
  ok: boolean
  /** One line, sentence case: "Ima nas dovoljno" or "Fale još 2 crna · fali još 1 bili". */
  text: string
}

export function armyStatus(
  crni: number,
  bili: number,
  threshold: { crni: number; bili: number },
): ArmyStatus {
  const short: string[] = []
  if (crni < threshold.crni) short.push(APP_STRINGS.ui.shortCrni(threshold.crni - crni))
  if (bili < threshold.bili) short.push(APP_STRINGS.ui.shortBili(threshold.bili - bili))

  if (short.length === 0) return { ok: true, text: APP_STRINGS.ui.enough }

  const joined = short.join(' · ')
  return { ok: false, text: joined.charAt(0).toUpperCase() + joined.slice(1) }
}
