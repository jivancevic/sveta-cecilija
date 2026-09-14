'use client'

import { useRef } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import type { PartnerOption } from '@/lib/app/statement-data'
import type { MonthOption } from '@/lib/app/statement-view'

// Obračun's picker (#599), in the shape Financije's already had.
//
// A plain GET form, which is what puts the whole screen's state in the URL:
// with JavaScript off it still submits, and with it on a select submits itself
// so changing a month is one tap rather than a tap and a press. That URL is the
// feature, not a side effect — the secretary can send a link to one partner's
// month, and whoever opens it sees exactly what she was looking at.
//
// The partner select renders only for a reader who may choose one. A reseller
// is locked to their own Partner by the server and has nothing to pick, so they
// get the month and the year and no control that would refuse itself.
//
// A client component for the auto-submit and nothing else; every option it
// renders was decided on the server, and the month cap (no month that has not
// begun) lives in `statementMonths`, never here.

const S = APP_STRINGS.statement

export function StatementPickers({
  partners,
  partnerId,
  year,
  years,
  month,
  months,
}: {
  /** Empty for a reseller: then no partner select is drawn at all. */
  partners: PartnerOption[]
  partnerId: string | null
  year: number
  years: number[]
  month: number
  months: MonthOption[]
}) {
  const form = useRef<HTMLFormElement>(null)
  const submit = () => form.current?.requestSubmit()

  return (
    <form ref={form} className="app__statement-picker" action="/app/statement" method="get">
      {partners.length > 0 && (
        <div className="app__statement-picker-partner">
          <label className="app__fin-label" htmlFor="stmt-partner">
            {S.partner}
          </label>
          <select
            id="stmt-partner"
            name="partnerId"
            className="app__select app__select--wide"
            defaultValue={partnerId ?? ''}
            onChange={submit}
          >
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {/* A deactivated reseller stays in the list and says so: it can
                    no longer sell, and it can still owe for what it sold. */}
                {p.active ? p.name : `${p.name} (${APP_STRINGS.finance.inactivePartner})`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="app__fin-label" htmlFor="stmt-month">
          {S.month}
        </label>
        <select
          id="stmt-month"
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
        <label className="app__fin-label" htmlFor="stmt-year">
          {S.year}
        </label>
        <select
          id="stmt-year"
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
