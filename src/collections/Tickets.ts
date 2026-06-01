import type { CollectionConfig } from 'payload'
import { isAdminTier, isAuthed } from '@/lib/access/roles'

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdminTier(req.user as { role?: string } | null)
const authedOnly = ({ req }: { req: { user: unknown } }) =>
  isAuthed(req.user as { role?: string } | null)

// One ticket per person (ADR-0007). Was `QRTokens` / `qr_tokens`; the QR is just
// how a ticket is presented at the door. Each ticket is self-describing (adult/
// child) and has its own lifecycle so a voided slip scans to a clear CANCELLED
// state rather than vanishing.
export const Tickets: CollectionConfig = {
  slug: 'tickets',
  access: {
    read: authedOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    defaultColumns: ['token', 'order', 'type', 'status', 'scanned', 'scannedAt'],
    hidden: ({ user }) => !isAdminTier(user as { role?: string } | null),
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
