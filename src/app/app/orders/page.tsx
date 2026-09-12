import Link from 'next/link'
import { redirect } from 'next/navigation'
import { loadOrdersList } from '@/lib/app/orders-data'
import { ordersHref, parseOrdersQuery, ORDERS_PER_PAGE, type RawSearchParams } from '@/lib/app/orders-query'
import { foundLabel, orderRowView, pageCount } from '@/lib/app/orders-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { OrdersFilters } from './OrdersFilters'

// `/app/orders` — Narudžbe (#501), the blagajna's list of orders.
//
// The screen Tatjana opens with a guest in front of her, so the shape is the
// shape of that moment: the search box first, the rows under it newest first,
// and every row a tap target that opens the one order. The filters sit beside
// the search on a laptop and under it on a phone, which is the same markup at
// two widths rather than two components.
//
// Everything is in the URL (`lib/app/orders-query.ts`): a search, a filter and
// a page are all addresses, so the back button works, a reload keeps the place,
// and Skener's "Otvori narudžbu" and Izvedbe's "Narudžbe za ovu izvedbu" are
// plain links into this screen.
//
// Not here, deliberately (#476): no CSV, no delete, no editing counts, totals
// or channel. What was sold is a record; the Backoffice keeps the raw edit.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.orders

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { viewer, refusal } = await openScreen('orders')
  if (refusal) return refusal

  const query = parseOrdersQuery(await searchParams)
  const { rows, total, performances } = await loadOrdersList(query)
  const pages = pageCount(total, ORDERS_PER_PAGE)
  const filtered = query.q !== '' || query.showId !== null || query.state !== null

  // A hand-typed `page=9` on a two-page result would otherwise read "17
  // narudžbi" over an empty list, which says two contradictory things at once.
  if (query.page > pages && total > 0) redirect(ordersHref({ ...query, page: pages }))

  return (
    <AppShell viewer={viewer} screen="orders">
      <OrdersFilters query={query} performances={performances} />

      <p className="app__orders-count" aria-live="polite">
        {foundLabel(total)}
      </p>

      {rows.length === 0 ? (
        <p className="app__empty">{filtered ? S.empty : S.emptyAll}</p>
      ) : (
        <div className="app__orders-list">
          {rows.map((order) => {
            const row = orderRowView(order)
            return (
              <Link key={order.id} className="app__order-row" href={row.href}>
                <span className="app__order-main">
                  <span className="app__order-buyer">
                    {row.buyer}
                    {row.code && <small>{row.code}</small>}
                  </span>
                  <span className="app__order-show">{row.performance}</span>
                  <span className="app__order-meta">
                    {row.party}
                    {row.party && ' · '}
                    {row.channel}
                  </span>
                </span>
                <span className="app__order-right">
                  <b className="app__order-total">{row.total}</b>
                  {row.refunded && <span className="app__badge app__badge--refunded">{S.refunded}</span>}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="app__orders-pager" aria-label={S.pageOf(query.page, pages)}>
          {query.page > 1 ? (
            <Link
              className="app__button app__button--quiet"
              href={ordersHref({ ...query, page: query.page - 1 })}
            >
              {S.previous}
            </Link>
          ) : (
            <span />
          )}
          <span className="app__orders-page">{S.pageOf(query.page, pages)}</span>
          {query.page < pages ? (
            <Link
              className="app__button app__button--quiet"
              href={ordersHref({ ...query, page: query.page + 1 })}
            >
              {S.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </AppShell>
  )
}
