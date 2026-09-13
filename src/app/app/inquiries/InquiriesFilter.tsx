'use client'

import { useRef } from 'react'
import { INQUIRY_STATES, inquiriesHref, type InquiriesQuery } from '@/lib/app/inquiries-query'
import { stateLabel } from '@/lib/app/inquiries-view'
import { APP_STRINGS } from '@/lib/app/strings'

// The one filter above the inbox (#507).
//
// A plain GET `<form>`, the same shape Narudžbe's filters have: with JavaScript
// off it still filters, and with it on the select submits itself so a filter is
// one tap rather than a tap and a press. The form carries no `page`, so
// changing the filter lands on page 1 by construction instead of on an empty
// page 3 of the previous result.
//
// One control, because an enquiry has one question about it: has somebody
// answered this yet. A search box would be a second thing to read for a list
// that has held twenty-six rows in three seasons.

const S = APP_STRINGS.inquiries

export function InquiriesFilter({ query }: { query: InquiriesQuery }) {
  const form = useRef<HTMLFormElement>(null)

  return (
    <form ref={form} className="app__inquiries-filter" action="/app/inquiries" method="get">
      <label className="app__inquiries-select">
        <span className="app__sr-only">{S.filterLabel}</span>
        <select
          name="state"
          className="app__select"
          defaultValue={query.state ?? ''}
          onChange={() => form.current?.requestSubmit()}
        >
          <option value="">{S.all}</option>
          {INQUIRY_STATES.map((state) => (
            <option key={state} value={state}>
              {stateLabel(state)}
            </option>
          ))}
        </select>
      </label>

      {/* The way back to the whole inbox, as an address rather than a reset
          button: it goes where it says it goes. */}
      {query.state && (
        <a className="app__inquiries-clear" href={inquiriesHref({ state: null, page: 1 })}>
          {S.all}
        </a>
      )}

      <noscript>
        <button type="submit" className="app__button app__button--quiet">
          {S.filterLabel}
        </button>
      </noscript>
    </form>
  )
}
