import type { CollectionConfig } from 'payload'

export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'buyerName',
    defaultColumns: ['buyerName', 'email', 'adultCount', 'childCount', 'total', 'refundStatus', 'show'],
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
  ],
}
