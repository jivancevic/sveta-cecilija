import type { CollectionConfig } from 'payload'
import { isAdminTier } from '@/lib/access/roles'
import { partnerOwnOrdersWhere } from '@/lib/access/partner'

type ReqUser = { role?: string; partner?: unknown } | null | undefined

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdminTier(req.user as ReqUser)

export const Orders: CollectionConfig = {
  slug: 'orders',
  access: {
    // Admin-tier reads every order; a partner reads only orders it sold
    // (orders.partner = self). Tehnika has no collection read (door lookups go
    // through the audited /api/orders/lookup route, not this access).
    read: ({ req }) => {
      const user = req.user as ReqUser
      if (isAdminTier(user)) return true
      return partnerOwnOrdersWhere(user)
    },
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    useAsTitle: 'buyerName',
    defaultColumns: ['buyerName', 'email', 'adultCount', 'childCount', 'total', 'refundStatus', 'show'],
    listSearchableFields: ['buyerName', 'email'],
    hidden: ({ user }) => !isAdminTier(user as { role?: string } | null),
    components: {
      edit: {
        editMenuItems: ['@/components/payload/RefundOrderMenuItem#RefundOrderMenuItem'],
      },
    },
  },
  fields: [
    // Short human order reference (ADR-0007). Set at issuance; printed on
    // partner slips and read back at the door. Unique; legacy rows may be NULL.
    { name: 'code', type: 'text', unique: true, admin: { readOnly: true, description: 'Order reference code' } },
    {
      name: 'channel',
      type: 'select',
      required: true,
      defaultValue: 'online',
      options: [
        { label: 'Online (Stripe)', value: 'online' },
        { label: 'Partner (POS)', value: 'partner' },
      ],
      admin: { description: 'Sales channel; drives pricing and invoicing' },
    },
    // Partner who sold this order; null for online (ADR-0008). Column stays
    // `partner_id`; now a real relationship to the partners collection (#143).
    {
      name: 'partner',
      type: 'relationship',
      relationTo: 'partners',
      admin: { readOnly: true, description: 'Partner that sold this order (partner channel only)' },
    },
    // Buyer PII — present online, null for an anonymous partner POS sale.
    { name: 'buyerName', type: 'text' },
    { name: 'email', type: 'email' },
    { name: 'adultCount', type: 'number', required: true },
    { name: 'childCount', type: 'number', required: true },
    { name: 'total', type: 'number', required: true, admin: { description: 'Amount in EUR cents' } },
    { name: 'stripePaymentIntentId', type: 'text' },
    {
      name: 'refundStatus',
      type: 'select',
      required: true,
      defaultValue: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Refunded', value: 'refunded' },
      ],
    },
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'shows',
      required: true,
    },
    {
      name: 'locale',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Croatian', value: 'hr' },
      ],
      admin: {
        description: 'Buyer locale captured at checkout; drives post-purchase email language',
      },
    },
    {
      name: 'reviewEmailSentAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'Timestamp the T+24h review-request email was sent. NULL = not yet sent.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'reviewOptOut',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
        description: 'Buyer unsubscribed from the post-show review email (#148). When true, the review dispatcher skips this order.',
      },
    },
    {
      name: 'reviewOptOutToken',
      type: 'text',
      unique: true,
      admin: {
        readOnly: true,
        description: 'Per-order unsubscribe token, generated when the review email is sent. Backs /unsubscribe/[token].',
      },
    },
  ],
}
