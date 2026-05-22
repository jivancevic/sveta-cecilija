import type { CollectionConfig } from 'payload'

export const Shows: CollectionConfig = {
  slug: 'shows',
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'time', 'capacity', 'onlineSold', 'inPersonSold', 'status'],
  },
  fields: [
    {
      name: 'date',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
      },
    },
    { name: 'time', type: 'text', required: true },
    { name: 'capacity', type: 'number', required: true, defaultValue: 250 },
    { name: 'onlineSold', type: 'number', defaultValue: 0 },
    { name: 'inPersonSold', type: 'number', defaultValue: 0 },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
  ],
}
