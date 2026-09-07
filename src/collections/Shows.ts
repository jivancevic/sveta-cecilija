import type { CollectionConfig } from 'payload'
import { can, hasAny } from '@/lib/access/permissions'

type ReqUser = { permissions?: unknown } | null | undefined

const backoffice = ({ req }: { req: { user: unknown } }) =>
  can(req.user as ReqUser, 'tickets')
// The door needs the schedule to scan against, so `door` reads shows too; only
// the backoffice may change one.
const staffRead = ({ req }: { req: { user: unknown } }) =>
  hasAny(req.user as ReqUser, ['tickets', 'door'])

export const Shows: CollectionConfig = {
  slug: 'shows',
  access: {
    read: staffRead,
    create: backoffice,
    update: backoffice,
    delete: backoffice,
  },
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'time', 'venue', 'onlineSold', 'inPersonSold', 'legacyReserved', 'status', 'onlineSalesPaused'],
    hidden: ({ user }) => !can(user as ReqUser, 'tickets'),
    components: {
      edit: {
        editMenuItems: [
          '@/components/payload/InPersonSalesMenuItem#InPersonSalesMenuItem',
          '@/components/payload/ViewOrdersForShowMenuItem#ViewOrdersForShowMenuItem',
          '@/components/payload/MarkMovedToZimskoMenuItem#MarkMovedToZimskoMenuItem',
          '@/components/payload/RescheduleShowMenuItem#RescheduleShowMenuItem',
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
        // Defense-in-depth: collection-level update is already admin-tier-only,
        // but pinning the field guarantees a door account (or any future
        // permission) can never mutate it even if collection access is widened.
        update: ({ req }) => can(req.user as ReqUser, 'tickets'),
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
    {
      name: 'onlineSalesPaused',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Pause ONLINE ticket sales for this show. The show stays listed on /tickets with an "online sales closed" note. Partner (POS) sales, comp tickets, door scanning and stats are unaffected. Uncheck to resume sales.',
      },
    },
    // Bad-weather venue-change audit (#94). Populated by the "Mark show as
    // moved to Zimsko" action; read-only in the admin. NULL = never moved.
    {
      name: 'venueChangedAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'When this show was moved Ljetno → Zimsko. NULL = not moved.',
        date: { pickerAppearance: 'dayAndTime' },
      },
      access: { update: () => false },
    },
    {
      name: 'venueChangedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        description: 'Admin who marked this show as moved to Zimsko.',
      },
      access: { update: () => false },
    },
    // Reschedule audit. Populated by the "Reschedule show & notify buyers"
    // action; read-only in the admin. NULL = never rescheduled. originalDate
    // keeps the very first scheduled date across repeated reschedules.
    {
      name: 'dateChangedAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'When this show was last rescheduled. NULL = never rescheduled.',
        date: { pickerAppearance: 'dayAndTime' },
      },
      access: { update: () => false },
    },
    {
      name: 'dateChangedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        description: 'Admin who last rescheduled this show.',
      },
      access: { update: () => false },
    },
    {
      name: 'originalDate',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'First scheduled date, before any reschedule. NULL = never rescheduled.',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
      },
      access: { update: () => false },
    },
  ],
}
