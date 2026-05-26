import type { CollectionConfig } from 'payload'
import { isAdminTier, isAuthed } from '@/lib/access/roles'

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdminTier(req.user as { role?: string } | null)
const authedOnly = ({ req }: { req: { user: unknown } }) =>
  isAuthed(req.user as { role?: string } | null)

export const QRTokens: CollectionConfig = {
  slug: 'qr-tokens',
  access: {
    read: authedOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    defaultColumns: ['token', 'order', 'scanned', 'scannedAt'],
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
    { name: 'scanned', type: 'checkbox', defaultValue: false },
    { name: 'scannedAt', type: 'date' },
  ],
}
