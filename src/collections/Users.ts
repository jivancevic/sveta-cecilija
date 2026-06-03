import { APIError, type CollectionConfig } from 'payload'
import { isSuperadmin, isAdminTier } from '@/lib/access/roles'
import { assertUserEmailPolicy, UserEmailRequiredError } from '@/lib/access/user-email-policy'

type ReqUser = { id?: string | number; role?: string } | null | undefined

const superadminOnly = ({ req }: { req: { user: unknown } }) =>
  isSuperadmin(req.user as ReqUser)

// Superadmin sees everyone; any other authed user sees only their own record.
// Combined with admin.hidden below, non-superadmins have no entry point to the
// Users UI at all — the self-row access exists only to support the profile
// edit page reached from a top-bar account link.
const selfOrSuperadmin = ({ req }: { req: { user: unknown } }) => {
  const user = req.user as ReqUser
  if (isSuperadmin(user)) return true
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
    // Conditional email requirement: superadmin/admin (real people) must have an
    // email; tehnika/partner may be username-only. Merge incoming data over the
    // existing doc so an update that touches only one field is judged on the
    // resulting record — and an explicit `email: null` is honoured, not masked
    // by the original value.
    beforeValidate: [
      ({ data, originalDoc }) => {
        const role = data && 'role' in data ? data.role : originalDoc?.role
        const email = data && 'email' in data ? data.email : originalDoc?.email
        try {
          assertUserEmailPolicy({ role, email })
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
    read: selfOrSuperadmin,
    update: selfOrSuperadmin,
    create: superadminOnly,
    delete: superadminOnly,
  },
  admin: {
    useAsTitle: 'email',
    // Hide Users from the sidebar for everyone but superadmin (ADR-0006: only
    // the developer manages users; secretaries/tehnika/partner get no Users
    // entry). The top-bar Account link routes to the dedicated `/admin/account`
    // view — NOT this collection's edit page — so hiding the collection does
    // not 404 the profile page (verified on Payload v3.84; an earlier comment
    // here predated that routing and left Users leaking into every sidebar,
    // including the partner's). Direct `/admin/collections/users` still 404s
    // for non-superadmins, which is the intended lockdown.
    hidden: ({ user }) => !isSuperadmin(user as ReqUser),
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'admin',
      options: [
        { label: 'Superadmin', value: 'superadmin' },
        { label: 'Admin', value: 'admin' },
        { label: 'Tehnika', value: 'tehnika' },
        // Partner sales channel (ADR-0008). Value only here; scoped access +
        // partner dashboard land in #143.
        { label: 'Partner', value: 'partner' },
      ],
      access: {
        // Field-level lock: only superadmin can read or write the role field.
        // Without this, a secretary could promote herself to superadmin by
        // editing her own profile (Users.access.update allows self-edit).
        read: ({ req }) => isSuperadmin(req.user as ReqUser),
        update: ({ req }) => isSuperadmin(req.user as ReqUser),
        create: ({ req }) => isSuperadmin(req.user as ReqUser),
      },
    },
    // The partner a `partner`-role login is bound to (ADR-0008). Read is left
    // open so the value rides along on `req.user` for ownership scoping; write
    // is locked to admin-tier. A partner can edit its own profile (selfOrSuper-
    // admin update), so without this lock it could repoint itself at another
    // partner and read that partner's data.
    {
      name: 'partner',
      type: 'relationship',
      relationTo: 'partners',
      admin: {
        description: 'Partner this login sells for (partner role only)',
        condition: (data) => data?.role === 'partner',
      },
      access: {
        update: ({ req }) => isAdminTier(req.user as ReqUser),
        create: ({ req }) => isAdminTier(req.user as ReqUser),
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
