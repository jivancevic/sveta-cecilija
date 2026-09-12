import type { CollectionConfig } from 'payload'
import {
  lineupHiddenInAdmin,
  lineupReadAccess,
  lineupWriteAccess,
} from '@/lib/access/lineup-access'
import { DANCE_ROLE_LABELS, DANCE_ROLES } from '@/lib/moreskant-profile'

type ReqUser = { id?: string | number; permissions?: unknown } | null | undefined

// One moreškant's dance role at one performance (#432, ADR-0024 phase 4).
// Glossary: CONTEXT.md → *Lineup (postava)*.
//
// Exactly one role per member per performance (story 30, "statistics never
// double count"), which is what the unique index on (performance, member)
// carries — Payload's push never emits a two-column unique index, so
// `db/schema/migrate-zz-b-lineups.sql` is its only home.
//
// Confirmation is NOT here: it is one flag per evening
// (`shows.lineupConfirmed`), because a lineup is confirmed as a whole and a
// per-row flag would let half an evening be final.
//
// The rules about who writes what live in `src/lib/lineup/rules.ts` and are
// enforced by `POST /api/app/lineup`; this collection is the stock CRUD view a
// voditelj uses to fix a wrong row without the developer, plus the row scoping
// for a dancer.
const scopedRead = ({ req }: { req: { user: unknown } }) =>
  lineupReadAccess(req.user as ReqUser)

const voditeljOnly = ({ req }: { req: { user: unknown } }) =>
  lineupWriteAccess(req.user as ReqUser)

export const Lineups: CollectionConfig = {
  slug: 'lineups',
  labels: {
    singular: { en: 'Lineup entry', hr: 'Postava' },
    plural: { en: 'Lineup', hr: 'Postave' },
  },
  access: {
    read: scopedRead,
    create: voditeljOnly,
    update: voditeljOnly,
    delete: voditeljOnly,
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['performance', 'member', 'role'],
    hidden: ({ user }) => lineupHiddenInAdmin(user as ReqUser),
  },
  fields: [
    {
      name: 'performance',
      type: 'relationship',
      relationTo: 'shows',
      required: true,
      index: true,
      label: { en: 'Performance', hr: 'Izvedba' },
    },
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      index: true,
      label: { en: 'Moreškant', hr: 'Moreškant' },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      // The vocabulary itself is spelled out once, in moreskant-profile.ts.
      options: DANCE_ROLES.map((role) => ({
        value: role,
        label: { en: DANCE_ROLE_LABELS[role], hr: DANCE_ROLE_LABELS[role] },
      })),
      label: { en: 'Danced as', hr: 'Plesao kao' },
      admin: {
        description: {
          en: 'The role this moreškant actually danced. A role outside their profile is allowed: it is a warning in the app, not a rule.',
          hr: 'Uloga koju je moreškant stvarno plesao. Uloga izvan njegovog profila je dopuštena: u aplikaciji je upozorenje, ne pravilo.',
        },
      },
    },
  ],
}
