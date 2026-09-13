// The two staff kinds of the inbox (#496): a new inquiry, and a new card
// dispute.
//
// They are the only notifications with no push behind them, so they cannot ride
// `createSender` the way every roster notification does. Same audience rules
// though (`notification-audience.ts`), same swallowing writer
// (`notifications-write.ts`), and the same contract as every other sender: a
// notification that could not be filed must never fail the thing it was about.
// An enquiry is already stored by the time we get here, and a chargeback's money
// has already moved.
//
// **Never an order** (#496): a sale is not news. The two kinds below are the
// two things a `tickets` holder has to act on.

import type { PoolQuery } from '@/lib/db/pool-query'
import { resolveNotificationAudience } from './notification-audience'
import { loadStaffUserIds } from './notification-recipients'
import { fileNotifications, type NotificationContent } from './notifications-write'
import { ENQUIRY_TYPE_LABELS, INBOX_MESSAGES } from './strings'
import type { EnquiryType } from '@/lib/contact/enquiry-type'

/**
 * Where a staff row's tap lands.
 *
 * The Cecilija routes from the route map (#473), not a Backoffice link: the
 * Backoffice is behind `dev` since ADR-0027, so a `tickets` holder could not
 * open one. Both screens are live now (Narudžbe #501, Upiti #507), so an inbox
 * row lands on the thing it is about; the row still carries the whole fact in
 * its title and body, which is what a person standing at a desk reads first.
 */
const INQUIRY_URL = '/app/inquiries'
const DISPUTE_URL = '/app/orders'

/** Post one content to every unshared `tickets` holder. Never throws. */
async function fileForStaff(query: PoolQuery, content: NotificationContent): Promise<number> {
  try {
    const audience = resolveNotificationAudience(content.kind, {
      primary: await loadStaffUserIds(query),
      doorOnly: [],
    })
    return await fileNotifications(query, content, audience.inbox)
  } catch (err) {
    console.error('[notifications] staff fan-out failed', content.kind, err)
    return 0
  }
}

/** A public enquiry form was submitted and stored. */
export function notifyStaffOfEnquiry(
  query: PoolQuery,
  input: { name: string; enquiryType: EnquiryType },
): Promise<number> {
  return fileForStaff(query, {
    kind: 'inquiry',
    title: INBOX_MESSAGES.inquiry.title,
    body: INBOX_MESSAGES.inquiry.body({
      name: input.name.trim(),
      type: ENQUIRY_TYPE_LABELS[input.enquiryType],
    }),
    url: INQUIRY_URL,
  })
}

/** Stripe told us a buyer disputed a charge (#380, `charge.dispute.created`). */
export function notifyStaffOfDispute(
  query: PoolQuery,
  input: {
    orderCode: string | null
    amountCents: number
    currency: string
    reason: string
  },
): Promise<number> {
  return fileForStaff(query, {
    kind: 'dispute',
    title: INBOX_MESSAGES.dispute.title,
    body: INBOX_MESSAGES.dispute.body({
      order: input.orderCode,
      amount: formatAmount(input.amountCents, input.currency),
      reason: input.reason,
    }),
    url: DISPUTE_URL,
  })
}

/** "120,00 EUR" from Stripe's cents. Money is never rendered by hand elsewhere. */
function formatAmount(cents: number, currency: string): string {
  const amount = Number.isFinite(cents) ? cents / 100 : 0
  return `${amount.toLocaleString('hr-HR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency.toUpperCase()}`
}
