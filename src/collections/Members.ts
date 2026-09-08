import { APIError, type CollectionConfig } from 'payload'
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

const moreskantFieldRead = (args: { req: { user: unknown } }) =>
  canReadMoreskantField(userOf(args))
const moreskantFieldWrite = (args: { req: { user: unknown } }) =>
  canEditMoreskantField(userOf(args))
const attributionFieldWrite = (args: { req: { user: unknown } }) =>
  canEditAttributionField(userOf(args))

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
    defaultColumns: ['name', 'nickname', 'primaryRole', 'isMoreskant', 'active'],
    // The comp-attribution list for the backoffice, the roster for the voditelj.
    hidden: ({ user }) => membersHiddenInAdmin(user as ReqUser),
  },
  hooks: {
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
      access: { update: attributionFieldWrite },
    },
    {
      name: 'note',
      type: 'textarea',
      label: { en: 'Note', hr: 'Bilješka' },
      access: { update: attributionFieldWrite },
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
      access: {
        read: moreskantFieldRead,
        update: moreskantFieldWrite,
        create: moreskantFieldWrite,
      },
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
      access: {
        read: moreskantFieldRead,
        update: moreskantFieldWrite,
        create: moreskantFieldWrite,
      },
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
      access: {
        read: moreskantFieldRead,
        update: moreskantFieldWrite,
        create: moreskantFieldWrite,
      },
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
      access: {
        read: moreskantFieldRead,
        update: moreskantFieldWrite,
        create: moreskantFieldWrite,
      },
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
      access: {
        read: moreskantFieldRead,
        update: moreskantFieldWrite,
        create: moreskantFieldWrite,
      },
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
      access: {
        read: moreskantFieldRead,
        update: moreskantFieldWrite,
        create: moreskantFieldWrite,
      },
    },
  ],
}
