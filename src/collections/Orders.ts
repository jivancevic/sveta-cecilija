import type { CollectionConfig } from 'payload'
import { isAdminTier } from '@/lib/access/roles'

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdminTier(req.user as { role?: string } | null)

export const Orders: CollectionConfig = {
  slug: 'orders',
  access: {
    read: adminOnly,
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
    // Partner who sold this order; null for online. Becomes a relationship to
    // the partners collection in #143 — kept as a number for now (column
    // partner_id) so Payload push doesn't drop it before that collection exists.
    { name: 'partnerId', type: 'number', admin: { readOnly: true, description: 'Partner that sold this order (partner channel only)' } },
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
  ],
}
