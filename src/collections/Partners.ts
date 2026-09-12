import type { CollectionConfig } from 'payload'
import { can } from '@/lib/access/permissions'
import { partnerOwnRecordWhere } from '@/lib/access/partner'

type ReqUser = { id?: string | number; permissions?: unknown; partner?: unknown } | null | undefined

const backoffice = ({ req }: { req: { user: unknown } }) =>
  can(req.user as ReqUser, 'tickets')

// Resellers that sell Moreška tickets through their own POS (ADR-0008). First
// partner: Kaleta (10% commission). A `partner` login links here via the
// `partner` relationship on Users and may read ONLY its own record.
export const Partners: CollectionConfig = {
  slug: 'partners',
  access: {
    // The backoffice sees all partners; a partner sees only its own record.
    read: ({ req }) => {
      const user = req.user as ReqUser
      if (can(user, 'tickets')) return true
      return partnerOwnRecordWhere(user)
    },
    // Only the backoffice can create partners + set commission (ADR-0008).
    create: backoffice,
    update: backoffice,
    delete: backoffice,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'commissionPercent', 'active'],
    // Empty sidebar for partners: they never manage the collection list, only
    // their scoped dashboard. Hidden from anyone without `tickets`.
    hidden: ({ user }) => !can(user as ReqUser, 'tickets'),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'oib',
      type: 'text',
      admin: { description: 'Croatian tax ID (OIB) — appears on the monthly reconciliation' },
    },
    {
      name: 'billingAddress',
      type: 'textarea',
      admin: { description: 'Billing address for the monthly invoice' },
    },
    {
      name: 'commissionPercent',
      type: 'number',
      required: true,
      defaultValue: 10,
      min: 0,
      max: 100,
      admin: { description: 'HGD commission on this partner’s sales (Kaleta = 10)' },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Inactive partners cannot log in to sell' },
    },
    // Reverse view of the linked logins. The authoritative link is the
    // `partner` relationship on Users; this join just surfaces it read-only
    // here so an admin can see which accounts belong to the partner.
    {
      name: 'users',
      type: 'join',
      collection: 'users',
      on: 'partner',
      admin: { description: 'Login accounts bound to this partner (set on each user)' },
    },
  ],
}
