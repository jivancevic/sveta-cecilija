'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { ORDER_STATES, ordersHref, type OrdersQuery } from '@/lib/app/orders-query'
import { shortPerformanceLabel } from '@/lib/app/orders-view'
import { FilterChips, type FilterChipItem } from '../ui'
import type { TicketedPerformance } from '@/lib/repo/shows'

// The search box and the two filter rows (#501, redressed by #570).
//
// **The search runs as it is typed.** Tatjana has a guest in front of her and a
// name half heard over a PA: the old box needed a name, a tap on Traži and a
// full page load before it said whether that name was in there at all. Now the
// list narrows while she types, 300 ms after she stops, and each result is
// still an ADDRESS — `router.replace` writes `q` into the query string, so a
// reload keeps the search and Back leaves the screen rather than walking
// backwards through one letter at a time.
//
// **The two filters are chips rather than selects** (Q40): every option is
// readable without opening anything, the active one is filled, and each is a
// link, which is what keeps the whole control working with JavaScript off.
//
// The form around it is still a plain GET form with the other two filters as
// hidden fields, so Enter searches and a browser with no JavaScript gets the
// screen it always had.

const S = APP_STRINGS.orders

/** Long enough that a typed name is one request, short enough to feel live. */
const DEBOUNCE_MS = 300

export function OrdersFilters({
  query,
  performances,
}: {
  query: OrdersQuery
  performances: TicketedPerformance[]
}) {
  const router = useRouter()
  const [term, setTerm] = useState(query.q)
  // The last term that IS in the address. It keeps the debounce from firing a
  // navigation for the value the server already rendered, and it is how a Back
  // or a pasted link gets to overwrite what is in the box.
  const written = useRef(query.q)

  useEffect(() => {
    if (query.q === written.current) return
    written.current = query.q
    setTerm(query.q)
  }, [query.q])

  useEffect(() => {
    if (term === written.current) return
    const timer = setTimeout(() => {
      written.current = term
      // Page 1 by construction: a narrower search on page 4 of the old result
      // would land on an empty page.
      router.replace(ordersHref({ ...query, q: term, page: 1 }), { scroll: false })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term, query, router])

  const showChips: FilterChipItem[] = [
    { key: '', label: S.allShows, href: ordersHref({ ...query, showId: null, page: 1 }) },
    ...performances.map((p) => ({
      key: p.id,
      label: shortPerformanceLabel(p),
      href: ordersHref({ ...query, showId: p.id, page: 1 }),
    })),
  ]

  const stateChips: FilterChipItem[] = [
    { key: '', label: S.allStates, href: ordersHref({ ...query, state: null, page: 1 }) },
    ...ORDER_STATES.map((state) => ({
      key: state,
      label: S.states[state],
      href: ordersHref({ ...query, state, page: 1 }),
    })),
  ]

  return (
    <div className="app__filters">
      <form className="app__search" action="/app/orders" method="get">
        <label className="app__search-field">
          <span className="app__sr-only">{S.searchLabel}</span>
          <SearchGlyph />
          <input
            type="search"
            name="q"
            value={term}
            placeholder={S.searchPlaceholder}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
        {/* What a no-JavaScript Enter has to carry with it, so a submit from
            the box does not quietly drop the two filters above the list. */}
        {query.showId && <input type="hidden" name="show" value={query.showId} />}
        {query.state && <input type="hidden" name="state" value={query.state} />}
        <noscript>
          <button type="submit" className="ui-btn ui-btn--ghost">
            {S.searchLabel}
          </button>
        </noscript>
      </form>

      <FilterChips items={stateChips} active={query.state ?? ''} label={S.stateLabel} />
      <FilterChips items={showChips} active={query.showId ?? ''} label={S.showLabel} />
    </div>
  )
}

/** The glyph inside the box: what the field is, without a label taking a line. */
function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}
