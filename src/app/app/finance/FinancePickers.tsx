'use client'

import { useRef } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import type { MonthOption } from '@/lib/app/finance-view'

// The statement picker of Financije (#509), and since #571 the only one.
//
// A plain GET form, which is why the whole screen's state is in the URL: with
// JavaScript off it still submits, and with it on a select submits itself so
// changing a month is one tap rather than a tap and a press. It carries the
// season in a hidden field, so picking a month keeps the year the cards above
// are counting.
//
// The season itself became a row of links (`ui/Seasons`) with the redesign, so
// the form that used to wrap it is gone: a season is a navigation, and a select
// bought a client island for it while hiding the other years behind a tap.
//
// A client component for that auto-submit and nothing else; every option it
// renders was decided on the server.
//
// **The month cap is not this file's** and must stay that way: `statementMonths`
// stops at the current Zagreb month (`finance-view.ts`), because there is no
// obračun for a month that has not happened.

const S = APP_STRINGS.finance

export function MonthForm({
  season,
  year,
  years,
  month,
  months,
}: {
  season: number
  year: number
  years: number[]
  month: number
  months: MonthOption[]
}) {
  const form = useRef<HTMLFormElement>(null)
  const submit = () => form.current?.requestSubmit()

  return (
    <form ref={form} className="app__fin-picker" action="/app/finance" method="get">
      <input type="hidden" name="season" value={season} />
      <div>
        <label className="app__fin-label" htmlFor="finance-month">
          {S.month}
        </label>
        <select
          id="finance-month"
          name="month"
          className="app__select app__select--wide"
          defaultValue={String(month)}
          onChange={submit}
        >
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="app__fin-label" htmlFor="finance-year">
          {S.year}
        </label>
        <select
          id="finance-year"
          name="year"
          className="app__select app__select--wide"
          defaultValue={String(year)}
          onChange={submit}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <noscript>
        <button type="submit" className="ui-btn ui-btn--ghost">
          {S.show}
        </button>
      </noscript>
    </form>
  )
}
