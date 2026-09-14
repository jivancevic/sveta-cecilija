import Link from 'next/link'
import { redirect } from 'next/navigation'
import { loadOrdersList } from '@/lib/app/orders-data'
import { ordersHref, parseOrdersQuery, ORDERS_PER_PAGE, type RawSearchParams } from '@/lib/app/orders-query'
import { foundLabel, orderRowView, pageCount } from '@/lib/app/orders-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { Card, Chip, List, ListRow, Section } from '../ui'
import { OrdersFilters } from './OrdersFilters'

// `/app/orders` — Narudžbe (#501), the blagajna's list of orders.
//
// The screen Tatjana opens with a guest in front of her, so the shape is the
// shape of that moment: the search box first and narrowing as she types (#570),
// the two filters as chips under it, then the rows newest first, each one a tap
// target that opens the one order.
//
// Everything is in the URL (`lib/app/orders-query.ts`): a search, a filter and
// a page are all addresses, so the back button works, a reload keeps the place,
// and Skener's "Otvori narudžbu" and Izvedbe's "Narudžbe za ovu izvedbu" are
// plain links into this screen.
//
// A row says three things and no more (T1's `ListRow`): the buyer with the
// order code under the name, one line saying which evening and how many seats,
// and the money on the right — where a comp reads "Gratis" rather than
// "0,00 €" (#570, Q41), because a seat the society gave away is not an order
// with a missing price. No date disc: the evening is already the second line,
// and a disc that repeats it is a mark that means nothing.
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

      <Section title={S.listTitle} aside={<span aria-live="polite">{foundLabel(total)}</span>} />

      {rows.length === 0 ? (
        <Card className="app__empty">
          <p>{filtered ? S.empty : S.emptyAll}</p>
        </Card>
      ) : (
        <List className="app__orders">
          {rows.map((order) => {
            const row = orderRowView(order)
            return (
              <ListRow
                key={order.id}
                href={row.href}
                title={
                  <>
                    {row.buyer}
                    {row.code && <small className="app__order-code">{row.code}</small>}
                  </>
                }
                meta={row.meta}
                trail={
                  <span className="app__order-right">
                    <b>{row.total}</b>
                    {row.refunded && <Chip tone="warn">{S.refunded}</Chip>}
                  </span>
                }
              />
            )
          })}
        </List>
      )}

      {pages > 1 && (
        <nav className="app__pages" aria-label={S.pageOf(query.page, pages)}>
          {query.page > 1 ? (
            <Link className="ui-btn ui-btn--link" href={ordersHref({ ...query, page: query.page - 1 })}>
              {S.previous}
            </Link>
          ) : (
            <span />
          )}
          <span className="ui-small">{S.pageOf(query.page, pages)}</span>
          {query.page < pages ? (
            <Link className="ui-btn ui-btn--link" href={ordersHref({ ...query, page: query.page + 1 })}>
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
