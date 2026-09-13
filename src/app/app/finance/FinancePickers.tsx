'use client'

import { useRef } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import type { MonthOption } from '@/lib/app/finance-view'

// The two pickers of Financije (#509).
//
// Plain GET forms, which is why the whole screen's state is in the URL: with
// JavaScript off they still submit, and with it on a select submits itself so
// changing a month is one tap rather than a tap and a press. Each form carries
// the other picker's value in a hidden field, so choosing a month keeps the
// season and choosing a season keeps the month.
//
// They are client components for that auto-submit and nothing else; every
// option they render was decided on the server.

const S = APP_STRINGS.finance

export function SeasonForm({
  season,
  seasons,
  year,
  month,
}: {
  season: number
  seasons: number[]
  year: number
  month: number
}) {
  const form = useRef<HTMLFormElement>(null)

  return (
    <form ref={form} className="app__finance-season" action="/app/finance" method="get">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <label className="app__finance-label" htmlFor="finance-season">
        {S.season}
      </label>
      <select
        id="finance-season"
        name="season"
        className="app__select"
        defaultValue={String(season)}
        onChange={() => form.current?.requestSubmit()}
      >
        {seasons.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="app__button app__button--quiet">
          {S.show}
        </button>
      </noscript>
    </form>
  )
}

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
    <form ref={form} className="app__finance-picker" action="/app/finance" method="get">
      <input type="hidden" name="season" value={season} />
      <div>
        <label className="app__finance-label" htmlFor="finance-month">
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
        <label className="app__finance-label" htmlFor="finance-year">
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
        <button type="submit" className="app__button app__button--quiet">
          {S.show}
        </button>
      </noscript>
    </form>
  )
}
