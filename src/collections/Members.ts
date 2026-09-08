import { APIError, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload'
import {
  canEditAttributionField,
  canEditMoreskantField,
  canReadMoreskantField,
  membersCreateAccess,
  membersDeleteAccess,
  membersHiddenInAdmin,
  membersReadAccess,
  membersUpdateAccess,
} from '@/lib/access/members-access'
import { memberIdsWithLogin, type UserLinkFinder } from '@/lib/access/member-logins'
import {
  DANCE_ROLES,
  DANCE_ROLE_LABELS,
  MoreskantProfileError,
  isMoreskantRow,
  validateAndNormaliseMoreskant,
} from '@/lib/moreskant-profile'

type ReqUser = { id?: string | number; permissions?: unknown } | null | undefined

// HGD society members. Two things at once since #420 (ADR-0024 phase 3):
//
//   - the attribution target for comp (goodwill) tickets and member promo codes
//     (ADR-0019) — `name`, `active`, `note`, owned by `tickets`;
//   - a **moreškant**: a dancer with a nickname, dance roles and a primary role,
//     owned by `moreska`. One person, one row.
//
// The six moreškant fields are invisible and unwritable to a `tickets`-only
// holder, and the attribution half is not the voditelj's to rename. Every rule
// is a pure predicate in src/lib/access/members-access.ts; the wrappers below
// are only Payload's calling convention.
const userOf = ({ req }: { req: { user: unknown } }) => req.user as ReqUser

const attributionFieldWrite = (args: { req: { user: unknown } }) =>
  canEditAttributionField(userOf(args))

/**
 * The lock every moreškant field carries: `moreska` reads it, `moreska` writes
 * it, on create and on update alike. One object rather than six copies, so the
 * seventh field cannot be added with a different rule by accident.
 */
const MORESKANT_FIELD_ACCESS = {
  read: (args: { req: { user: unknown } }) => canReadMoreskantField(userOf(args)),
  update: (args: { req: { user: unknown } }) => canEditMoreskantField(userOf(args)),
  create: (args: { req: { user: unknown } }) => canEditMoreskantField(userOf(args)),
}

/** Admin options for the dance-role selects; the vocabulary itself is in lib. */
const DANCE_ROLE_OPTIONS = DANCE_ROLES.map((value) => ({
  value,
  label: { en: DANCE_ROLE_LABELS[value], hr: DANCE_ROLE_LABELS[value] },
}))

/** The moreškant fields only make sense once the row is flagged as a dancer. */
const moreskantOnly = (_data: unknown, siblingData: Record<string, unknown>) =>
  isMoreskantRow(siblingData ?? {})

type PayloadLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Record<string, unknown>[] }>
}

/**
 * Nicknames held by the OTHER moreškanti. Loaded only when the row being saved
 * is itself a moreškant, so a comp-attribution save costs no extra query.
 * `overrideAccess` is the local API default here; the field lock is about who
 * may *edit*, not about what the uniqueness check may see.
 */
async function otherNicknames(
  payload: PayloadLike | undefined,
  selfId: unknown,
): Promise<string[]> {
  if (!payload?.find) return []
  const where: Record<string, unknown> = { isMoreskant: { equals: true } }
  const result = await payload.find({
    collection: 'members',
    where:
      selfId == null
        ? where
        : { and: [where, { id: { not_equals: selfId } }] },
    limit: 1000,
    depth: 0,
    pagination: false,
  })
  return result.docs.map((d) => (typeof d.nickname === 'string' ? d.nickname : ''))
}

// Cascade the attendance rows when a Member is deleted (#422).
//
// The mirror of `cascadeShowAttendanceDelete` on Shows, for the same reason:
// `attendance.member_id` is `ON DELETE SET NULL` on a `NOT NULL` column, so a
// Member who has ever answered cannot be deleted while those rows exist. Only
// a `tickets` holder can delete a Member at all (a voditelj retires a dancer
// with `active`), but when they do, the answers have to go with the row.
//
// Comp orders and promo codes point at Members through NULLABLE columns, so
// they are deliberately left alone: attribution history survives a deletion as
// a null, which is what ADR-0019 wants.
export const cascadeMemberAttendanceDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  await req.payload.delete({
    collection: 'attendance',
    where: { member: { equals: id } },
    req,
    overrideAccess: true,
  })
}

export const Members: CollectionConfig = {
  slug: 'members',
  labels: {
    singular: { en: 'Member', hr: 'Član' },
    plural: { en: 'Members', hr: 'Članovi' },
  },
  access: {
    read: (args) => membersReadAccess(userOf(args)),
    create: (args) => membersCreateAccess(userOf(args)),
    update: (args) => membersUpdateAccess(userOf(args)),
    delete: (args) => membersDeleteAccess(userOf(args)),
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'nickname', 'primaryRole', 'isMoreskant', 'hasLogin', 'active'],
    // The comp-attribution list for the backoffice, the roster for the voditelj.
    hidden: ({ user }) => membersHiddenInAdmin(user as ReqUser),
    components: {
      // "Pošalji pozivnicu" (#424), the Members mirror of the five Shows
      // edit-menu actions. It renders only on a saved moreškant row, and the
      // route it posts to re-checks `moreska` itself.
      edit: {
        editMenuItems: ['@/components/payload/InviteMoreskantMenuItem#InviteMoreskantMenuItem'],
      },
    },
  },
  hooks: {
    // Delete a member's attendance rows before the member itself.
    beforeDelete: [cascadeMemberAttendanceDelete],
    // The moreškant profile invariants (ADR-0024). The rules are a pure,
    // unit-tested function in src/lib/moreskant-profile.ts; this hook only
    // merges the patch onto the stored row, loads the nicknames the uniqueness
    // rule needs, and re-wraps the error as a clean 400.
    beforeValidate: [
      async ({ data, originalDoc, req }) => {
        const patch = (data ?? {}) as Record<string, unknown>
        // On an update Payload hands us only the changed fields, so validate the
        // effective document, not the patch.
        const merged = { ...((originalDoc ?? {}) as Record<string, unknown>), ...patch }
        if (!isMoreskantRow(merged)) return patch

        const taken = await otherNicknames(
          (req as unknown as { payload?: PayloadLike } | undefined)?.payload,
          (originalDoc as { id?: unknown } | undefined)?.id,
        )

        let normalised: Record<string, unknown>
        try {
          normalised = validateAndNormaliseMoreskant(merged, { otherNicknames: taken })
        } catch (err) {
          if (err instanceof MoreskantProfileError) throw new APIError(err.message, 400)
          throw err
        }

        // Write back only the keys normalisation may have touched, so a partial
        // update stays partial.
        for (const key of ['nickname', 'mobile', 'email']) {
          if (key in patch && normalised[key] !== merged[key]) patch[key] = normalised[key]
        }
        return patch
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { en: 'Name', hr: 'Ime' },
      // Create stays open (a voditelj may add a dancer, and `name` is
      // required); renaming reaches comp reporting and is the backoffice's.
      access: { update: attributionFieldWrite },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: { en: 'Active', hr: 'Aktivan' },
      admin: {
        description:
          'Retired members drop out of the picker without deleting their history',
      },
      // Create is locked too: a voditelj adding a dancer must not be able to
      // file them as already retired. The field default (true) survives the
      // lock — Payload falls back to it when access strips the value.
      access: { update: attributionFieldWrite, create: attributionFieldWrite },
    },
    {
      name: 'note',
      type: 'textarea',
      label: { en: 'Note', hr: 'Bilješka' },
      // Comp-reporting free text, on create as on update.
      access: { update: attributionFieldWrite, create: attributionFieldWrite },
    },
    // ---------------------------------------------------------------------
    // The moreškant half (#420, ADR-0024). `moreska` only, read and write.
    // ---------------------------------------------------------------------
    {
      name: 'isMoreskant',
      type: 'checkbox',
      defaultValue: false,
      label: { en: 'Moreškant (dancer)', hr: 'Moreškant (plesač)' },
      admin: {
        description: {
          en: 'Tick to make this member a dancer: nickname, dance roles and a primary role become required.',
          hr: 'Označi da je ovaj član plesač: nadimak, plesne uloge i glavna uloga postaju obavezni.',
        },
      },
      access: MORESKANT_FIELD_ACCESS,
    },
    {
      name: 'nickname',
      type: 'text',
      label: { en: 'Nickname', hr: 'Nadimak' },
      admin: {
        condition: moreskantOnly,
        description: {
          en: 'The name shown everywhere in the Moreškant app. Required and unique among moreškanti.',
          hr: 'Ime koje se prikazuje svugdje u aplikaciji Moreškant. Obavezan i jedinstven među moreškantima.',
        },
      },
      access: MORESKANT_FIELD_ACCESS,
    },
    {
      name: 'mobile',
      type: 'text',
      label: { en: 'Mobile', hr: 'Mobitel' },
      admin: {
        condition: moreskantOnly,
        description: {
          en: 'Visible to other moreškanti in the app so they can call each other.',
          hr: 'Vidljiv ostalim moreškantima u aplikaciji kako bi se mogli nazvati.',
        },
      },
      access: MORESKANT_FIELD_ACCESS,
    },
    {
      name: 'email',
      type: 'text',
      label: { en: 'Email', hr: 'E-mail' },
      admin: {
        condition: moreskantOnly,
        description: {
          en: 'Where the app invitation is sent. Never shown to other moreškanti.',
          hr: 'Adresa na koju se šalje pozivnica za aplikaciju. Nikad se ne prikazuje drugim moreškantima.',
        },
      },
      access: MORESKANT_FIELD_ACCESS,
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      label: { en: 'Dance roles', hr: 'Plesne uloge' },
      options: DANCE_ROLE_OPTIONS,
      admin: {
        condition: moreskantOnly,
        description: {
          en: 'Everything this moreškant can dance. A king or an otmanović also needs the plain army role.',
          hr: 'Sve što ovaj moreškant može plesati. Kralj ili otmanović traži i osnovnu ulogu svoje vojske.',
        },
      },
      access: MORESKANT_FIELD_ACCESS,
    },
    {
      name: 'primaryRole',
      type: 'select',
      label: { en: 'Primary role', hr: 'Glavna uloga' },
      options: DANCE_ROLE_OPTIONS,
      admin: {
        condition: moreskantOnly,
        description: {
          en: 'The one role shown on the profile card. Must be among the dance roles above.',
          hr: 'Uloga koja se prikazuje na profilu. Mora biti među plesnim ulogama iznad.',
        },
      },
      access: MORESKANT_FIELD_ACCESS,
    },
    // "Ima prijavu": has this dancer been invited yet (#424, #419 story 9)?
    //
    // Virtual, so it owns no column and cannot drift from the truth, which
    // lives in `users.member`. The value is filled by ONE `find` per request,
    // memoized on `req.context` and shared by every row of the list view
    // (`src/lib/access/member-logins.ts`); a per-row lookup or a fetching Cell
    // component would both cost a query per rendered line.
    {
      name: 'hasLogin',
      type: 'checkbox',
      virtual: true,
      label: { en: 'Has login', hr: 'Ima prijavu' },
      admin: {
        readOnly: true,
        condition: moreskantOnly,
        description: {
          en: 'Whether an app login already points at this member. Filled by the invitation.',
          hr: 'Postoji li već prijava za ovog člana. Ispunjava je pozivnica.',
        },
      },
      access: {
        // Roster knowledge, like the six fields above: `moreska` only. Nothing
        // writes it, so create and update are closed to everyone.
        read: MORESKANT_FIELD_ACCESS.read,
        create: () => false,
        update: () => false,
      },
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            const memberId = data?.id
            if (memberId == null) return false
            const ids = await memberIdsWithLogin(
              (req as unknown as { payload?: UserLinkFinder } | undefined)?.payload,
              (req as unknown as { context?: Record<string, unknown> } | undefined)?.context,
            )
            return ids.has(String(memberId))
          },
        ],
      },
    },
  ],
}
