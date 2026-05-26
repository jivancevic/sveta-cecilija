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
    components: {
      edit: {
        editMenuItems: ['@/components/payload/RefundOrderMenuItem#RefundOrderMenuItem'],
      },
    },
  },
  fields: [
    { name: 'buyerName', type: 'text', required: true },
    { name: 'email', type: 'email', required: true },
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
        description: 'Buyer locale captured at checkout — drives post-purchase email language',
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
