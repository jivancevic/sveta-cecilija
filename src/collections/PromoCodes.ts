import type { CollectionConfig } from 'payload'
import { can } from '@/lib/access/permissions'

type ReqUser = { id?: string | number; permissions?: unknown; partner?: unknown } | null | undefined

const backoffice = ({ req }: { req: { user: unknown } }) =>
  can(req.user as ReqUser, 'tickets')

// Member promo codes (ADR-0018). An admin creates a vanity code attributed to a
// society Member; the guest types it at online checkout and an adult ticket
// drops to `adultPriceEur` (child stays €10). No member portal, no login, no
// usage cap, no expiry — only the `active` kill-switch (v1). A member may own
// more than one code. This slice is the collection + admin CRUD ONLY; the
// pricing/checkout engine lands in a later slice (#324). `tickets` holders do
// the CRUD; hidden from every other sidebar.
export const PromoCodes: CollectionConfig = {
  slug: 'promo-codes',
  labels: {
    singular: { en: 'Promo code', hr: 'Promo kod' },
    plural: { en: 'Promo codes', hr: 'Promo kodovi' },
  },
  access: {
    read: backoffice,
    create: backoffice,
    update: backoffice,
    delete: backoffice,
  },
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'member', 'adultPriceEur', 'active'],
    // Only the ticketing backoffice manages promo codes; hidden from everyone else.
    hidden: ({ user }) => !can(user as ReqUser, 'tickets'),
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      label: { en: 'Code', hr: 'Kod' },
      admin: {
        description:
          'The vanity code the guest types at checkout (unique, case-sensitive)',
      },
    },
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      label: { en: 'Member', hr: 'Član' },
      admin: {
        description: 'The society member this code is attributed to',
      },
    },
    {
      name: 'discountType',
      type: 'select',
      required: true,
      defaultValue: 'adult-price-override',
      options: [
        {
          label: { en: 'Adult price override', hr: 'Zamjena cijene za odrasle' },
          value: 'adult-price-override',
        },
      ],
      label: { en: 'Discount type', hr: 'Vrsta popusta' },
      admin: {
        description: 'Only v1 shape: override the adult ticket price',
      },
    },
    {
      name: 'adultPriceEur',
      type: 'number',
      required: true,
      defaultValue: 15,
      min: 0,
      label: { en: 'Adult price (EUR)', hr: 'Cijena za odrasle (EUR)' },
      admin: {
        description: 'Adult ticket price with this code (child stays €10)',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: { en: 'Active', hr: 'Aktivan' },
      admin: {
        description: 'Inactive codes are rejected at checkout (kill-switch)',
      },
    },
  ],
}
