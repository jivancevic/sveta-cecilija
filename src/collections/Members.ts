import type { CollectionConfig } from 'payload'
import { isAdminTier } from '@/lib/access/roles'

type ReqUser = { id?: string | number; role?: string; partner?: unknown } | null | undefined

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdminTier(req.user as ReqUser)

// HGD society members (ADR-0019). A member is the attribution target for
// comp (goodwill) tickets and, later, member promo codes (ADR-0018).
// Deliberately minimal: no money, law, login or commission — a member never
// authenticates. Admin-tier CRUD only; hidden from tehnika/partner sidebars.
export const Members: CollectionConfig = {
  slug: 'members',
  labels: {
    singular: { en: 'Member', hr: 'Član' },
    plural: { en: 'Members', hr: 'Članovi' },
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'active'],
    // Only admin-tier manage members; never shown to tehnika or partner.
    hidden: ({ user }) => !isAdminTier(user as ReqUser),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { en: 'Name', hr: 'Ime' },
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
    },
    {
      name: 'note',
      type: 'textarea',
      label: { en: 'Note', hr: 'Bilješka' },
    },
  ],
}
