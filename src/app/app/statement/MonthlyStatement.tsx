'use client'

import { useEffect, useState } from 'react'
import { formatEur } from '@/lib/app/orders-view'
import { APP_STRINGS } from '@/lib/app/strings'
import {
  clampStatementMonth,
  statementMonths,
  statementSummary,
  statementYears,
  type MonthKey,
  type ReconStatement,
  type StatementSummary,
} from '@/lib/app/statement-view'

// The monthly statement of Obračun (#505).
//
// The Backoffice version was a month picker and a download link and nothing
// else, which is fine on a laptop and useless on a phone: a CSV a phone cannot
// open is not an answer to "what do I owe this month". So the picker now SHOWS
// the month first and offers the CSV second.
//
// Both come from the same route (`/api/partner/reconciliation`, `format=json`
// then `format=csv`), which derives the partner from the session and ignores
// any partnerId a caller might add, so the figures on screen and the figures in
// the file are one query and cannot disagree. Nothing is recomputed here:
// `statementSummary` only renames HGD's `netCents` into the partner's debt.

/** What came back, and WHICH month it is about. */
type Answer =
  | { key: string; summary: StatementSummary; shows: ReconStatement['shows'] }
  | { key: string; failed: true }

export function MonthlyStatement({
  now,
  commissionPercent,
}: {
  now: MonthKey
  commissionPercent: number
}) {
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  // One piece of state carrying WHICH month it answers, so "loading" is derived
  // rather than set: a synchronous setState in the effect below would make
  // every month change two renders, and React's lint rule says so out loud.
  const [answer, setAnswer] = useState<Answer | null>(null)

  const key = `${year}-${month}`

  useEffect(() => {
    let cancelled = false
    fetch(`/api/partner/reconciliation?year=${year}&month=${month}&format=json`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as ReconStatement
      })
      .then((statement) => {
        if (cancelled) return
        setAnswer({
          key: `${year}-${month}`,
          summary: statementSummary(statement),
          shows: statement.shows ?? [],
        })
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key: `${year}-${month}`, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [year, month])

  const current = answer?.key === key ? answer : null
  const loading = current === null
  const failed = current !== null && 'failed' in current

  const years = statementYears(now)
  const months = statementMonths(now, year)

  function pickYear(next: number) {
    setYear(next)
    // December stays selected when the year flips back to one where it exists;
    // a month that has not happened pulls back to the newest that has.
    setMonth((m) => clampStatementMonth(now, next, m))
  }

  return (
    <section className="app__statement">
      <h2 className="app__month-head">
        <span>{APP_STRINGS.statement.monthlyTitle}</span>
      </h2>
      <p className="app__partner-note">{APP_STRINGS.statement.monthlyIntro}</p>

      <div className="app__statement-picker">
        <div>
          <label className="app__comp-name" htmlFor="stmt-month">
            {APP_STRINGS.statement.month}
          </label>
          <select
            id="stmt-month"
            className="app__select app__select--wide"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {months.map((m) => (
              <option key={m.month} value={m.month}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="app__comp-name" htmlFor="stmt-year">
            {APP_STRINGS.statement.year}
          </label>
          <select
            id="stmt-year"
            className="app__select app__select--wide"
            value={year}
            onChange={(e) => pickYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="app__empty">{APP_STRINGS.statement.loading}</p>}
      {failed && <p className="app__error">{APP_STRINGS.statement.failed}</p>}

      {current && 'summary' in current && (
        <Loaded
          summary={current.summary}
          shows={current.shows}
          href={`/api/partner/reconciliation?year=${year}&month=${month}&format=csv`}
          commissionPercent={commissionPercent}
        />
      )}
    </section>
  )
}

/** One loaded month: its five figures, its izvedbe, and the CSV of both. */
function Loaded({
  summary,
  shows,
  href,
  commissionPercent,
}: {
  summary: StatementSummary
  shows: ReconStatement['shows']
  href: string
  commissionPercent: number
}) {
  return (
    <>
      <dl className="app__statement-figures">
        <Figure label={APP_STRINGS.statement.tickets} value={String(summary.ticketsSold)} />
        <Figure label={APP_STRINGS.statement.gross} value={formatEur(summary.grossCents)} />
        <Figure
          label={APP_STRINGS.statement.commission(summary.commissionPercent ?? commissionPercent)}
          value={formatEur(summary.commissionCents)}
        />
        <Figure label={APP_STRINGS.statement.owed} value={formatEur(summary.owedCents)} strong />
        {summary.cancelledCount > 0 && (
          <Figure label={APP_STRINGS.statement.cancelled} value={String(summary.cancelledCount)} />
        )}
      </dl>

      {shows.length === 0 ? (
        <p className="app__empty">{APP_STRINGS.statement.empty}</p>
      ) : (
        <ul className="app__statement-shows">
          <li className="app__statement-show app__statement-show--head">
            <span>{APP_STRINGS.statement.perShow}</span>
            <b>{APP_STRINGS.statement.gross}</b>
          </li>
          {shows.map((line) => (
            <li key={line.showId} className="app__statement-show">
              <span>
                {line.showLabel} · {line.activeCount}
              </span>
              <b>{formatEur(line.grossCents)}</b>
            </li>
          ))}
        </ul>
      )}

      <a className="app__button app__button--link app__statement-csv" href={href}>
        {APP_STRINGS.statement.download}
      </a>
    </>
  )
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'app__figure app__figure--strong' : 'app__figure'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
