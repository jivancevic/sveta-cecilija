import type { CollectionConfig } from 'payload'
import { can, hasAny } from '@/lib/access/permissions'
import { partnerOwnTicketsWhere } from '@/lib/access/partner'

type ReqUser = { permissions?: unknown; partner?: unknown } | null | undefined

const backoffice = ({ req }: { req: { user: unknown } }) =>
  can(req.user as ReqUser, 'tickets')

// One ticket per person (ADR-0007). Was `QRTokens` / `qr_tokens`; the QR is just
// how a ticket is presented at the door. Each ticket is self-describing (adult/
// child) and has its own lifecycle so a voided slip scans to a clear CANCELLED
// state rather than vanishing.
export const Tickets: CollectionConfig = {
  slug: 'tickets',
  access: {
    // Internal staff read every ticket: the backoffice (`tickets`) and the door
    // (`door`), which needs the full set to scan against. A partner reads only
    // tickets under its own orders (tickets.order.partner = self).
    read: ({ req }) => {
      const user = req.user as ReqUser
      if (hasAny(user, ['tickets', 'door'])) return true
      return partnerOwnTicketsWhere(user)
    },
    create: backoffice,
    update: backoffice,
    delete: backoffice,
  },
  admin: {
    defaultColumns: ['token', 'order', 'type', 'status', 'scanned', 'scannedAt'],
    hidden: ({ user }) => !can(user as ReqUser, 'tickets'),
  },
  fields: [
    { name: 'token', type: 'text', required: true, unique: true },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'adult',
      options: [
        { label: 'Adult', value: 'adult' },
        { label: 'Child', value: 'child' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
    {
      name: 'cancelledAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'When the ticket was voided. NULL = active.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'cancelReason',
      type: 'select',
      options: [
        { label: 'Storno (partner void)', value: 'storno' },
        { label: 'Refund', value: 'refund' },
      ],
      admin: { description: 'Why the ticket was cancelled. NULL while active.' },
    },
    { name: 'scanned', type: 'checkbox', defaultValue: false },
    { name: 'scannedAt', type: 'date' },
  ],
}
