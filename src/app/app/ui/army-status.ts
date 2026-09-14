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
//
// **A PAST evening does not have a shortfall** (#620). "Fale još 2 crna" is an
// instruction, and an instruction about an evening that has already been danced
// is noise on the one screen a voditelj opens to read what happened. So once
// the nastup has started the same line states the two counts and nothing else,
// and it is never `ok: false`: there is nothing left to be short of.

export interface ArmyStatus {
  /** True when BOTH armies have reached their threshold. */
  ok: boolean
  /** One line, sentence case: "Ima nas dovoljno" or "Fale još 2 crna · fali još 1 bili". */
  text: string
}

/** Everything but the numbers. Optional, so every existing caller is unchanged. */
export interface ArmyStatusOptions {
  /**
   * The nastup has started (#620). The same fact that already decides whether
   * the alarm may be sent (`canAlarm`), never "the postava is confirmed": a
   * voditelj confirms hours later, and the bar must stop demanding dancers the
   * moment the evening is under way.
   */
  past?: boolean
}

export function armyStatus(
  crni: number,
  bili: number,
  threshold: { crni: number; bili: number },
  options: ArmyStatusOptions = {},
): ArmyStatus {
  if (options.past) {
    return {
      ok: true,
      text: `${APP_STRINGS.ui.countCrni(crni)} · ${APP_STRINGS.ui.countBili(bili)}`,
    }
  }

  const short: string[] = []
  if (crni < threshold.crni) short.push(APP_STRINGS.ui.shortCrni(threshold.crni - crni))
  if (bili < threshold.bili) short.push(APP_STRINGS.ui.shortBili(threshold.bili - bili))

  if (short.length === 0) return { ok: true, text: APP_STRINGS.ui.enough }

  const joined = short.join(' · ')
  return { ok: false, text: joined.charAt(0).toUpperCase() + joined.slice(1) }
}
