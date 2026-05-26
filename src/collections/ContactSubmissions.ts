import type { CollectionConfig } from 'payload'
import { isAdminTier } from '@/lib/access/roles'

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdminTier(req.user as { role?: string } | null)

export const ContactSubmissions: CollectionConfig = {
  slug: 'contact-submissions',
  access: {
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
    create: adminOnly,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'enquiryType', 'createdAt'],
    hidden: ({ user }) => !isAdminTier(user as { role?: string } | null),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'email', type: 'email', required: true },
    {
      name: 'enquiryType',
      type: 'select',
      required: true,
      options: [
        { label: 'General', value: 'general' },
        { label: 'Private Moreška', value: 'private-moreska' },
        { label: 'Moreška Experience', value: 'moreska-experience' },
        { label: 'Other', value: 'other' },
      ],
    },
    { name: 'message', type: 'textarea', required: true },
  ],
  timestamps: true,
}
