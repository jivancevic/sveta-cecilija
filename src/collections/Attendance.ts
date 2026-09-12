import type { CollectionConfig } from 'payload'
import {
  attendanceHiddenInAdmin,
  attendanceReadAccess,
  attendanceWriteAccess,
  resolveOwnMemberId,
  type MemberLinkReader,
} from '@/lib/access/attendance-access'

type ReqUser = { id?: string | number; permissions?: unknown; member?: unknown } | null | undefined

// One moreškant's answer for one performance (#422, ADR-0024 phase 3).
// Glossary: CONTEXT.md → *Attendance*.
//
// "No answer" is the ABSENCE of a row, which is why the unique index on
// (performance, member) matters: the app upserts on that pair and deletes the
// row to clear an answer. The rules about who may write what, and when, live in
// `src/lib/attendance/rules.ts` and are enforced by the answer route; this
// collection is the stock CRUD view a voditelj uses to fix a wrong row without
// the developer (#419, story 18), plus the row scoping for a dancer.
//
// Access is a pure predicate in src/lib/access/attendance-access.ts. Read is
// async for one reason: the caller's own Members link is re-read with
// `overrideAccess` (defence in depth: the field is locked to `users`), the
// same thing `/app`'s viewer does.
//
// WRITES ARE `moreska`-ONLY, deliberately narrower than reads. Payload's create
// operation only checks the access result for truthiness, so an own-rows
// `Where` there would have been a hole a dancer could POST straight through
// with the session cookie `/app` gives them. Dancers write through the answer
// route instead, which runs `overrideAccess: true` and applies the rules.
const scopedRead = async ({ req }: { req: { user: unknown; payload?: unknown } }) => {
  const user = req.user as ReqUser
  const ownMemberId = await resolveOwnMemberId(req.payload as MemberLinkReader | undefined, user)
  return attendanceReadAccess(user, ownMemberId)
}

const voditeljOnly = ({ req }: { req: { user: unknown } }) =>
  attendanceWriteAccess(req.user as ReqUser)

export const Attendance: CollectionConfig = {
  slug: 'attendance',
  labels: {
    singular: { en: 'Attendance', hr: 'Dolazak' },
    plural: { en: 'Attendance', hr: 'Dolasci' },
  },
  access: {
    read: scopedRead,
    create: voditeljOnly,
    update: voditeljOnly,
    delete: voditeljOnly,
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['performance', 'member', 'status', 'army', 'answeredAt'],
    // Roster data stays inside the voditelj circle: the backoffice, the door and
    // a partner never see this collection at all (#419, story 39).
    hidden: ({ user }) => attendanceHiddenInAdmin(user as ReqUser),
  },
  fields: [
    {
      name: 'performance',
      type: 'relationship',
      relationTo: 'shows',
      required: true,
      index: true,
      label: { en: 'Performance', hr: 'Nastup' },
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
      name: 'status',
      type: 'select',
      required: true,
      options: [
        { value: 'coming', label: { en: 'Coming', hr: 'Dolazi' } },
        { value: 'not_coming', label: { en: 'Not coming', hr: 'Ne dolazi' } },
      ],
      label: { en: 'Answer', hr: 'Odgovor' },
    },
    {
      name: 'army',
      type: 'select',
      options: [
        { value: 'crni', label: { en: 'Crni', hr: 'Crni' } },
        { value: 'bili', label: { en: 'Bili', hr: 'Bili' } },
      ],
      label: { en: 'Army', hr: 'Vojska' },
      admin: {
        description: {
          en: 'The army this answer counts in. Empty for a bula, who counts in neither.',
          hr: 'Vojska u kojoj se ovaj odgovor broji. Prazno za bulu, koja se ne broji ni u jednoj.',
        },
      },
    },
    {
      name: 'answeredBy',
      type: 'relationship',
      relationTo: 'users',
      label: { en: 'Answered by', hr: 'Odgovorio' },
      admin: {
        description: {
          en: 'The login that recorded this answer: the dancer themselves, or a voditelj answering on their behalf.',
          hr: 'Prijava koja je zabilježila ovaj odgovor: sam moreškant ili voditelj koji je odgovorio umjesto njega.',
        },
      },
    },
    {
      name: 'answeredAt',
      type: 'date',
      label: { en: 'Answered at', hr: 'Vrijeme odgovora' },
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
