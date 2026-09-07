import { APIError, type CollectionConfig } from 'payload'
import { can, hasAny } from '@/lib/access/permissions'
import {
  PerformanceValidationError,
  validateAndNormalisePerformance,
} from '@/lib/show-performance'

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
    defaultColumns: [
      'date',
      'time',
      'kind',
      'isPublic',
      'venue',
      'location',
      'client',
      'onlineSold',
      'inPersonSold',
      'legacyReserved',
      'status',
      'onlineSalesPaused',
    ],
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
  hooks: {
    // The kind/isPublic invariants (ADR-0024). The rules themselves are a pure,
    // unit-tested function in src/lib/show-performance.ts; this hook is only the
    // Payload plumbing. `beforeValidate` (not `beforeChange`) so the forced
    // values are in place before the field validators run.
    beforeValidate: [
      ({ data, originalDoc }) => {
        const patch = (data ?? {}) as Record<string, unknown>
        // On an update Payload hands us only the changed fields, so validate the
        // effective document, not the patch.
        const merged = { ...((originalDoc ?? {}) as Record<string, unknown>), ...patch }

        let normalised: Record<string, unknown>
        try {
          normalised = validateAndNormalisePerformance(merged)
        } catch (err) {
          if (err instanceof PerformanceValidationError) throw new APIError(err.message, 400)
          throw err
        }

        // Write back only the keys normalisation may have forced, so a partial
        // update stays partial.
        for (const key of ['venue', 'inPersonSold', 'legacyReserved', 'onlineSalesPaused']) {
          if (normalised[key] !== merged[key]) patch[key] = normalised[key]
        }
        return patch
      },
    ],
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
    // Every performance of the season lives in this collection (ADR-0024): the
    // 22 public Redovna shows that sell tickets, plus the ship calls, concerts
    // and one-offs that do not.
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'redovna',
      options: [
        { label: 'Redovna (public ticketed show)', value: 'redovna' },
        { label: 'Adriatic DMC', value: 'dmc' },
        { label: 'Gulliver', value: 'gulliver' },
        { label: 'Koncert', value: 'koncert' },
        { label: 'Ostalo', value: 'ostalo' },
      ],
      admin: {
        description:
          'Redovna is the public ticketed show. Every other kind is a private booking or a one-off and is never sold online.',
      },
    },
    {
      name: 'isPublic',
      type: 'checkbox',
      required: true,
      defaultValue: true,
      label: 'Public performance',
      admin: {
        description:
          'A public performance is listed on /tickets, sells seats against a venue capacity and is scanned at the door. Untick for a private booking: it then needs a location instead of a venue and never reaches a buyer. A Redovna is always public.',
      },
    },
    {
      name: 'venue',
      // Not `required`: a non-public performance has no venue (it has a
      // location). "Public ⇒ venue" is enforced by the beforeValidate hook.
      type: 'select',
      options: [
        { label: 'Ljetno kino (320)', value: 'ljetno-kino' },
        { label: 'Zimsko kino / Centar za kulturu (250)', value: 'zimsko-kino' },
      ],
      admin: {
        description: 'Public performances only. Capacity is derived from the venue.',
      },
    },
    {
      name: 'location',
      type: 'text',
      admin: {
        description:
          'Free-text place for a non-public performance, e.g. "Zimsko kino", "Sv. Justina", "Spomenik sv. Todora". Required when the performance is not public.',
      },
    },
    {
      name: 'client',
      type: 'text',
      admin: {
        description:
          'The ship or the organiser behind a private booking, e.g. "Le Ponant", "NG Orion". Optional.',
      },
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
    // Roster fields (ADR-0024). Nothing reads them yet — phase 3 (attendance,
    // army alarm, lineup) does. They carry no field-level access in this phase.
    {
      name: 'thresholdCrni',
      type: 'number',
      required: true,
      defaultValue: 8,
      min: 0,
      admin: {
        description: 'Minimum number of crni moreškanti for this performance. Default 8.',
      },
    },
    {
      name: 'thresholdBili',
      type: 'number',
      required: true,
      defaultValue: 8,
      min: 0,
      admin: {
        description: 'Minimum number of bili moreškanti for this performance. Default 8.',
      },
    },
    {
      name: 'voditeljNote',
      type: 'textarea',
      admin: {
        description:
          'Note from the voditelj for the moreškanti, e.g. "meet at the harbour gate at 9:30".',
      },
    },
  ],
}
