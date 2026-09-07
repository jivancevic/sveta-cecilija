import type { CollectionConfig } from 'payload'
import { can } from '@/lib/access/permissions'

type ReqUser = { id?: string | number; permissions?: unknown; partner?: unknown } | null | undefined

const backoffice = ({ req }: { req: { user: unknown } }) =>
  can(req.user as ReqUser, 'tickets')

// HGD society members (ADR-0019). A member is the attribution target for
// comp (goodwill) tickets and, later, member promo codes (ADR-0018).
// Deliberately minimal: no money, law, login or commission — a member never
// authenticates. `tickets` holders do the CRUD; nobody else sees the sidebar entry.
export const Members: CollectionConfig = {
  slug: 'members',
  labels: {
    singular: { en: 'Member', hr: 'Član' },
    plural: { en: 'Members', hr: 'Članovi' },
  },
  access: {
    read: backoffice,
    create: backoffice,
    update: backoffice,
    delete: backoffice,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'active'],
    // Only the ticketing backoffice manages members; hidden from everyone else.
    hidden: ({ user }) => !can(user as ReqUser, 'tickets'),
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
