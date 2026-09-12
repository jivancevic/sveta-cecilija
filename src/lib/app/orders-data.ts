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

/** One order with its tickets, or null when the id is not one. */
export async function loadOrderDetail(id: string): Promise<OrderDetailRow | null> {
  return getRepo().orders.staffDetailById(id)
}

export type { OrderDetailRow, TicketedPerformance }
