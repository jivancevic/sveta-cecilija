import type { CollectionConfig } from 'payload'

export const QRTokens: CollectionConfig = {
  slug: 'qr-tokens',
  admin: {
    defaultColumns: ['token', 'order', 'scanned', 'scannedAt'],
  },
  fields: [
    { name: 'token', type: 'text', required: true, unique: true },
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      required: true,
    },
    { name: 'scanned', type: 'checkbox', defaultValue: false },
    { name: 'scannedAt', type: 'date' },
  ],
}
