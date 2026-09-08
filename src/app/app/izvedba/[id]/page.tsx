import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { accessMember } from '@/lib/app/access'
import { getPerformanceDetail } from '@/lib/app/detail-data'
import { APP_STRINGS, KIND_LABELS, ROLE_LABELS, formatPerformanceDate } from '@/lib/app/strings'
import { resolveAppViewer } from '@/lib/app/viewer'
import type { LineupView } from '@/lib/app/detail-loaders'
import type { ArmyTally, RosterPerson } from '@/lib/attendance/army-count'
import type { Army } from '@/lib/attendance/rules'
import { VENUE_LABEL } from '@/lib/venues'
import { AlarmButton } from '../../AlarmButton'
import { LineupEditor } from '../../LineupEditor'
import { AttendanceButtons } from '../../AttendanceButtons'
import { CompTickets } from '../../CompTickets'
import { ArmyMoveButton } from '../../ArmyMoveButton'
import { LogoutButton } from '../../LogoutButton'
import { NoteEditor } from '../../NoteEditor'

// `/app/izvedba/[id]` — one performance in full (#423, ADR-0024 phase 3).
//
// The question the page answers is "are we short?", so the armies come first,
// each with its headcount against the threshold, then the bula, then who is not
// coming, then who has not answered — which for a voditelj is a list of buttons
// rather than a list of names, because that list is what they work through on
// the phone (#419, story 11).
//
// Mobile numbers are `tel:` links (story 29); emails are not in the payload at
// all, by the shape of the loader.
//
// A voditelj's buttons hang off EVERY name, not only the no-answer list: the
// record has to be correctable in both directions (#419, story 13), so a dancer
// who is coming can be set to Ne dolazim or cleared from the same row.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function Person({ person }: { person: RosterPerson }) {
  return person.mobile ? (
    <a className="app__person-call" href={`tel:${person.mobile}`}>
      {person.nickname}
      <span className="app__person-mobile">{person.mobile}</span>
    </a>
  ) : (
    <span className="app__person-name">{person.nickname}</span>
  )
}

function ArmySection({
  title,
  tally,
  performanceId,
  moveTargets,
  army,
  canEditOthers,
}: {
  title: string
  tally: ArmyTally
  performanceId: string
  moveTargets: Record<string, Army[]>
  army: Army
  canEditOthers: boolean
}) {
  const other: Army = army === 'crni' ? 'bili' : 'crni'
  return (
    <section className="app__army">
      <h2 className="app__army-head">
        <span>{title}</span>
        <span className={`app__chip${tally.below ? ' app__chip--low' : ''}`}>
          {tally.count}/{tally.threshold}
        </span>
      </h2>
      {tally.members.length === 0 ? (
        <p className="app__empty">{APP_STRINGS.detail.empty}</p>
      ) : (
        <ul className="app__people">
          {tally.members.map((person) => (
            <li key={person.memberId} className="app__person">
              <Person person={person} />
              {canEditOthers && (
                <span className="app__person-controls">
                  {moveTargets[person.memberId]?.includes(other) && (
                    <ArmyMoveButton
                      performanceId={performanceId}
                      memberId={person.memberId}
                      target={other}
                    />
                  )}
                  <AttendanceButtons
                    performanceId={performanceId}
                    memberId={person.memberId}
                    current="coming"
                    scope="row"
                    allowClear
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PeopleSection({
  title,
  people,
  performanceId,
  withButtons,
  current = null,
}: {
  title: string
  people: RosterPerson[]
  performanceId: string
  withButtons: boolean
  /** The answer these people already gave, so the voditelj's buttons show it. */
  current?: 'coming' | 'not_coming' | null
}) {
  return (
    <section className="app__army">
      <h2 className="app__army-head">
        <span>{title}</span>
        <span className="app__chip">{people.length}</span>
      </h2>
      {people.length === 0 ? (
        <p className="app__empty">{APP_STRINGS.detail.empty}</p>
      ) : (
        <ul className="app__people">
          {people.map((person) => (
            <li key={person.memberId} className="app__person">
              <Person person={person} />
              {withButtons && (
                <AttendanceButtons
                  performanceId={performanceId}
                  memberId={person.memberId}
                  current={current}
                  scope="row"
                  allowClear
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The postava as a moreškant sees it: a list, no controls (#432, story 33).
 *
 * It renders only when the loader says the lineup is `visible`, which for a
 * dancer means confirmed — a draft never reaches this component with entries in
 * it, because the loader empties them (story 34).
 */
function LineupList({ lineup }: { lineup: LineupView }) {
  return (
    <section className="app__lineup">
      <h2 className="app__army-head">
        <span>{APP_STRINGS.lineup.title}</span>
        <span className="app__chip">{lineup.entries.length}</span>
      </h2>
      {lineup.entries.length === 0 ? (
        <p className="app__empty">{APP_STRINGS.lineup.emptyForDancer}</p>
      ) : (
        <ul className="app__people">
          {lineup.entries.map((entry) => (
            <li key={entry.memberId} className="app__person">
              <span className="app__person-name">{entry.nickname}</span>
              <span className="app__lineup-role">{ROLE_LABELS[entry.role]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function PerformanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const viewer = await resolveAppViewer()
  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') redirect('/app')

  const me = accessMember(viewer.access)
  const voditelj = viewer.access.kind === 'voditelj'
  const detail = await getPerformanceDetail(id, { memberId: me?.id ?? null, voditelj })
  if (!detail) notFound()

  const p = detail.performance
  const where = p.isPublic
    ? p.venue
      ? VENUE_LABEL.hr[p.venue]
      : ''
    : [p.location, p.client].filter(Boolean).join(' · ')

  return (
    <div className="app__shell">
      <header className="app__header">
        <div>
          <Link className="app__back" href="/app">
            {APP_STRINGS.detail.back}
          </Link>
          <h1 className="app__brand">{formatPerformanceDate(p.date)}</h1>
          <p className="app__identity">
            {p.time}
            {where && ` · ${where}`} · {p.cancelled ? APP_STRINGS.card.cancelled : KIND_LABELS[p.kind]}
          </p>
        </div>
        <LogoutButton />
      </header>

      {p.voditeljNote && (
        <p className="app__note app__note--detail">
          <span className="app__note-label">{APP_STRINGS.detail.note}</span>
          {p.voditeljNote}
        </p>
      )}

      {/* The voditelj edits the same note from here that /admin edits (#436,
          story 25); saving goes through the collection, so the roster gets the
          change notification either way. A moreškant only ever reads it. */}
      {detail.voditelj && <NoteEditor performanceId={p.id} initialNote={p.voditeljNote} />}

      {me && (
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
      )}

      {/* The alarm is only ever about an evening still ahead (#430, story 20),
          and the route refuses a started or cancelled one anyway; hiding the
          button keeps the page from offering what the server will decline.
          `canAlarm` is decided in the loader, over its own clock. */}
      {detail.canAlarm && <AlarmButton performanceId={p.id} />}

      {/* Besplatne karte (#434). The loader decides `visible` - a Member link,
          a public performance, not cancelled, still ahead - so the section is
          absent for a voditelj without a Member link and for every non-public
          evening, and the two routes refuse the same cases anyway. */}
      {detail.comps.visible && <CompTickets performanceId={p.id} comps={detail.comps} />}

      <ArmySection
        title={APP_STRINGS.detail.crni}
        tally={detail.count.crni}
        army="crni"
        performanceId={p.id}
        moveTargets={detail.moveTargets}
        canEditOthers={detail.canEditOthers}
      />
      <ArmySection
        title={APP_STRINGS.detail.bili}
        tally={detail.count.bili}
        army="bili"
        performanceId={p.id}
        moveTargets={detail.moveTargets}
        canEditOthers={detail.canEditOthers}
      />
      <PeopleSection
        title={APP_STRINGS.detail.bula}
        people={detail.count.bula}
        performanceId={p.id}
        withButtons={detail.canEditOthers}
        current="coming"
      />
      <PeopleSection
        title={APP_STRINGS.detail.notComing}
        people={detail.count.notComing}
        performanceId={p.id}
        withButtons={detail.canEditOthers}
        current="not_coming"
      />
      <PeopleSection
        title={APP_STRINGS.detail.noAnswer}
        people={detail.count.noAnswer}
        performanceId={p.id}
        withButtons={detail.canEditOthers}
      />

      {/* Postava (#432). A voditelj gets the editor, confirmed or not — it
          renders read-only when confirmed and offers Otključaj. A moreškant
          gets a plain list, and only of a CONFIRMED lineup: the loader has
          already emptied a draft, so no condition here can leak one. */}
      {detail.voditelj ? (
        <LineupEditor
          performanceId={p.id}
          initialEntries={detail.lineup.entries}
          suggested={detail.lineup.suggested}
          roster={detail.lineup.roster}
          confirmed={detail.lineup.confirmed}
          confirmedAt={detail.lineup.confirmedAt}
        />
      ) : (
        <LineupList lineup={detail.lineup} />
      )}
    </div>
  )
}
