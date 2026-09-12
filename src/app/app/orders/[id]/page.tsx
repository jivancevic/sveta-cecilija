import Link from 'next/link'
import { can } from '@/lib/access/permissions'
import { loadOrderDetail } from '@/lib/app/orders-data'
import { ordersHref, type OrdersQuery } from '@/lib/app/orders-query'
import {
  channelLabel,
  formatEur,
  partyLabel,
  performanceLabel,
  refundOffer,
  ticketView,
  zagrebStamp,
} from '@/lib/app/orders-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { OrderActions } from './OrderActions'

// `/app/orders/[id]` — one order (#501).
//
// The facts first, the actions under them, the tickets last. That order is the
// order of the moment it serves: a guest says something is wrong, Tatjana reads
// the order back to them, then does the one thing that fixes it, and only
// afterwards does anybody care which of the four seats has already been
// scanned.
//
// The Povrat button is decided on the SERVER, by `can(viewer, 'refunds')` fed
// into `refundOffer()`: a `tickets`-only holder never receives it in the markup,
// rather than receiving it disabled. The route behind it re-checks the
// permission anyway (CLAUDE.md hard rule) — this is the half that keeps an
// action nobody may take off the screen entirely.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.orders
const D = S.detail

/** The unfiltered list, as the base of the one link this page builds. */
const EMPTY_QUERY: OrdersQuery = { q: '', showId: null, state: null, page: 1 }

/** One line of the facts block: a label and a value, never an input. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="app__order-fact">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  )
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer, refusal } = await openScreen('orders')
  if (refusal) return refusal

  const { id } = await params
  const order = await loadOrderDetail(id)

  if (!order) {
    return (
      <AppShell viewer={viewer} screen="orders" title={D.missing}>
        <p className="app__empty">{D.missing}</p>
        <Link className="app__button app__button--link" href="/app/orders">
          {D.back}
        </Link>
      </AppShell>
    )
  }

  const buyer = (order.buyerName ?? '').trim() || D.noName
  const refund = refundOffer(order, can({ permissions: viewer.permissions }, 'refunds'))
  const amount = formatEur(order.totalCents)

  return (
    <AppShell viewer={viewer} screen="orders" title={buyer}>
      <Link className="app__order-back" href="/app/orders">
        ‹ {D.back}
      </Link>

      <section className="app__order-facts">
        <Fact label={D.performance}>
          {performanceLabel(order.show)}
          {order.show && (
            <>
              {' '}
              <Link className="app__order-samelink" href={ordersHref({ ...EMPTY_QUERY, showId: order.show.id })}>
                {D.sameShow}
              </Link>
            </>
          )}
        </Fact>
        <Fact label={D.email}>{order.email ?? D.noEmail}</Fact>
        {order.code && <Fact label={D.code}>{order.code}</Fact>}
        <Fact label={D.channel}>{channelLabel(order)}</Fact>
        {order.promoCode && <Fact label={D.promoCode}>{order.promoCode}</Fact>}
        <Fact label={D.party}>{partyLabel(order.adultCount, order.childCount)}</Fact>
        <Fact label={D.total}>
          <span className="app__order-amount">{amount}</span>
          {order.refunded && <span className="app__badge app__badge--refunded">{S.refunded}</span>}
        </Fact>
        <Fact label={D.created}>{zagrebStamp(order.createdAt)}</Fact>
      </section>

      <OrderActions
        orderId={order.id}
        refund={refund}
        amount={amount}
        email={order.email}
        buyerName={order.buyerName ?? ''}
      />

      <section className="app__order-tickets">
        <h2 className="app__order-tickets-head">{D.ticketsTitle}</h2>
        {order.tickets.length === 0 ? (
          <p className="app__empty">{D.noTickets}</p>
        ) : (
          <ul className="app__order-ticket-list">
            {order.tickets.map((ticket) => {
              const view = ticketView(ticket)
              return (
                <li
                  key={ticket.id}
                  className={`app__order-ticket${view.cancelled ? ' app__order-ticket--void' : ''}`}
                >
                  <span className="app__order-ticket-type">{view.type}</span>
                  <span className="app__order-ticket-state">{view.state}</span>
                  <span className="app__order-ticket-scan">{view.scan}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
