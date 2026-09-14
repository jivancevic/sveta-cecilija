import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can } from '@/lib/access/permissions'
import { getPerformanceDetail } from '@/lib/app/detail-data'
import { loadPerformanceSales } from '@/lib/app/sales-data'
import {
  channelSplit,
  partnerFaceNote,
  performanceNumbers,
  seatsSold,
  showsRosterHalf,
  ticketedSeats,
} from '@/lib/app/sales-view'
import { izvedbaHead } from '@/lib/app/izvedbe-screen'
import {
  mayCancelBooking,
  mayWritePerformance,
  performanceActionGates,
} from '@/lib/app/performance-actions'
import { APP_STRINGS } from '@/lib/app/strings'
import { VENUE_CAPACITY } from '@/lib/venues'
import type { NonPublicKind } from '@/lib/performance-input'
import { Card, Chip, Ring } from '../../ui'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { LineupEditor } from '../../LineupEditor'
import { CompTickets } from '../../CompTickets'
import { NoteEditor } from '../../NoteEditor'
import { PerformanceEditor, PublicPerformanceEditor } from '../../PerformanceForm'
import { ThresholdEditor } from '../../ThresholdEditor'
import { PerformanceActions } from './PerformanceActions'

// `/app/performances/[id]` — one izvedba, as the box office reads it (#567).
//
// **The title is the DATE** (Q32): a secretary on the phone refers to an
// evening by the day it falls on, and "Redovna" named the category on
// twenty-two rows of a season. The kind, the hour and the house are the line
// under it, and the sticky answer bar is gone with everything else
// dancer-facing — a dancer answers on Moreška (#565) and reads the evening's
// two armies on Stanje (#566), and a `moreskant` login does not unlock this
// screen at all.
//
// Four cards, in the order the reader needs them:
//
//   1. **Prodaja**, for a `tickets` holder on a public row: the ring, the split
//      and the per-show numbers this evening is judged by (revenue only for
//      `finance`, gated on the DATA in `sales-view.ts` rather than on a class).
//   2. **Radnje**, the six named actions, each one greyed with the person to
//      ask when this reader may not press it (Q53). The routes refuse the same
//      requests in their own handlers: the caption is the courtesy half.
//   3. **Izvedba**, where the evening itself is corrected — Uredi for either
//      half since #567, plus Otkaži on a booking, which stays the voditelj's.
//   4. **Postava** and the voditelj's own two tools (the note, the thresholds),
//      for a `moreska` holder. The `LineupEditor` stays here until Stanje can
//      record an unusual role or the voditelj line (#566); it is the tweezers
//      for a row Stanje has no control for.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.izvedbe

export default async function PerformanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Izvedbe's own screen, and only Izvedbe's (#566). It answered to Moreška as
  // well while Stanje had no route of its own; now it has one
  // (`/app/moreska/[id]`), a dancer reads the evening there and the push deep
  // links point at it.
  const { viewer, refusal } = await openScreen('performances')
  if (refusal) return refusal

  const me = viewer.me
  const voditelj = viewer.voditelj
  const blagajna = can({ permissions: viewer.permissions }, 'tickets')
  const detail = await getPerformanceDetail(id, { memberId: me?.id ?? null, voditelj })
  if (!detail) notFound()

  const p = detail.performance

  // The seats, for a `tickets` holder on a public evening: this is where the
  // old `/admin/stats/[id]` drill-down lands. A booking sells nothing, so there
  // is nothing to load for one.
  const sales = blagajna && p.isPublic ? await loadPerformanceSales(p.id) : null
  const canFinance = can({ permissions: viewer.permissions }, 'finance')
  // The one line under Prihod (#538). Null when the evening sold no partner
  // seats, and null without `finance`, because it is money: the sentence never
  // reaches the markup, so no condition here can leak it.
  const partnerFace = sales ? partnerFaceNote(sales, canFinance) : null

  const head = izvedbaHead(p, sales)
  // Who may press what, decided here from the caller's own set and handed down
  // as data. The client island never re-derives it and never re-types a `can()`.
  const gates = performanceActionGates(viewer.permissions)
  const mayWrite = mayWritePerformance(viewer.permissions)
  // Whether the roster half belongs on this screen at all: the postava is the
  // one piece of the dance that has not moved to Stanje yet (#566).
  const roster = showsRosterHalf(voditelj, me != null)

  const intro = (
    <header className="app__izv-head">
      <Link className="app__back" href="/app/performances">
        ‹ {APP_STRINGS.screens.performances}
      </Link>
      <p className="app__izv-meta">{head.meta}</p>
      {head.chips.length > 0 && (
        <div className="app__chips">
          {head.chips.map((chip) => (
            <Chip key={chip.label} tone={chip.tone}>
              {chip.label}
            </Chip>
          ))}
        </div>
      )}
    </header>
  )

  return (
    <AppShell viewer={viewer} screen="performances" title={head.title} intro={intro}>
      {sales && (
        <Card eyebrow={S.salesCard} className="app__izv-sales-card">
          <div className="app__izv-ring">
            <Ring value={seatsSold(sales)} max={VENUE_CAPACITY[sales.venue]} />
            <div>
              <b>{`${seatsSold(sales)}/${VENUE_CAPACITY[sales.venue]}`}</b>
              {/* Where the seats came from, one chip each, the empty ones
                  dropped: the question a row is asked is "where did these
                  hundred and thirty two come from". */}
              <div className="app__izv-split">
                {channelSplit(sales).map((c) => (
                  <Chip key={c.key}>{`${c.label} ${c.value}`}</Chip>
                ))}
              </div>
            </div>
          </div>

          <dl className="app__izv-numbers">
            {performanceNumbers(sales, canFinance).map((line) => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>

          {/* Under Prihod, and never inside it (#538): partner seats are face
              value the society has not collected, so they are named at face
              value rather than summed into the evening's take. Not the word
              *potraživanje*, which is Financije's net-of-commission figure. */}
          {partnerFace && <p className="app__izv-partner-face">{partnerFace}</p>}
        </Card>
      )}

      {/* The six actions belong to a PUBLIC evening: a booking sells no seat to
          refund, no date a buyer was told and nothing to pause. */}
      {p.isPublic && (
        <PerformanceActions
          performanceId={p.id}
          paused={sales?.paused ?? false}
          cancelled={p.cancelled}
          atLjetno={(sales?.venue ?? p.venue) === 'ljetno-kino' && !(sales?.moved ?? false)}
          gates={gates}
        />
      )}

      {mayWrite && !p.cancelled && (
        <Card eyebrow={S.performanceCard}>
          {p.isPublic ? (
            <PublicPerformanceEditor
              performanceId={p.id}
              // The house of a SOLD evening moves through *Preseli u zimsko*,
              // which mails every buyer (#502 review). Without the sales read
              // (a voditelj) the field is locked rather than guessed at: the
              // route would refuse the change anyway, and a control that looks
              // editable until the save is a control that lies.
              venueLocked={sales ? ticketedSeats(sales) > 0 : true}
              initial={{
                kind: p.kind,
                date: p.date,
                time: p.time,
                venue: p.venue ?? 'ljetno-kino',
              }}
            />
          ) : (
            <PerformanceEditor
              performanceId={p.id}
              cancelled={p.cancelled}
              canCancel={mayCancelBooking(viewer.permissions)}
              initial={{
                kind: (p.kind === 'redovna' ? 'ostalo' : p.kind) as NonPublicKind,
                date: p.date,
                time: p.time,
                location: p.location ?? '',
                client: p.client ?? '',
              }}
            />
          )}
        </Card>
      )}

      {/* A cancelled evening keeps its record and loses its form: Uredi is a
          409 (moving it would push "premještena" at a roster that has been told
          it is off) and the ledger is still open in Radnje above. */}
      {mayWrite && p.cancelled && (
        <Card eyebrow={S.performanceCard}>
          <p className="ui-small">{APP_STRINGS.performance.cancelledNotEditable}</p>
        </Card>
      )}

      {/* A booking's own two facts, for the reader who did not enter it. */}
      {!p.isPublic && (p.location || p.client) && (
        <Card eyebrow={S.performanceCard} className="app__izv-booking">
          {p.location && (
            <p>
              <span className="ui-small">{S.place}</span>
              {p.location}
            </p>
          )}
          {p.client && (
            <p>
              <span className="ui-small">{S.client}</span>
              {p.client}
            </p>
          )}
        </Card>
      )}

      {voditelj && (
        <>
          <Card eyebrow={APP_STRINGS.lead.title}>
            {/* The same note `/admin` edits (#436, story 25): saving goes
                through the collection, so the roster is notified either way. */}
            <NoteEditor performanceId={p.id} initialNote={p.voditeljNote} />
            {/* The two army thresholds (#503). On EVERY row, public one
                included: how many crni and bili an evening needs is a fact
                about the dance, and the collection's own field access says the
                same (`canEditRosterField` never asks about the row). */}
            <ThresholdEditor performanceId={p.id} crni={p.thresholdCrni} bili={p.thresholdBili} />
          </Card>

          {/* The postava, until Stanje can do the whole of it (#566): Stanje
              hands out the four titles, this hands out an unusual role and the
              voditelj line, and #512 must not take it away before then. */}
          <Card eyebrow={S.lineupCard}>
            <LineupEditor
              performanceId={p.id}
              initialEntries={detail.lineup.entries}
              suggested={detail.lineup.suggested}
              roster={detail.lineup.roster}
              confirmed={detail.lineup.confirmed}
              confirmedAt={detail.lineup.confirmedAt}
            />
          </Card>
        </>
      )}

      {/* A voditelj who also dances still issues their own four free seats here
          (#434); nobody else has a `comps.visible` at all, and the route caps
          and refuses exactly as it did. */}
      {roster && detail.comps.visible && (
        <Card eyebrow={S.compCard}>
          <CompTickets performanceId={p.id} comps={detail.comps} />
        </Card>
      )}
    </AppShell>
  )
}
