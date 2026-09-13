// What Narudžbe loads on the server (#501).
//
// The IO wiring and nothing else, in the `scan-data.ts` shape: every rule about
// what the filters mean lives in `orders-query.ts`, every rule about wording in
// `orders-view.ts`, and the `where` inside the seam. This file only asks.
//
// It reaches the database through `getRepo()` (ADR-0027 decision 5), so it
// imports no Payload and needs no entry in the repo guard's allow-list. The
// money never comes from a join: `OrderRow.totalCents` is the order's own
// column, because a SUM across the join to tickets multiplies it by the party
// size.

import { getRepo } from '@/lib/repo'
import type { OrderDetailRow, OrderListResult } from '@/lib/repo/orders'
import type { TicketedPerformance } from '@/lib/repo/shows'
import { ORDERS_PER_PAGE, type OrdersQuery } from './orders-query'

export interface OrdersListData extends OrderListResult {
  /** Everything the performance filter can be set to, newest first. */
  performances: TicketedPerformance[]
}

/** One page of the list, plus the filter's own options. */
export async function loadOrdersList(query: OrdersQuery): Promise<OrdersListData> {
  const repo = getRepo()
  const [page, performances] = await Promise.all([
    repo.orders.listForStaff({ ...query, perPage: ORDERS_PER_PAGE }),
    repo.shows.ticketedPerformances(),
  ])
  return { ...page, performances }
}

/**
 * How many orders match a filter, without carrying a page of them back.
 *
 * Početna's Narudžbe card is one number (#564), and the list's own `total` is
 * already that number — so the count is `listForStaff` asked for the smallest
 * page there is, rather than a second query that could one day disagree with
 * the list about what an order is. `showId` null counts every order.
 */
export async function countOrders(showId: string | null): Promise<number> {
  const { total } = await getRepo().orders.listForStaff({
    q: '',
    showId,
    state: null,
    page: 1,
    perPage: 1,
  })
  return total
}

/** One order with its tickets, or null when the id is not one. */
export async function loadOrderDetail(id: string): Promise<OrderDetailRow | null> {
  return getRepo().orders.staffDetailById(id)
}

export type { OrderDetailRow, TicketedPerformance }
