'use client'

import { useRef } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { ORDER_STATES, ordersHref, type OrdersQuery } from '@/lib/app/orders-query'
import { performanceLabel } from '@/lib/app/orders-view'
import type { TicketedPerformance } from '@/lib/repo/shows'

// The search box and the two filters (#501).
//
// A plain GET `<form>`, which is the whole reason the screen state is in the
// URL: with JavaScript off it still searches, and with it on the two selects
// submit themselves so a filter is one tap rather than a tap and a press. The
// form carries no `page`, so changing a filter lands on page 1 by construction
// instead of on an empty page 4 of the previous result.
//
// It is a client component only for that auto-submit; everything it renders is
// decided on the server.

const S = APP_STRINGS.orders

export function OrdersFilters({
  query,
  performances,
}: {
  query: OrdersQuery
  performances: TicketedPerformance[]
}) {
  const form = useRef<HTMLFormElement>(null)
  const submit = () => form.current?.requestSubmit()
  const filtered = query.q !== '' || query.showId !== null || query.state !== null

  return (
    <form ref={form} className="app__orders-filters" action="/app/orders" method="get">
      <label className="app__orders-search">
        <span className="app__sr-only">{S.searchLabel}</span>
        <input
          type="search"
          name="q"
          className="app__input"
          defaultValue={query.q}
          placeholder={S.searchPlaceholder}
          // A new search always starts at the top of the result.
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      <div className="app__orders-selects">
        <label className="app__orders-select">
          <span className="app__sr-only">{S.showLabel}</span>
          <select
            name="show"
            className="app__select"
            defaultValue={query.showId ?? ''}
            onChange={submit}
          >
            <option value="">{S.allShows}</option>
            {performances.map((p) => (
              <option key={p.id} value={p.id}>
                {performanceLabel(p)}
              </option>
            ))}
          </select>
        </label>

        <label className="app__orders-select">
          <span className="app__sr-only">{S.stateLabel}</span>
          <select
            name="state"
            className="app__select"
            defaultValue={query.state ?? ''}
            onChange={submit}
          >
            <option value="">{S.allStates}</option>
            {ORDER_STATES.map((state) => (
              <option key={state} value={state}>
                {S.states[state]}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="app__button app__button--quiet">
          {S.search}
        </button>
        {/* A way back to the whole list that does not mean clearing three
            controls by hand. A link rather than a reset button: it goes to the
            unfiltered address, which is also what it says. */}
        {filtered && (
          <a className="app__orders-clear" href={ordersHref({ q: '', showId: null, state: null, page: 1 })}>
            {S.clear}
          </a>
        )}
      </div>
    </form>
  )
}
