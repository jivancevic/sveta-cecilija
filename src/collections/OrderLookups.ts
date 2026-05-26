import type { CollectionConfig } from 'payload'
import { isAdminTier } from '@/lib/access/roles'

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdminTier(req.user as { role?: string } | null)

// Audit log of door-side ticket lookups. Tehnika needs to find buyers by
// email or name when an email didn't arrive — that widens read scope, so
// every lookup is recorded for admin review. Visible to admins only;
// hidden from the sidebar for tehnika.
export const OrderLookups: CollectionConfig = {
  slug: 'order-lookups',
  access: {
    read: adminOnly,
    // System-created via the lookup API route (uses local API,
    // overrideAccess: true). Manual create/update/delete is admin-only.
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    defaultColumns: ['user', 'show', 'query', 'matchedOrderId', 'createdAt'],
    hidden: ({ user }) => !isAdminTier(user as { role?: string } | null),
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
      ],
    },
    {
      name: 'matchedOrderId',
      type: 'text',
      admin: { description: 'Comma-separated order ids, or empty if no match.' },
    },
  ],
}
