import type { CollectionConfig } from 'payload'
import { isAdmin } from '@/lib/access/roles'

type ReqUser = { id?: string | number; role?: string } | null | undefined

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdmin(req.user as ReqUser)

// Admin sees everyone; any other authed user sees only their own record.
const selfOrAdmin = ({ req }: { req: { user: unknown } }) => {
  const user = req.user as ReqUser
  if (isAdmin(user)) return true
  if (!user?.id) return false
  return { id: { equals: user.id } }
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: {
    read: selfOrAdmin,
    update: selfOrAdmin,
    create: adminOnly,
    delete: adminOnly,
  },
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'admin',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Door staff', value: 'door-staff' },
      ],
    },
  ],
}
