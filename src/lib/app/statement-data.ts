// What Obračun loads on the server (#505, rebuilt by #599).
//
// **One screen, two readers.** A reseller opens it locked to their own Partner
// and reads what they owe. The secretary opens the same screen, picks a partner
// and a month, and sends the document. That is the whole point of the ticket:
// "usporediti je li sve okej" needs both of them looking at one paper, and
// until #599 she had no way in and worked from a raw CSV instead.
//
// **Everything is server-rendered and the state is in the query string.** The
// month used to be fetched by a client island, which meant a link to one
// partner's month could not be sent to anyone. `?partnerId=&year=&month=` is
// now the whole state, the way Financije does it, so the secretary can paste a
// link into a message and the accountant opens exactly what she was looking at.
//
// The month itself comes from `loadPartnerStatement`, the same function the
// download route calls, so the figures on screen and the figures in the PDF are
// one computation — and a month that has been marked sent is served frozen from
// `partner_statements` on both paths.

import {
  getPartnerSeasonStats,
  getStatistikaShows,
} from '@/lib/partner/partner-data'
import {
  loadPartnerStatement,
  type StatementSent,
} from '@/lib/partner/load-statement'
import { monthKeyInZagreb } from '@/lib/partner/partner-reconciliation'
import type { StatementDocument } from '@/lib/partner/statement-document'
import { buildStatistikaBars, type StatBar } from '@/lib/partner/partner-stats'
import { getRepo } from '@/lib/repo'
import type { PartnerRecord } from './partner-screen'
import { partnerScreenState, type PartnerScreenState } from './partner-screen'
import { monthHasEnded } from './statement-sent'
import { clampStatementMonth, type MonthKey } from './statement-view'

/** One row of the secretary's partner picker. */
export interface PartnerOption {
  id: string
  name: string
  active: boolean
}

/**
 * What the screen can show about the account in front of it.
 *
 * `no-partners` is the secretary's own empty state and exists because her
 * refusals are not the reseller's: a `finance` account is never "unlinked", it
 * simply may be looking at a society that has no resellers yet.
 */
export type StatementState =
  | { kind: 'ok'; partner: PartnerRecord }
  | { kind: 'unlinked' }
  | { kind: 'inactive'; name: string }
  | { kind: 'no-partners' }

export interface StatementScreen {
  state: StatementState
  /** The picker's rows. Empty for a reseller, who has nothing to pick. */
  partners: PartnerOption[]
  /** May this reader choose a partner, and stamp a month sent? */
  canPick: boolean
  /** The chosen month, live or frozen. Null when there is no partner to read. */
  document: StatementDocument | null
  /** Non-null exactly when the month has been marked sent. */
  sent: StatementSent | null
  /** Has the chosen month ended in Europe/Zagreb? A live month cannot be sent. */
  monthEnded: boolean
  /** Where the statement would be mailed, and whether that is the fallback. */
  mail: { address: string; fallback: boolean } | null
  year: number
  month: number
  /** One bar per season izvedba, chronological. */
  bars: StatBar[]
  /** Active tickets this partner sold across the season. */
  totalActive: number
  /** Today in Europe/Zagreb, so the month picker takes no clock of its own. */
  now: MonthKey
}

export interface LoadStatementScreenArgs {
  /** The Partner a `partner` login is locked to, or null. */
  ownPartnerId: string | null
  /** True for a `finance` reader: may pick any partner and stamp a month. */
  canPick: boolean
  partnerId?: string
  year?: string
  month?: string
}

function pickNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isInteger(n) ? n : fallback
}

/**
 * The address the obračun is mailed to.
 *
 * `Partners.email` is the settlement contact and the right answer. The linked
 * login's address is the FALLBACK and is flagged as one, because that account
 * belongs to whoever stands at the reseller's counter: mailing a settlement
 * there is better than mailing it nowhere, and the screen says which it used so
 * somebody eventually fills the proper field in.
 */
async function resolveMailAddress(
  partner: PartnerRecord,
): Promise<{ address: string; fallback: boolean } | null> {
  if (partner.email) return { address: partner.email, fallback: false }
  const repo = getRepo()
  const accounts = await repo.users.list()
  const linked = accounts.find((u) => u.partnerId === partner.id && u.email)
  return linked?.email ? { address: linked.email, fallback: true } : null
}

export async function loadStatementScreen(
  args: LoadStatementScreenArgs,
): Promise<StatementScreen> {
  const repo = getRepo()
  const now = monthKeyInZagreb(new Date().toISOString())

  // The month picker never offers a month that has not begun, so a hand-typed
  // year+month cannot ask for an empty future statement.
  const year = pickNumber(args.year, now.year)
  const month = clampStatementMonth(now, year, pickNumber(args.month, now.month))

  const empty = {
    partners: [] as PartnerOption[],
    canPick: args.canPick,
    document: null,
    sent: null,
    monthEnded: monthHasEnded(now, year, month),
    mail: null,
    year,
    month,
    bars: [] as StatBar[],
    totalActive: 0,
    now,
  }

  // A reseller is locked to its own Partner and a query string cannot move it;
  // the secretary picks, and every partner is offered, active or not, because a
  // deactivated reseller still owes for what it sold before it was retired.
  let partner: PartnerRecord | null = null
  let partners: PartnerOption[] = []

  if (args.canPick) {
    const all = await repo.partners.all()
    partners = all.map((p) => ({ id: p.id, name: p.name, active: p.active }))
    if (all.length === 0) return { ...empty, state: { kind: 'no-partners' } }
    partner = all.find((p) => p.id === String(args.partnerId ?? '')) ?? all[0]
  } else {
    partner = args.ownPartnerId == null ? null : await repo.partners.byId(args.ownPartnerId)
    const state: PartnerScreenState = partnerScreenState(partner)
    // A reseller pointed at a deactivated Partner sees a sentence and no
    // figure, exactly as Prodaja does (`partner-screen.ts`).
    if (state.kind !== 'ok') return { ...empty, state }
  }

  if (!partner) return { ...empty, state: { kind: 'unlinked' } }

  const [statement, season, allShows, mail] = await Promise.all([
    loadPartnerStatement(repo.db.query, { partner, year, month }),
    getPartnerSeasonStats(repo.db.query, Number(partner.id)),
    getStatistikaShows(repo.db.query),
    args.canPick ? resolveMailAddress(partner) : Promise.resolve(null),
  ])

  return {
    ...empty,
    state: { kind: 'ok', partner },
    partners,
    document: statement.document,
    sent: statement.sent,
    mail,
    bars: buildStatistikaBars(allShows, season.perShow),
    totalActive: season.totalActive,
  }
}

export type { MonthKey, PartnerRecord, StatBar, StatementDocument, StatementSent }
