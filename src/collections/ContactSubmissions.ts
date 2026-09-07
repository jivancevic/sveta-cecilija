import type { CollectionConfig } from 'payload'
import { can } from '@/lib/access/permissions'

type PermUser = { permissions?: unknown } | null | undefined

const backoffice = ({ req }: { req: { user: unknown } }) =>
  can(req.user as PermUser, 'tickets')

export const ContactSubmissions: CollectionConfig = {
  slug: 'contact-submissions',
  access: {
    read: backoffice,
    update: backoffice,
    delete: backoffice,
    create: backoffice,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'enquiryType', 'status', 'createdAt'],
    hidden: ({ user }) => !can(user as PermUser, 'tickets'),
    components: {
      edit: {
        editMenuItems: ['@/components/payload/MarkHandledMenuItem#MarkHandledMenuItem'],
      },
    },
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
    {
      // Enquiry lifecycle (#239, ADR-0015). The dashboard inquiries badge counts
      // `new`; the secretary flips this to `handled` (in the row's edit form or
      // via the "Mark handled" edit-menu action) to clear it from the badge.
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Handled', value: 'handled' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'message', type: 'textarea', required: true },
  ],
  timestamps: true,
}
