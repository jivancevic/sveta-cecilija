import { APIError, type CollectionConfig } from 'payload'
import { PERMISSIONS, can, type Permission } from '@/lib/access/permissions'
import { assertUserEmailPolicy, UserEmailRequiredError } from '@/lib/access/user-email-policy'
import { userUpdateAccess } from '@/lib/access/user-self-update'
import { ADMIN_LANG_COOKIE, seedAdminLangCookie } from '@/lib/admin-i18n'

type ReqUser = { id?: string | number; permissions?: unknown; shared?: unknown } | null | undefined

// Account administration is the `users` permission and nothing else — the
// account that holds it is what "superadmin" used to name (ADR-0023).
const usersOnly = ({ req }: { req: { user: unknown } }) =>
  can(req.user as ReqUser, 'users')

// Admin labels for the permission vocabulary (ADR-0023). The values are the
// single source of truth in lib/access/permissions.ts; this map only decides
// how each one reads in the /admin multi-select, EN and HR.
const PERMISSION_LABELS: Record<Permission, { en: string; hr: string }> = {
  users: { en: 'Users and permissions', hr: 'Korisnici i dozvole' },
  tickets: { en: 'Ticketing backoffice', hr: 'Uredski dio prodaje ulaznica' },
  refunds: { en: 'Refunds', hr: 'Povrati novca' },
  door: { en: 'Door (scanning)', hr: 'Ulaz (skeniranje)' },
  partner: { en: 'Partner sales (own partner only)', hr: 'Partnerska prodaja (samo vlastiti partner)' },
  season_stats: { en: 'Season ticket dashboard', hr: 'Sezonska ploča s prodajom' },
  moreska: { en: 'Moreška roster (voditelj)', hr: 'Postava moreške (voditelj)' },
  moreskant: { en: 'Own moreškant view', hr: 'Vlastiti moreškantski pregled' },
  dev: { en: 'Developer diagnostics', hr: 'Razvojna dijagnostika' },
}

// Visibility rule for the `partner` relationship field. Payload hands the
// condition the form's data, not a user, so this reads the edited document:
// the field belongs on an account that sells for a partner.
export function showPartnerLinkField(data?: { permissions?: unknown }): boolean {
  const perms = data?.permissions
  return Array.isArray(perms) && perms.includes('partner')
}

// Holder of the `users` permission — the only person who may see or change a
// permission set or the shared flag, their own record included (ADR-0023).
const usersHolder = (user: ReqUser) => can(user as { permissions?: unknown } | null, 'users')

// A `users` holder sees everyone; any other authed user sees only their own
// record. Combined with admin.hidden below, nobody else has an entry point to
// the Users UI at all — the self-row access exists only to support the profile
// edit page reached from a top-bar account link.
const selfOrUsersHolder = ({ req }: { req: { user: unknown } }) => {
  const user = req.user as ReqUser
  if (can(user, 'users')) return true
  if (!user?.id) return false
  return { id: { equals: user.id } }
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30, // 30 days; covers the shared tehnika device
    // Hybrid username login (ADR-0010, #175). `username` is the canonical
    // identifier so non-email logins (the shared `tehnika` door account, partner
    // POS logins, a dev `admin`) work without the email-format error Payload
    // otherwise enforces on the login field. Users who have an email can still
    // log in with it (`allowEmailLogin`); email is optional at the auth layer
    // (`requireEmail: false`) — the beforeValidate hook below re-requires it for
    // the human tiers only.
    loginWithUsername: {
      allowEmailLogin: true,
      requireEmail: false,
    },
  },
  hooks: {
    // Seed the admin chrome language on login (issue #234, ADR-0015). A fresh
    // staff login has no `payload-lng` cookie yet, so the chrome would otherwise
    // fall back to Accept-Language / English. We seed it to the permission-based
    // default (English for a `dev` holder or a door-only account, Croatian
    // otherwise) the first time, and leave any existing valid choice alone — the native
    // account-settings selector writes the same cookie, so a user's saved
    // choice always wins. cookies().set works inside the admin login server
    // action; in a non-request scope (e.g. a seed script calling payload.login)
    // next/headers throws, so we swallow and skip.
    afterLogin: [
      async ({ user }) => {
        try {
          const { cookies } = await import('next/headers')
          const store = await cookies()
          const next = seedAdminLangCookie({
            existing: store.get(ADMIN_LANG_COOKIE)?.value,
            user: user as { permissions?: unknown } | null,
          })
          if (next) {
            store.set({
              name: ADMIN_LANG_COOKIE,
              value: next,
              path: '/',
              maxAge: 60 * 60 * 24 * 365,
            })
          }
        } catch {
          // No writable request scope — nothing to seed. The dashboard's own
          // resolveAdminLang() still applies the same default as a safety net.
        }
        return user
      },
    ],
    // Conditional email requirement: an account held by a named person
    // (`users`, `tickets` or `moreska`) must have an email; door, partner and
    // season_stats accounts may be username-only. Merge incoming data over the
    // existing doc so an update that touches only one field is judged on the
    // resulting record — and an explicit `email: null` is honoured, not masked
    // by the original value.
    beforeValidate: [
      ({ data, originalDoc }) => {
        const permissions =
          data && 'permissions' in data ? data.permissions : originalDoc?.permissions
        const email = data && 'email' in data ? data.email : originalDoc?.email
        try {
          assertUserEmailPolicy({ permissions, email })
        } catch (e) {
          // Surface as a clean 400 validation error in /admin, not a generic 500.
          if (e instanceof UserEmailRequiredError) throw new APIError(e.message, 400)
          throw e
        }
        return data
      },
    ],
  },
  access: {
    read: selfOrUsersHolder,
    // Update is NOT the mirror of read: an account flagged `shared` is denied
    // self-edit so no single holder can rotate a shared password (ADR-0022).
    // Rule lives in user-self-update.ts, where it is unit-tested.
    update: ({ req }: { req: { user: unknown } }) => userUpdateAccess(req.user as ReqUser),
    create: usersOnly,
    delete: usersOnly,
  },
  admin: {
    useAsTitle: 'email',
    // Hide Users from the sidebar for everyone but a `users` holder (ADR-0006:
    // only the developer manages accounts; the secretary, the door and a
    // partner get no Users entry). The top-bar Account link routes to the
    // dedicated `/admin/account` view — NOT this collection's edit page — so
    // hiding the collection does not 404 the profile page (verified on Payload
    // v3.84; an earlier comment here predated that routing and left Users
    // leaking into every sidebar, including the partner's). Direct
    // `/admin/collections/users` still 404s for everyone else, which is the
    // intended lockdown.
    hidden: ({ user }) => !can(user as ReqUser, 'users'),
  },
  fields: [
    // The permission set (ADR-0023) — the source of every access decision in
    // the admin since #395. Vocabulary comes from lib/access/permissions.ts; do
    // not re-type the list here or anywhere else.
    {
      name: 'permissions',
      type: 'select',
      hasMany: true,
      required: true,
      label: { en: 'Permissions', hr: 'Dozvole' },
      options: PERMISSIONS.map((value) => ({ value, label: PERMISSION_LABELS[value] })),
      admin: {
        description: {
          en: 'What this account may do. A user without "users" can neither see nor change any permission set.',
          hr: 'Što ovaj račun smije raditi. Korisnik bez dozvole "users" ne vidi niti mijenja nijedan skup dozvola.',
        },
      },
      access: {
        // Field-level lock: only a `users` holder
        // reads or writes a permission set — their own record included, so a
        // secretary cannot grant herself anything (Users.access.update allows
        // self-edit). `can(user, 'users')` and nothing else: no role alias
        // survives, so "superadmin" is only shorthand for holding every
        // permission. The bootstrap migration gives the developer's row `users`
        // before anyone logs in, so there is no chicken-and-egg.
        read: ({ req }) => usersHolder(req.user as ReqUser),
        update: ({ req }) => usersHolder(req.user as ReqUser),
        create: ({ req }) => usersHolder(req.user as ReqUser),
      },
    },
    // Marks a login shared by several people (the door `tehnika` account, the
    // society-wide `member` account). The only place that knowledge lives:
    // userUpdateAccess reads it, so a shared account may not edit itself and one
    // volunteer cannot lock the others out by rotating the password.
    {
      name: 'shared',
      type: 'checkbox',
      defaultValue: false,
      label: { en: 'Shared account', hr: 'Zajednički račun' },
      admin: {
        description: {
          en: 'Several people use this login. A shared account cannot edit its own record.',
          hr: 'Ovu prijavu koristi više osoba. Zajednički račun ne može uređivati vlastiti zapis.',
        },
      },
      access: {
        read: ({ req }) => usersHolder(req.user as ReqUser),
        update: ({ req }) => usersHolder(req.user as ReqUser),
        create: ({ req }) => usersHolder(req.user as ReqUser),
      },
    },
    // The partner a `partner` login is bound to (ADR-0008). Read is left open
    // so the value rides along on `req.user` for ownership scoping; write is
    // locked to a `users` holder (#393: not the backoffice — repointing a login
    // is account administration). A partner can edit its own profile, so
    // without this lock it could repoint itself at another partner and read
    // that partner's data.
    {
      name: 'partner',
      type: 'relationship',
      relationTo: 'partners',
      admin: {
        description: 'Partner this login sells for (accounts holding `partner` only)',
        // Shown for an account that holds the `partner` permission. Exported so
        // the rule is unit-tested rather than asserted through the admin UI.
        condition: showPartnerLinkField,
      },
      access: {
        update: ({ req }) => usersHolder(req.user as ReqUser),
        create: ({ req }) => usersHolder(req.user as ReqUser),
      },
    },
    // The Member a `moreskant` login belongs to (ADR-0024, #420). One person,
    // one Members row: the roster, comp attribution and promo codes share an
    // identity, and `/app` resolves the dancer behind a login through this link
    // (#421). Read is locked alongside the writes — a moreškant must not be able
    // to repoint themselves at another dancer, and nothing in the session needs
    // the value: `/app` re-reads it server-side with `overrideAccess: true`
    // (unlike `partner`, whose value rides along on `req.user` for ownership
    // scoping). The link is filled by the invitation flow (#424); until then a
    // `users` holder sets it by hand.
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      label: { en: 'Member (moreškant)', hr: 'Član (moreškant)' },
      admin: {
        description: {
          en: 'The society member this login belongs to. Required for a `moreskant` account.',
          hr: 'Član društva kojem pripada ova prijava. Obavezan za račun s dozvolom `moreskant`.',
        },
      },
      access: {
        read: ({ req }) => usersHolder(req.user as ReqUser),
        update: ({ req }) => usersHolder(req.user as ReqUser),
        create: ({ req }) => usersHolder(req.user as ReqUser),
      },
    },
    // Log out action on the account view (/admin/account). A `ui` field stores
    // nothing; its component renders a Log out button, scoped to the viewer's
    // own record. Logout was moved here off the dashboards (#167).
    {
      name: 'logout',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/payload/AccountLogout#AccountLogout',
        },
      },
    },
  ],
}
