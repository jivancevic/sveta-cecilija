import type { CollectionConfig } from 'payload'
import { isSuperadmin } from '@/lib/access/roles'

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
  },
  access: {
    read: selfOrSuperadmin,
    update: selfOrSuperadmin,
    create: superadminOnly,
    delete: superadminOnly,
  },
  admin: {
    useAsTitle: 'email',
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
  ],
}
