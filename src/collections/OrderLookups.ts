import type { CollectionConfig } from 'payload'
import { can, type PermissionUser } from '@/lib/access/permissions'

const backoffice = ({ req }: { req: { user: unknown } }) =>
  can(req.user as PermissionUser, 'tickets')

// Audit log of door-side ticket lookups. Tehnika needs to find buyers by
// email or name when an email didn't arrive — that widens read scope, so
// every lookup is recorded for review by the backoffice. Read + sidebar are
// `tickets`-only; a door account never sees the audit log it writes.
export const OrderLookups: CollectionConfig = {
  slug: 'order-lookups',
  access: {
    read: backoffice,
    // System-created via the lookup API route (uses local API,
    // overrideAccess: true). Manual create/update/delete is admin-only.
    create: backoffice,
    update: backoffice,
    delete: backoffice,
  },
  admin: {
    defaultColumns: ['user', 'show', 'query', 'matchedOrderId', 'createdAt'],
    hidden: ({ user }) => !can(user as PermissionUser, 'tickets'),
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users' },
    { name: 'show', type: 'relationship', relationTo: 'shows' },
    {
      name: 'query',
      type: 'text',
      admin: { description: 'Lowercased search input — email or name.' },
    },
    {
      name: 'mode',
      type: 'select',
      options: [
        { label: 'Email', value: 'email' },
        { label: 'Name', value: 'name' },
        { label: 'Order code', value: 'code' },
      ],
    },
    {
      name: 'matchedOrderId',
      type: 'text',
      admin: { description: 'Comma-separated order ids, or empty if no match.' },
    },
  ],
}
