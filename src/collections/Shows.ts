import { APIError, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload'
import {
  canEditPlacementField,
  canEditRosterField,
  canEditScheduleField,
  canReadRosterField,
  canSetPublicFlag,
  nonPublicAuthoringOverrides,
  showsCreateAccess,
  showsDeleteAccess,
  showsHiddenInAdmin,
  showsReadAccess,
  showsUpdateAccess,
} from '@/lib/access/shows-access'
import { notifyRosterOnShowChange } from '@/lib/push/shows-hook'
import {
  PerformanceValidationError,
  isPublicPerformance,
  validateAndNormalisePerformance,
} from '@/lib/show-performance'

type ReqUser = { permissions?: unknown } | null | undefined

// Every rule is a pure predicate in src/lib/access/shows-access.ts (#408); the
// wrappers below are only Payload's calling convention.
const userOf = ({ req }: { req: { user: unknown } }) => req.user as ReqUser

// The schedule and sales fields: `tickets` always, a voditelj on a non-public
// row only.
const scheduleFieldUpdate = ({
  req,
  doc,
}: {
  req: { user: unknown }
  doc?: Record<string, unknown>
}) => canEditScheduleField(req.user as ReqUser, doc)

// The roster fields belong to the voditelj on every row, public or not.
const rosterFieldRead = ({ req }: { req: { user: unknown } }) =>
  canReadRosterField(req.user as ReqUser)
const rosterFieldUpdate = ({ req }: { req: { user: unknown } }) =>
  canEditRosterField(req.user as ReqUser)

// #409 — on a non-public performance the form is about the performance, not
// about tickets: no venue, no counters, no sales pause, no bad-weather or
// reschedule audit trail. Those fields are hidden rather than shown empty, so
// the edit view reads as what it is. `siblingData` is the same object as `data`
// for these top-level fields; a brand-new document carries no value yet and the
// column defaults to true, which `isPublicPerformance` already models.
const publicPerformanceOnly = (
  data: Record<string, unknown>,
  siblingData: Record<string, unknown>,
): boolean => {
  const row = siblingData && 'isPublic' in siblingData ? siblingData : (data ?? {})
  return isPublicPerformance(row)
}

// Cascade the attendance rows when a performance is deleted (#422).
//
// `attendance.performance_id` is `ON DELETE SET NULL` (Payload's generated
// default for a relationship column) on a `NOT NULL` column, so the database
// alone cannot delete a performance that still carries answers — it errors with
//   null value in column "performance_id" of relation "attendance"
//   violates not-null constraint
// which reaches the admin as a failed delete. Flipping the FK to CASCADE in
// db/schema is not an option: the drift gate mirrors Payload's push and
// 00-base.sql is regenerated from one, so the change would be silently
// reverted. Same reasoning, same shape and same transaction as
// `cascadeOrderTicketsDelete` in Orders.ts — pass `req` so the answers and the
// performance commit or roll back together.
//
// Runs for every delete, single or bulk: beforeDelete fires per document.
export const cascadeShowAttendanceDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  await req.payload.delete({
    collection: 'attendance',
    where: { performance: { equals: id } },
    req,
    overrideAccess: true,
  })
}

// Cascade the lineup rows when a performance is deleted (#432, story 36).
//
// The exact mirror of `cascadeShowAttendanceDelete` and for the same reason:
// `lineups.performance_id` is `ON DELETE SET NULL` (Payload's generated shape)
// on a `NOT NULL` column, so the database alone refuses to delete a performance
// that still carries a postava. Same transaction as the delete itself, so the
// rows and the performance commit or roll back together.
export const cascadeShowLineupDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  await req.payload.delete({
    collection: 'lineups',
    where: { performance: { equals: id } },
    req,
    overrideAccess: true,
  })
}

export const Shows: CollectionConfig = {
  slug: 'shows',
  access: {
    read: (args) => showsReadAccess(userOf(args)),
    create: (args) => showsCreateAccess(userOf(args)),
    update: (args) => showsUpdateAccess(userOf(args)),
    delete: (args) => showsDeleteAccess(userOf(args)),
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
    hidden: ({ user }) => showsHiddenInAdmin(user as ReqUser),
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
    // Delete a performance's attendance and lineup rows before the performance
    // itself: both FKs are SET NULL on a NOT NULL column (#422, #432).
    beforeDelete: [cascadeShowAttendanceDelete, cascadeShowLineupDelete],
    // Tell the roster what changed (#436): a create pushes "nova izvedba", a
    // save that moved the date, the time, the place, the cancelled status or
    // the voditelj note pushes what changed, and a moved start additionally
    // releases the alarm/reminder claims so the cron reschedules. Everything
    // is decided in src/lib/push/notify.ts and nothing here can fail a save.
    afterChange: [notifyRosterOnShowChange],
    // The kind/isPublic invariants (ADR-0024). The rules themselves are a pure,
    // unit-tested function in src/lib/show-performance.ts; this hook is only the
    // Payload plumbing. `beforeValidate` (not `beforeChange`) so the forced
    // values are in place before the field validators run.
    beforeValidate: [
      ({ data, originalDoc, operation, req }) => {
        const patch = (data ?? {}) as Record<string, unknown>
        // On an update Payload hands us only the changed fields, so validate the
        // effective document, not the patch.
        const merged = { ...((originalDoc ?? {}) as Record<string, unknown>), ...patch }

        // A voditelj (`moreska` without `tickets`) can never author a public
        // performance. This runs AFTER Payload's field-access pass, which is
        // what makes it the last word — see nonPublicAuthoringOverrides.
        const overrides = nonPublicAuthoringOverrides(
          (req as { user?: unknown } | undefined)?.user as ReqUser,
          operation as string,
          merged,
        )
        Object.assign(patch, overrides)
        Object.assign(merged, overrides)

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
      // A voditelj may correct the date of a private booking, never of a public
      // show: moving one mails every buyer (#404, stories 3 and 10).
      access: { update: scheduleFieldUpdate },
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
      access: { update: scheduleFieldUpdate },
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
      // Settable on create by anyone who may create a performance (a voditelj
      // enters a new DMC or Gulliver booking); afterwards it follows the
      // schedule rule.
      access: { update: scheduleFieldUpdate },
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
      // Only the ticket backoffice decides what is on sale. A voditelj's create
      // is additionally forced non-public by the beforeValidate hook, because a
      // denied field falls back to this field's `true` default.
      access: {
        create: ({ req }) => canSetPublicFlag(req.user as ReqUser),
        update: ({ req }) => canSetPublicFlag(req.user as ReqUser),
      },
    },
    {
      name: 'venue',
      // Not `required`: a non-public performance has no venue (it has a
      // location). "Public ⇒ venue" is enforced by the beforeValidate hook.
      type: 'select',
      options: [
        { label: 'Ljetno kino (350)', value: 'ljetno-kino' },
        { label: 'Zimsko kino / Centar za kulturu (250)', value: 'zimsko-kino' },
      ],
      admin: {
        description: 'Public performances only. Capacity is derived from the venue.',
        condition: publicPerformanceOnly,
      },
      access: { update: scheduleFieldUpdate },
    },
    {
      name: 'location',
      type: 'text',
      admin: {
        description:
          'Free-text place for a non-public performance, e.g. "Zimsko kino", "Sv. Justina", "Spomenik sv. Todora". Required when the performance is not public.',
      },
      // Readable by anyone who can read the row; the voditelj maintains it.
      access: { update: ({ req }) => canEditPlacementField(req.user as ReqUser) },
    },
    {
      name: 'client',
      type: 'text',
      admin: {
        description:
          'The ship or the organiser behind a private booking, e.g. "Le Ponant", "NG Orion". Optional.',
      },
      access: { update: ({ req }) => canEditPlacementField(req.user as ReqUser) },
    },
    {
      name: 'onlineSold',
      type: 'number',
      defaultValue: 0,
      admin: { condition: publicPerformanceOnly },
      access: { update: scheduleFieldUpdate },
    },
    {
      name: 'inPersonSold',
      type: 'number',
      defaultValue: 0,
      admin: {
        condition: publicPerformanceOnly,
        // READ-ONLY: since ADR-0025 this is a cache of the offline sales ledger,
        // not a number anyone types. Hand-editing it puts money and seats out of
        // step with no screen showing the drift. Record a sale (or a negative
        // correction) through the ledger instead.
        readOnly: true,
        description:
          'Tickets sold at the door. Maintained from the sales ledger — use "Add sales at the door" rather than editing this.',
      },
      access: { update: scheduleFieldUpdate },
    },
    {
      name: 'legacyReserved',
      type: 'number',
      defaultValue: 0,
      min: 0,
      admin: {
        description:
          'Tickets sold on the previous WordPress site (korcula-moreska.com) before cutover. Maintained from the sales ledger — use "Add sales at the door" and pick the previous site, rather than editing this.',
        condition: publicPerformanceOnly,
        // READ-ONLY for the same reason as inPersonSold: a cache, not an input.
        readOnly: true,
      },
      access: {
        // Defense-in-depth: pinning the field guarantees a door account, a
        // voditelj or any future permission can never mutate a sales counter
        // even if collection access is widened.
        update: scheduleFieldUpdate,
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
      // A voditelj cancels a private booking (#404, story 5); cancelling a
      // public show mails buyers and stays with the backoffice.
      access: { update: scheduleFieldUpdate },
    },
    {
      name: 'onlineSalesPaused',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Pause ONLINE ticket sales for this show. The show stays listed on /tickets with an "online sales closed" note. Partner (POS) sales, comp tickets, door scanning and stats are unaffected. Uncheck to resume sales.',
        condition: publicPerformanceOnly,
      },
      access: { update: scheduleFieldUpdate },
    },
    // Bad-weather venue-change audit (#94). Populated by the "Mark show as
    // moved to Zimsko" action; read-only in the admin. NULL = never moved.
    {
      name: 'venueChangedAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'When this show was moved Ljetno → Zimsko. NULL = not moved.',
        condition: publicPerformanceOnly,
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
        condition: publicPerformanceOnly,
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
        condition: publicPerformanceOnly,
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
        condition: publicPerformanceOnly,
      },
      access: { update: () => false },
    },
    {
      name: 'originalDate',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'First scheduled date, before any reschedule. NULL = never rescheduled.',
        condition: publicPerformanceOnly,
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
      },
      access: { update: () => false },
    },
    // Roster fields (ADR-0024). Phase 3 (attendance, army alarm, lineup) reads
    // them; here they are the voditelj's alone — a `tickets`-only holder never
    // sees them, in the form or in the API response (#404, story 20).
    {
      name: 'thresholdCrni',
      type: 'number',
      required: true,
      defaultValue: 8,
      min: 0,
      admin: {
        description: 'Minimum number of crni moreškanti for this performance. Default 8.',
      },
      access: { read: rosterFieldRead, update: rosterFieldUpdate },
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
      access: { read: rosterFieldRead, update: rosterFieldUpdate },
    },
    // The lineup's confirmation, one flag per evening (#432, story 31). It is
    // NOT a per-row column: a postava is confirmed as a whole, and half a
    // confirmed evening is not a state anyone means. `/app` writes it through
    // POST /api/app/lineup/confirm; here it is the voditelj's field like the
    // thresholds and the note.
    {
      name: 'lineupConfirmed',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Confirmed lineup: locked against edits, visible to every moreškant, and the only kind that counts in the season statistics.',
      },
      access: { read: rosterFieldRead, update: rosterFieldUpdate },
    },
    {
      name: 'lineupConfirmedAt',
      type: 'date',
      admin: {
        description: 'When the lineup was confirmed. Cleared again when it is unlocked.',
        date: { pickerAppearance: 'dayAndTime' },
      },
      access: { read: rosterFieldRead, update: rosterFieldUpdate },
    },
    {
      name: 'voditeljNote',
      type: 'textarea',
      admin: {
        description:
          'Note from the voditelj for the moreškanti, e.g. "meet at the harbour gate at 9:30".',
      },
      access: { read: rosterFieldRead, update: rosterFieldUpdate },
    },
  ],
}
