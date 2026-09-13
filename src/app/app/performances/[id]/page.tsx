import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can } from '@/lib/access/permissions'
import { getPerformanceDetail } from '@/lib/app/detail-data'
import { loadPerformanceSales } from '@/lib/app/sales-data'
import {
  mayOpenPerformance,
  performanceNumbers,
  salesBadges,
  showsRosterHalf,
  ticketedSeats,
} from '@/lib/app/sales-view'
import {
  compUnavailableReason,
  formatConfirmedAt,
  groupLineupByRole,
  parseSegment,
  type DetailSegment,
} from '@/lib/app/detail-view'
import { performancePlace } from '@/lib/app/performance-place'
import {
  APP_STRINGS,
  KIND_LABELS,
  ROLE_LABELS,
  formatPerformanceDateLong,
} from '@/lib/app/strings'
import { SELF_COMP_CAP } from '@/lib/comp/self-comp'
import type { NonPublicKind } from '@/lib/performance-input'
import type { LineupView, PerformanceDetail } from '@/lib/app/detail-loaders'
import type { ArmyTally, RosterPerson } from '@/lib/attendance/army-count'
import type { Army } from '@/lib/attendance/rules'
import { AlarmButton } from '../../AlarmButton'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { LineupEditor } from '../../LineupEditor'
import { AttendanceButtons } from '../../AttendanceButtons'
import { CompTickets } from '../../CompTickets'
import { ArmyMoveButton } from '../../ArmyMoveButton'
import { NoteEditor } from '../../NoteEditor'
import { PerformanceEditor, PublicPerformanceEditor } from '../../PerformanceForm'
import { ThresholdEditor } from '../../ThresholdEditor'
import { DetailSegments } from './DetailSegments'
import { PerformanceActions } from './PerformanceActions'

// `/app/performances/[id]` — one evening, in three segments (#423, #457, ADR-0024).
//
// The old page stacked everything a performance has onto one scroll: the
// headcounts, the postava, the free tickets, the voditelj's controls. That is
// four questions in a column, and the one a dancer actually opens the page with
// ("are we short, and am I dancing") was the one they had to scroll for. It is
// now three segments — Dolaze, Postava, Ulaznice — with the answer buttons
// pinned above the tab bar, so the tap the page exists for is always under the
// thumb whichever segment is open.
//
// Everything below is server-rendered and handed to `DetailSegments` as
// children; that component only chooses which of the three is on screen. The
// voditelj's tools are one card at the bottom, because they are the rarer job
// and they belong to the evening rather than to any one segment.
//
// A voditelj's answer buttons hang off EVERY name, not only the no-answer list:
// the record has to be correctable in both directions (#419, story 13). Mobile
// numbers are a `tel:` link on a round call button and nothing else is printed;
// emails are not in the payload at all, by the shape of the loader.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PHONE_ICON = (
  <svg className="app__call-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </svg>
)

/** One name, with the call button when there is a number to call. */
function PersonRow({
  person,
  isMe,
  children,
}: {
  person: RosterPerson
  isMe: boolean
  /** The voditelj's controls, on their own line under the name. */
  children?: React.ReactNode
}) {
  return (
    <li className={`app__person${isMe ? ' app__person--me' : ''}`}>
      <span className="app__person-line">
        <span className="app__person-name">{person.nickname}</span>
        {person.mobile && (
          <a
            className="app__call"
            href={`tel:${person.mobile}`}
            aria-label={APP_STRINGS.detail.callAria(person.nickname)}
          >
            {PHONE_ICON}
          </a>
        )}
      </span>
      {children && <span className="app__person-controls">{children}</span>}
    </li>
  )
}

/**
 * One group of the Dolaze panel.
 *
 * An army shows `count/threshold` and turns red below it; the other three show
 * a plain number, because there is no threshold for "who said no". An empty
 * group keeps its heading and says so in one muted word: the shape of the
 * evening is the five groups, and hiding the empty ones would make a screen
 * whose sections move around.
 */
function Group({
  title,
  swatch,
  tally,
  people,
  emptyLabel,
  performanceId,
  myMemberId,
  canEditOthers,
  moveTargets,
  army,
  current,
}: {
  title: string
  swatch?: Army
  /** Set for an army: the heading then reads "3/8" and can go red. */
  tally?: ArmyTally
  people: RosterPerson[]
  emptyLabel: string
  performanceId: string
  myMemberId: string | null
  canEditOthers: boolean
  moveTargets: Record<string, Army[]>
  /** The army these people are in, so the move button knows the other one. */
  army?: Army
  /** The answer they already gave, so the voditelj's buttons show it. */
  current: 'coming' | 'not_coming' | null
}) {
  const other: Army | null = army ? (army === 'crni' ? 'bili' : 'crni') : null
  return (
    <section className="app__group">
      <h2 className="app__group-head">
        <span>
          {swatch && <i className={`app__swatch app__swatch--${swatch}`} aria-hidden="true" />}
          {title}
        </span>
        <span className={tally?.below ? 'app__group-count app__group-count--low' : 'app__group-count'}>
          {tally ? `${tally.count}/${tally.threshold}` : people.length}
        </span>
      </h2>
      {people.length === 0 ? (
        <p className="app__group-empty">{emptyLabel}</p>
      ) : (
        <ul className="app__people">
          {people.map((person) => (
            <PersonRow
              key={person.memberId}
              person={person}
              isMe={person.memberId === myMemberId}
            >
              {canEditOthers && (
                <>
                  {other && moveTargets[person.memberId]?.includes(other) && (
                    <ArmyMoveButton
                      performanceId={performanceId}
                      memberId={person.memberId}
                      target={other}
                    />
                  )}
                  <AttendanceButtons
                    performanceId={performanceId}
                    memberId={person.memberId}
                    current={current}
                    scope="row"
                    allowClear
                  />
                </>
              )}
            </PersonRow>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The Dolaze panel: the five groups, in the order a voditelj works through them. */
function ComingPanel({ detail }: { detail: PerformanceDetail }) {
  const { count } = detail
  const shared = {
    performanceId: detail.performance.id,
    myMemberId: detail.myMemberId,
    canEditOthers: detail.canEditOthers,
    moveTargets: detail.moveTargets,
  }
  const nothing =
    count.crni.count === 0 &&
    count.bili.count === 0 &&
    count.bula.length === 0 &&
    count.notComing.length === 0

  return (
    <>
      {/* Not "there is nobody": nobody has said anything yet, which is a thing
          the first dancer to open the page can fix in one tap. */}
      {nothing && (
        <div className="app__empty-state">
          <b>{APP_STRINGS.detail.noAnswersTitle}</b>
          {APP_STRINGS.detail.noAnswersBody}
        </div>
      )}

      <Group
        {...shared}
        title={APP_STRINGS.detail.crni}
        swatch="crni"
        army="crni"
        tally={count.crni}
        people={count.crni.members}
        emptyLabel={APP_STRINGS.detail.nobody}
        current="coming"
      />
      <Group
        {...shared}
        title={APP_STRINGS.detail.bili}
        swatch="bili"
        army="bili"
        tally={count.bili}
        people={count.bili.members}
        emptyLabel={APP_STRINGS.detail.nobody}
        current="coming"
      />
      <Group
        {...shared}
        title={APP_STRINGS.detail.bula}
        people={count.bula}
        emptyLabel={APP_STRINGS.detail.nobody}
        current="coming"
      />
      <Group
        {...shared}
        title={APP_STRINGS.detail.notComing}
        people={count.notComing}
        emptyLabel={APP_STRINGS.detail.nobody}
        current="not_coming"
      />
      <Group
        {...shared}
        title={APP_STRINGS.detail.noAnswer}
        people={count.noAnswer}
        emptyLabel={APP_STRINGS.detail.allAnswered}
        current={null}
      />
    </>
  )
}

/**
 * The Postava panel as a dancer sees it: a list by role, no controls (#432,
 * story 33).
 *
 * The loader empties a draft before it ever reaches this component, so an
 * unconfirmed evening cannot leak a name; the `confirmed` check here is about
 * WORDING, not about access.
 */
function LineupPanel({ lineup, myMemberId }: { lineup: LineupView; myMemberId: string | null }) {
  if (!lineup.confirmed) {
    return (
      <div className="app__empty-state">
        <b>{APP_STRINGS.lineup.notConfirmedTitle}</b>
        {APP_STRINGS.lineup.notConfirmedBody}
      </div>
    )
  }

  const when = formatConfirmedAt(lineup.confirmedAt)
  return (
    <>
      {when && <p className="app__lineup-confirmed">{APP_STRINGS.lineup.confirmedAt(when)}</p>}
      {groupLineupByRole(lineup.entries).map((group) => (
        <section className="app__group" key={group.role}>
          <h2 className="app__group-head">
            <span>{ROLE_LABELS[group.role]}</span>
            <span className="app__group-count">{group.entries.length}</span>
          </h2>
          {group.entries.length === 0 ? (
            <p className="app__group-empty">{APP_STRINGS.lineup.unassigned}</p>
          ) : (
            <ul className="app__people">
              {group.entries.map((entry) => (
                <li
                  key={entry.memberId}
                  className={`app__person${entry.memberId === myMemberId ? ' app__person--me' : ''}`}
                >
                  <span className="app__person-line">
                    <span className="app__person-name">{entry.nickname}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  )
}

/** The Ulaznice panel: the dancer's own four free seats, or why there are none. */
function TicketsPanel({
  detail,
  nowMs,
}: {
  detail: PerformanceDetail
  nowMs: number
}) {
  if (detail.comps.visible) {
    return <CompTickets performanceId={detail.performance.id} comps={detail.comps} />
  }

  const reason = compUnavailableReason(detail.performance, detail.myMemberId, nowMs)
  const sentence =
    reason === 'private'
      ? APP_STRINGS.comp.privateNoTickets
      : reason === 'cancelled'
        ? APP_STRINGS.answer.cancelled
        : reason === 'past'
          ? APP_STRINGS.comp.past
          : APP_STRINGS.comp.noMemberShort

  return (
    <div className="app__empty-state">
      <b>{APP_STRINGS.comp.title}</b>
      {sentence}
    </div>
  )
}

export default async function PerformanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const { dio } = await searchParams
  const { viewer, refusal } = await openScreen('performances')
  if (refusal) return refusal

  const me = viewer.me
  const voditelj = viewer.voditelj
  const blagajna = can({ permissions: viewer.permissions }, 'tickets')
  const detail = await getPerformanceDetail(id, { memberId: me?.id ?? null, voditelj })
  if (!detail) notFound()

  const p = detail.performance

  // The blagajna's half (#502): this is where the old `/admin/stats/[id]`
  // drill-down lands. Only for a public evening, because a booking sells
  // nothing, and only for a `tickets` holder, because the numbers are seats and
  // money rather than a headcount.
  const sales = blagajna && p.isPublic ? await loadPerformanceSales(p.id) : null
  // Whether the roster half belongs on this screen at all. A blagajna account
  // that neither leads nor dances would otherwise read three segments about a
  // postava it has no part in, two of them empty (#476: one screen, content by
  // `can()`). The list applies the same rule to decide which evenings it shows.
  const roster = showsRosterHalf(voditelj, me != null)

  // A blagajna account that neither leads nor dances is not shown a booking in
  // the list, so it must not reach one by typing an id either (#502 review):
  // this page prints the client and the voditelj's note, which are roster facts
  // about an evening that sells nothing.
  if (!mayOpenPerformance({ roster, isPublic: p.isPublic })) notFound()
  const segment: DetailSegment = parseSegment(typeof dio === 'string' ? dio : undefined)
  const place = performancePlace(p)
  // A public evening is named by its kind; a booking is named by who booked it,
  // because "Brod" alone is three different evenings in one season.
  const title = !p.isPublic && p.client ? `${KIND_LABELS[p.kind]}, ${p.client}` : KIND_LABELS[p.kind]

  const coming = detail.count.crni.count + detail.count.bili.count + detail.count.bula.length
  const counts: Record<DetailSegment, string> = {
    dolaze: String(coming),
    // `visible` is "confirmed, or the voditelj's own draft": exactly the case
    // where there is a list to count. A dancer waiting on the postava gets a
    // dash, not a zero, because zero would read as "nobody is dancing".
    postava: detail.lineup.visible
      ? String(detail.lineup.entries.length)
      : APP_STRINGS.detail.noCount,
    ulaznice: detail.comps.visible
      ? `${detail.comps.issued}/${SELF_COMP_CAP}`
      : APP_STRINGS.detail.noCount,
  }

  const answerChip =
    p.myAnswer === 'coming'
      ? { cls: 'app__chip--yes', label: APP_STRINGS.home.answerYes }
      : p.myAnswer === 'not_coming'
        ? { cls: 'app__chip--no', label: APP_STRINGS.home.answerNo }
        : { cls: 'app__chip--none', label: APP_STRINGS.home.answerNone }

  const intro = (
    <header className="app__detail-head">
      <Link className="app__back" href="/app/performances">
        ‹ {APP_STRINGS.detail.back}
      </Link>
      <p className="app__detail-when">
        {formatPerformanceDateLong(p.date)}
        {p.time && ` · ${p.time}`}
      </p>
      {place && <p className="app__detail-where">{place}</p>}

      <div className="app__chips">
        {me && <span className={`app__chip ${answerChip.cls}`}>{answerChip.label}</span>}
        {p.myArmy && (
          <span className="app__chip">
            {p.myArmy === 'crni' ? APP_STRINGS.home.armyCrni : APP_STRINGS.home.armyBili}
          </span>
        )}
        {p.cancelled && (
          <span className="app__chip app__chip--cancelled">{APP_STRINGS.card.cancelled}</span>
        )}
        {detail.lineup.confirmed && (
          <span className="app__chip app__chip--lineup">{APP_STRINGS.home.lineupConfirmed}</span>
        )}
        {/* Paused, moved, rescheduled: facts about the SALE, so they only ever
            reach a `tickets` holder, and `Otkazano` is already a chip above. */}
        {sales &&
          salesBadges(sales)
            .filter((b) => b.key !== 'cancelled')
            .map((b) => (
              <span className={`app__chip app__flag--${b.key}`} key={b.key}>
                {b.label}
              </span>
            ))}
      </div>

      {p.voditeljNote && (
        <p className="app__note app__note--detail">
          <span className="app__note-label">{APP_STRINGS.detail.note}</span>
          {p.voditeljNote}
        </p>
      )}
    </header>
  )

  return (
    <AppShell viewer={viewer} screen="performances" title={title} intro={intro}>
      {/* Prodaja, first, for a `tickets` holder (#502): the numbers this
          evening is judged by, then Uredi, then the named actions. Above the
          roster segments rather than inside them, because it belongs to the
          evening as a whole and because it is the reason the blagajna opened
          the page at all. */}
      {sales && (
        <section className="app__sales">
          <h2 className="app__sales-head">{APP_STRINGS.sales.title}</h2>
          <dl className="app__sales-numbers">
            {performanceNumbers(sales, can({ permissions: viewer.permissions }, 'finance')).map(
              (line) => (
                <div className="app__sales-number" key={line.label}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ),
            )}
          </dl>
          {!p.cancelled && (
            <PublicPerformanceEditor
              performanceId={p.id}
              venueLocked={ticketedSeats(sales) > 0}
              initial={{
                kind: p.kind,
                date: p.date,
                time: p.time,
                venue: p.venue ?? 'ljetno-kino',
              }}
            />
          )}
          <PerformanceActions
            performanceId={p.id}
            paused={sales.paused}
            cancelled={sales.cancelled}
            atLjetno={sales.venue === 'ljetno-kino' && !sales.moved}
            canRefund={can({ permissions: viewer.permissions }, 'refunds')}
          />
        </section>
      )}

      {blagajna && !p.isPublic && (
        <p className="app__lead-note">{APP_STRINGS.sales.notPublic}</p>
      )}

      {roster && (
      <DetailSegments
        initial={segment}
        counts={counts}
        dolaze={<ComingPanel detail={detail} />}
        postava={
          detail.voditelj ? (
            // No hint above it (#457 review): the editor already prints
            // `lineup.draftNote` for an unconfirmed postava, and a second line
            // saying the same thing read as two different warnings.
            <LineupEditor
              performanceId={p.id}
              initialEntries={detail.lineup.entries}
              suggested={detail.lineup.suggested}
              roster={detail.lineup.roster}
              confirmed={detail.lineup.confirmed}
              confirmedAt={detail.lineup.confirmedAt}
            />
          ) : (
            <LineupPanel lineup={detail.lineup} myMemberId={detail.myMemberId} />
          )
        }
        ulaznice={<TicketsPanel detail={detail} nowMs={detail.nowMs} />}
        tools={
          detail.voditelj ? (
            <>
              {/* The same note `/admin` edits (#436, story 25): saving goes
                  through the collection, so the roster is notified either way. */}
              <NoteEditor performanceId={p.id} initialNote={p.voditeljNote} />
              {/* The two army thresholds (#503). On EVERY row, public one
                  included: how many crni and bili an evening needs is a fact
                  about the dance, and the collection's own field access says
                  the same (`canEditRosterField` never asks about the row). */}
              <ThresholdEditor
                performanceId={p.id}
                crni={p.thresholdCrni}
                bili={p.thresholdBili}
              />
              {/* Uredi and Otkaži, for a booking only (#503). A public evening
                  gets the sentence instead of the controls: moving or
                  cancelling one reaches ticket holders, and that is the
                  blagajna's action (#497), not a harder version of this one.
                  Unless the reader IS the blagajna (#502), in which case the
                  controls are in the Prodaja card above and the sentence would
                  point them at themselves. */}
              {p.isPublic ? (
                blagajna ? null : (
                  <p className="app__lead-note">{APP_STRINGS.performance.publicRow}</p>
                )
              ) : (
                <PerformanceEditor
                  performanceId={p.id}
                  cancelled={p.cancelled}
                  initial={{
                    kind: (p.kind === 'redovna' ? 'ostalo' : p.kind) as NonPublicKind,
                    date: p.date,
                    time: p.time,
                    location: p.location ?? '',
                    client: p.client ?? '',
                  }}
                />
              )}
              {/* The alarm is only ever about an evening still ahead (#430,
                  story 20); the route refuses the other two cases anyway, so a
                  hidden button is replaced by the reason it is hidden. */}
              {detail.canAlarm ? (
                <AlarmButton performanceId={p.id} />
              ) : (
                <p className="app__lead-note">
                  {p.cancelled ? APP_STRINGS.alarm.cancelled : APP_STRINGS.alarm.started}
                </p>
              )}
            </>
          ) : undefined
        }
        lineupState={
          detail.voditelj
            ? detail.lineup.confirmed
              ? APP_STRINGS.lead.lineupConfirmed(detail.lineup.entries.length)
              : APP_STRINGS.lead.lineupDraft(coming, detail.count.noAnswer.length)
            : null
        }
      />
      )}

      {me && (
        <>
          {/* The sticky bar covers the bottom of the scroll; without this the
              last group of the longest panel would sit under it. It is inside
              the same condition as the bar (#457 review): a viewer with no
              Member row gets no bar, so they must not get its hole either, and
              it is sized for the TALLEST variant (two buttons, the voditelj's
              Poništi row and a lock note) rather than the shortest. */}
          <div className="app__sticky-spacer" aria-hidden="true" />
          <div className="app__sticky">
            <AttendanceButtons
              performanceId={p.id}
              memberId={me.id}
              current={p.myAnswer}
              disabled={!p.canAnswer}
              lockNote={
                p.canAnswer
                  ? null
                  : p.cancelled
                    ? APP_STRINGS.answer.cancelled
                    : APP_STRINGS.answer.locked
              }
              allowClear={voditelj}
            />
          </div>
        </>
      )}
    </AppShell>
  )
}
