import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthed } from '@/lib/access/roles'

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdmin(req.user as { role?: string } | null)
const authedOnly = ({ req }: { req: { user: unknown } }) =>
  isAuthed(req.user as { role?: string } | null)

export const Shows: CollectionConfig = {
  slug: 'shows',
  access: {
    read: authedOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'time', 'venue', 'onlineSold', 'inPersonSold', 'legacyReserved', 'status'],
    components: {
      edit: {
        editMenuItems: [
          '@/components/payload/InPersonSalesMenuItem#InPersonSalesMenuItem',
          '@/components/payload/ViewOrdersForShowMenuItem#ViewOrdersForShowMenuItem',
          '@/components/payload/CancelShowMenuItem#CancelShowMenuItem',
        ],
      },
      views: {
        list: {
          actions: ['@/components/payload/BulkCreateLink#BulkCreateLink'],
        },
      },
    },
  },
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
      },
    },
    {
      name: 'time',
      type: 'text',
      required: true,
      validate: (val: string | null | undefined) => {
        if (!val) return 'Time is required'
        if (!/^\d{2}:\d{2}$/.test(val)) return 'Time must be in HH:MM format (e.g. 21:00)'
        const [h, m] = val.split(':').map(Number)
        if (h > 23 || m > 59) return 'Invalid time value'
        return true
      },
    },
    {
      name: 'venue',
      type: 'select',
      required: true,
      defaultValue: 'ljetno-kino',
      options: [
        { label: 'Ljetno kino (320)', value: 'ljetno-kino' },
        { label: 'Zimsko kino / Centar za kulturu (250)', value: 'zimsko-kino' },
      ],
    },
    { name: 'onlineSold', type: 'number', defaultValue: 0 },
    { name: 'inPersonSold', type: 'number', defaultValue: 0 },
    {
      name: 'legacyReserved',
      type: 'number',
      defaultValue: 0,
      min: 0,
      admin: {
        description:
          'Tickets sold on the previous WordPress site (korcula-moreska.com) before cutover. Subtracted from venue capacity so moreska.eu cannot oversell against them.',
      },
      access: {
        // Defense-in-depth: collection-level update is already admin-only,
        // but pinning the field guarantees door-staff (or any future role)
        // can never mutate it even if collection access is widened.
        update: ({ req }) => isAdmin(req.user as { role?: string } | null),
      },
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
  ],
}
