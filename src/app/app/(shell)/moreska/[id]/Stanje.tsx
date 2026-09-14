'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'
import { MAX_THRESHOLD } from '@/lib/app/performance-form'
import { assignTitle, type DanceTitle } from '@/lib/lineup/titles'
import { LINEUP_ROLE_LABELS } from '@/lib/moreskant-profile'
import type { StanjeColumn, StanjePerson, StanjeView } from '@/lib/app/stanje-screen'
import { ALL_TITLES } from '@/lib/app/stanje-screen'
import { ArmyBar, Button, Card, Chip, Note, RoleMark, Section, Sheet, SheetOption } from '../../../ui'

// Stanje's one client island (#566): the two columns, the sheets, the voditelj's
// bar.
//
// Everything it draws is decided on the server (`lib/app/stanje-screen.ts`);
// what lives here is the taps, and there are exactly six writes behind them,
// every one of them through a route that already existed:
//
//   answer / move   POST /api/app/attendance      (the one writer of a row)
//   title           POST /api/app/lineup          (an UNCONFIRMED replace)
//   confirm         POST /api/app/lineup, then    /api/app/lineup/confirm
//   thresholds      POST /api/app/performances/[id]/thresholds
//   alarm           POST /api/app/alarm
//
// **Nothing here is optimistic.** Every landed write calls `router.refresh()`
// and the server counts again: the columns, the ArmyBar and the title tally are
// three views of the same numbers, and a browser that guessed one of them would
// be the only place they could disagree. The trade the answer buttons on
// Moreška make (a two-state toggle, guessed right nearly always) does not apply
// to a screen where one tap moves a crown off somebody else's name.
//
// **Potvrdi writes the postava before it confirms it.** The titles are stored
// the moment they are given, but the plain rows under them are derived from the
// answers, and answers keep arriving: saving the list as it stands on screen
// and confirming that is the only way the confirmed postava is the evening the
// voditelj was looking at. The four-title rule is re-checked on the server
// under the row lock anyway, so the disabled button is a courtesy and the 400
// is the rule.
//
// A dancer reads the same screen with no bar and no sheets on the names: the
// routes refuse them all anyway (`requirePermission(req, 'moreska')`), so the
// missing controls are honesty about what this account can do, never the lock.

const S = APP_STRINGS.stanje

interface Busy {
  /** What is in flight, so one sheet can be saving while the rest is readable. */
  what: string | null
  error: string | null
}

export function Stanje({
  view,
  voditelj,
  canAlarm,
}: {
  view: StanjeView
  voditelj: boolean
  canAlarm: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Busy>({ what: null, error: null })
  const [person, setPerson] = useState<StanjePerson | null>(null)
  const [list, setList] = useState<'noAnswer' | 'notComing' | null>(null)
  const [calling, setCalling] = useState(false)
  const [, startTransition] = useTransition()

  /** One POST, one refresh, one sentence when it fails. */
  async function send(
    what: string,
    url: string,
    body: unknown,
  ): Promise<Record<string, unknown> | null> {
    if (busy.what) return null
    setBusy({ what, error: null })
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok) {
        setBusy({ what: null, error: (payload?.error as string) ?? S.failed })
        return null
      }
      setBusy({ what: null, error: null })
      startTransition(() => router.refresh())
      return payload ?? {}
    } catch {
      setBusy({ what: null, error: S.failed })
      return null
    }
  }

  async function answerFor(memberId: string, status: 'coming' | 'not_coming' | 'clear') {
    const ok = await send('answer', '/api/app/attendance', {
      performanceId: view.id,
      memberId,
      status,
    })
    if (ok) setPerson(null)
  }

  async function moveTo(memberId: string, army: 'crni' | 'bili') {
    // The same answer route with an army on it: there is no second writer of an
    // attendance row (#422), and the army is read only from a voditelj.
    const ok = await send('move', '/api/app/attendance', {
      performanceId: view.id,
      memberId,
      status: 'coming',
      army,
    })
    if (ok) setPerson(null)
  }

  async function giveTitle(memberId: string, title: DanceTitle | null) {
    const ok = await send('title', '/api/app/lineup', {
      performanceId: view.id,
      entries: assignTitle(view.lineup, { memberId, title }),
    })
    if (ok) setPerson(null)
  }

  async function confirmLineup() {
    // The list first, the flag second: see the note at the top of the file.
    const saved = await send('confirm', '/api/app/lineup', {
      performanceId: view.id,
      entries: view.lineup,
    })
    if (!saved) return
    await send('confirm', '/api/app/lineup/confirm', {
      performanceId: view.id,
      confirmed: true,
    })
  }

  async function unlockLineup() {
    await send('confirm', '/api/app/lineup/confirm', { performanceId: view.id, confirmed: false })
  }

  // A voditelj may correct an answer at any time, cancelled or long past (#419,
  // story 13), so the names stay tappable once the postava is confirmed. What
  // the sheet stops offering then is the TITLES: a confirmed postava changes
  // only after Otključaj, which is what the replace route's 409 says too.
  const tap = voditelj ? setPerson : null

  return (
    <div className="app__stanje">
      <ArmyBar
        crni={view.armies.crni}
        bili={view.armies.bili}
        threshold={view.armies.threshold}
        className="app__stanje-bar"
      />

      <div className="app__armies">
        {view.columns.map((col) => (
          <ArmyColumn key={col.army} column={col} onPick={tap} />
        ))}
      </div>

      {/* The bula is in neither army and counts towards no threshold, so she
          has a card rather than a third column (glossary: *Army count*). */}
      <Card className="app__bule">
        <Section title={S.bule} aside={String(view.bule.length)} />
        {view.bule.length === 0 ? (
          <p className="app__stanje-empty">{S.nobody}</p>
        ) : (
          <div className="app__stanje-names">
            {view.bule.map((p) => (
              <Name key={p.memberId} person={p} onPick={tap} />
            ))}
          </div>
        )}
      </Card>

      {/* Odustali, ABOVE Bez odgovora and open rather than behind a chevron
          (#609). These are the places the voditelj thought were filled, so the
          screen states them; "nobody has said anything yet" can wait behind a
          tap the way it always has. */}
      {view.withdrawn.length > 0 && (
        <Card className="app__withdrawn">
          <Section title={S.withdrawn} aside={String(view.withdrawn.length)} />
          <div className="app__stanje-names">
            {view.withdrawn.map((p) => (
              <WithdrawnName key={p.memberId} person={p} onPick={tap} />
            ))}
          </div>
        </Card>
      )}

      <div className="app__stanje-rows">
        <RosterRow
          label={S.noAnswer}
          count={view.noAnswer.length}
          onClick={() => setList('noAnswer')}
        />
        {view.notComing.length > 0 && (
          <RosterRow
            label={S.notComing}
            count={view.notComing.length}
            onClick={() => setList('notComing')}
          />
        )}
      </div>

      {busy.error && <p className="app__answer-error">{busy.error}</p>}

      {voditelj && (
        <div className="app__stanje-actions">
          <p className="app__stanje-tally">
            {S.titles(view.titlesGiven, ALL_TITLES)}
          </p>
          <div className="ui-btns">
            <Button variant="ghost" onClick={() => setCalling(true)}>
              {S.call}
            </Button>
            {view.confirmed ? (
              <Button
                variant="ghost"
                disabled={busy.what === 'confirm'}
                onClick={() => void unlockLineup()}
              >
                {busy.what === 'confirm' ? S.unlocking : S.unlock}
              </Button>
            ) : (
              <Button
                variant="primary"
                check
                disabled={busy.what === 'confirm' || view.titlesGiven < ALL_TITLES}
                onClick={() => void confirmLineup()}
              >
                {busy.what === 'confirm' ? S.confirming : S.confirm}
              </Button>
            )}
          </div>
          {/* The reason, where the refusal would be: the route says the same
              thing in its own words, so a disabled button is never a mystery. */}
          {!view.confirmed && view.titlesGiven < ALL_TITLES && (
            <p className="app__stanje-why">{S.needTitles}</p>
          )}
          {view.confirmed && <p className="app__stanje-why">{S.confirmedNote}</p>}
        </div>
      )}

      <PersonSheet
        person={person}
        locked={view.confirmed}
        onClose={() => setPerson(null)}
        busy={busy.what}
        onAnswer={answerFor}
        onMove={moveTo}
        onTitle={giveTitle}
      />

      <Sheet
        open={list !== null}
        title={list === 'notComing' ? S.notComing : S.noAnswer}
        onClose={() => setList(null)}
      >
        <div className="app__stanje-sheet-list">
          {(list === 'notComing' ? view.notComing : view.noAnswer).map((p) =>
            tap ? (
              <SheetOption
                key={p.memberId}
                lead={<RoleMark army={p.army} title={p.title} small />}
                onClick={() => {
                  setList(null)
                  setPerson(p)
                }}
              >
                {p.nickname}
              </SheetOption>
            ) : (
              <div className="app__stanje-sheet-name" key={p.memberId}>
                <RoleMark army={p.army} title={p.title} small />
                {p.nickname}
              </div>
            ),
          )}
          {(list === 'notComing' ? view.notComing : view.noAnswer).length === 0 && (
            <p className="app__stanje-empty">{S.nobody}</p>
          )}
        </div>
      </Sheet>

      {voditelj && (
        <CallSheet
          open={calling}
          onClose={() => setCalling(false)}
          view={view}
          canAlarm={canAlarm}
          busy={busy.what}
          onThresholds={(crni, bili) =>
            send('thresholds', `/api/app/performances/${view.id}/thresholds`, { crni, bili })
          }
          onAlarm={(includeNotComing) =>
            send('alarm', '/api/app/alarm', { performanceId: view.id, includeNotComing })
          }
        />
      )}
    </div>
  )
}

/** One army: its head, its names and the places it is still short. */
function ArmyColumn({
  column,
  onPick,
}: {
  column: StanjeColumn
  onPick: ((person: StanjePerson) => void) | null
}) {
  return (
    <Card className={`app__army app__army--${column.army}`}>
      <div className="app__army-head">
        <span className="app__army-name">{column.label}</span>
        <span className={`app__army-count${column.below ? ' app__army-count--low' : ''}`}>
          {column.head}
        </span>
      </div>
      <div className="app__stanje-names">
        {column.people.map((person) => (
          <Name key={person.memberId} person={person} onPick={onPick} />
        ))}
        {column.slots.map((slot) => (
          <span className="app__slot" key={slot}>
            {slot}
          </span>
        ))}
      </div>
    </Card>
  )
}

/**
 * A mark and a nickname: a button for a voditelj, a plain line for a dancer.
 *
 * The "bez odgovora" chip is the one thing a name can say about itself here: it
 * stands in this column because the POSTAVA says so, not because they answered
 * (#581 review). The column's own count leaves them out, so without the chip
 * the names would silently outnumber the head.
 */
function Name({
  person,
  onPick,
}: {
  person: StanjePerson
  onPick: ((person: StanjePerson) => void) | null
}) {
  const inside = (
    <>
      <RoleMark army={person.army} title={person.title} small />
      <span className="app__name-body">
        <span className="app__name-text">{person.nickname}</span>
        {person.noAnswer && <Chip tone="plain">{S.noAnswerChip}</Chip>}
      </span>
    </>
  )
  if (!onPick) return <span className="app__name">{inside}</span>
  return (
    <button type="button" className="app__name app__name--tap" onClick={() => onPick(person)}>
      {inside}
    </button>
  )
}

/**
 * One name on Odustali, with the hour under it (#609).
 *
 * The line says WHO recorded it as much as when: "odustao u 19:40" is a dancer
 * who went quiet, "voditelj upisao u 19:40" is one who phoned somebody. The
 * disc is blank here on purpose — a title belongs to a postava row, and
 * somebody who is not coming has already been taken off it.
 */
function WithdrawnName({
  person,
  onPick,
}: {
  person: StanjePerson
  onPick: ((person: StanjePerson) => void) | null
}) {
  const when = person.withdrewAt ?? ''
  const inside = (
    <>
      <RoleMark army={person.army} title={person.title} small />
      <span className="app__withdrawn-body">
        <b>{person.nickname}</b>
        <span className="app__withdrawn-when">
          {person.withdrewOwn === false ? S.withdrewByVoditelj(when) : S.withdrewSelf(when)}
        </span>
      </span>
    </>
  )

  if (!onPick) return <span className="app__name app__withdrawn-name">{inside}</span>

  return (
    <button
      type="button"
      className="app__name app__name--tap app__withdrawn-name"
      onClick={() => onPick(person)}
    >
      {inside}
    </button>
  )
}

/** "Bez odgovora · 4", and what it opens. */
function RosterRow({
  label,
  count,
  onClick,
}: {
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button type="button" className="app__stanje-row" onClick={onClick}>
      <span>
        {label} · {count}
      </span>
      <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

/**
 * One person, and everything a voditelj may do about them tonight (Q34).
 *
 * The answer first, because it is the reason a name is tapped most often; the
 * army move next, only for a dancer whose profile covers both sides; the titles
 * last, and only the ones this column may hold. Each title has exactly one
 * holder, so tapping one takes it off whoever had it — which is why the options
 * are a list of states rather than a set of switches.
 */
function PersonSheet({
  person,
  locked,
  onClose,
  busy,
  onAnswer,
  onMove,
  onTitle,
}: {
  person: StanjePerson | null
  /** The postava is confirmed: the answers stay editable, the titles do not. */
  locked: boolean
  onClose: () => void
  busy: string | null
  onAnswer: (memberId: string, status: 'coming' | 'not_coming' | 'clear') => void
  onMove: (memberId: string, army: 'crni' | 'bili') => void
  onTitle: (memberId: string, title: DanceTitle | null) => void
}) {
  if (!person) return <Sheet open={false} onClose={onClose}>{null}</Sheet>

  return (
    <Sheet open title={person.nickname} onClose={onClose}>
      <Section title={S.answerFor} />
      <SheetOption
        on={person.answer === 'coming'}
        disabled={busy != null}
        onClick={() => onAnswer(person.memberId, 'coming')}
      >
        {APP_STRINGS.answer.coming}
      </SheetOption>
      <SheetOption
        on={person.answer === 'not_coming'}
        disabled={busy != null}
        onClick={() => onAnswer(person.memberId, 'not_coming')}
      >
        {APP_STRINGS.answer.notComing}
      </SheetOption>
      {person.answer && (
        <SheetOption disabled={busy != null} onClick={() => onAnswer(person.memberId, 'clear')}>
          {S.clear}
        </SheetOption>
      )}

      {person.moveTo && (
        <SheetOption
          disabled={busy != null}
          onClick={() => onMove(person.memberId, person.moveTo!)}
        >
          {APP_STRINGS.detail.moveTo(person.moveTo)}
        </SheetOption>
      )}

      {person.titles.length > 0 && !locked && (
        <>
          <Section title={S.titleFor} />
          {person.titles.map((title) => (
            <SheetOption
              key={title}
              on={person.title === title}
              lead={<RoleMark army={person.army} title={title} small />}
              disabled={busy != null}
              onClick={() => onTitle(person.memberId, title)}
            >
              {LINEUP_ROLE_LABELS[title]}
            </SheetOption>
          ))}
          <SheetOption
            on={person.title === null}
            disabled={busy != null}
            onClick={() => onTitle(person.memberId, null)}
          >
            {S.noTitle}
          </SheetOption>
        </>
      )}
    </Sheet>
  )
}

/**
 * Pozovi: the alarm and the two thresholds, in one sheet (Q35).
 *
 * They belong together because they are the same decision looked at from two
 * sides: "how many do we need tonight" and "ring the ones who have not
 * answered". The message is shown before it is sent, and it is the same string
 * the sender builds, so the preview cannot promise a sentence the phones will
 * not get.
 */
function CallSheet({
  open,
  onClose,
  view,
  canAlarm,
  busy,
  onThresholds,
  onAlarm,
}: {
  open: boolean
  onClose: () => void
  view: StanjeView
  canAlarm: boolean
  busy: string | null
  onThresholds: (crni: number, bili: number) => Promise<Record<string, unknown> | null>
  onAlarm: (includeNotComing: boolean) => Promise<Record<string, unknown> | null>
}) {
  const [crni, setCrni] = useState(view.armies.threshold.crni)
  const [bili, setBili] = useState(view.armies.threshold.bili)
  const [includeNotComing, setIncludeNotComing] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  const dirty = crni !== view.armies.threshold.crni || bili !== view.armies.threshold.bili

  return (
    <Sheet
      open={open}
      title={S.callTitle}
      onClose={onClose}
      footer={
        canAlarm ? (
          <Button
            variant="primary"
            disabled={busy != null}
            onClick={() =>
              void onAlarm(includeNotComing).then((body) => {
                if (!body) return
                // How many DEVICES rang, which is the only honest answer to
                // "will anyone hear this" (#430, story 24).
                const people = Number(body.people ?? 0)
                const delivered = Number(body.delivered ?? 0)
                setSent(
                  people === 0
                    ? APP_STRINGS.alarm.noRecipients
                    : delivered === 0
                      ? APP_STRINGS.alarm.noDevices
                      : APP_STRINGS.alarm.sent(delivered),
                )
              })
            }
          >
            {busy === 'alarm' ? APP_STRINGS.alarm.sending : APP_STRINGS.alarm.action}
          </Button>
        ) : (
          <p className="app__stanje-why">
            {view.cancelled ? APP_STRINGS.alarm.cancelled : APP_STRINGS.alarm.started}
          </p>
        )
      }
    >
      <Section title={APP_STRINGS.thresholds.title} />
      <div className="app__stanje-steppers">
        <Stepper
          label={APP_STRINGS.ui.armyCrni}
          value={crni}
          onChange={setCrni}
          disabled={busy != null}
        />
        <Stepper
          label={APP_STRINGS.ui.armyBili}
          value={bili}
          onChange={setBili}
          disabled={busy != null}
        />
      </div>
      <Button
        variant="ghost"
        disabled={busy != null || !dirty}
        onClick={() => void onThresholds(crni, bili)}
      >
        {busy === 'thresholds' ? APP_STRINGS.thresholds.saving : APP_STRINGS.thresholds.save}
      </Button>

      <Section title={S.callMessage} />
      <Note>
        <b>{view.callMessage.title}</b>
        <br />
        {view.callMessage.body}
      </Note>
      <p className="app__stanje-why">{S.callBody}</p>
      <label className="app__alarm-option">
        <input
          type="checkbox"
          checked={includeNotComing}
          onChange={(e) => setIncludeNotComing(e.target.checked)}
        />
        {APP_STRINGS.alarm.includeNotComing}
      </label>
      {sent && <p className="app__alarm-result">{sent}</p>}
    </Sheet>
  )
}

/** The two thresholds, as steppers: a small whole number, never a keyboard. */
function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  disabled: boolean
}) {
  return (
    <div className="app__stepper">
      <span className="app__stepper-label">{label}</span>
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} -`}
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
      >
        -
      </button>
      <span className="app__stepper-value">{value}</span>
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} +`}
        disabled={disabled || value >= MAX_THRESHOLD}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}
