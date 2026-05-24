import type { CollectionConfig } from 'payload'

export const Shows: CollectionConfig = {
  slug: 'shows',
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'time', 'venue', 'onlineSold', 'inPersonSold', 'status'],
    components: {
      edit: {
        editMenuItems: [
          '@/components/payload/InPersonSalesMenuItem#InPersonSalesMenuItem',
          '@/components/payload/ViewOrdersForShowMenuItem#ViewOrdersForShowMenuItem',
          '@/components/payload/CancelShowMenuItem#CancelShowMenuItem',
        ],
      },
      views: {
        list: {
          actions: ['@/components/payload/BulkCreateLink#BulkCreateLink'],
        },
      },
    },
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
    {
      name: 'time',
      type: 'text',
      required: true,
      validate: (val: string | null | undefined) => {
        if (!val) return 'Time is required'
        if (!/^\d{2}:\d{2}$/.test(val)) return 'Time must be in HH:MM format (e.g. 21:00)'
        const [h, m] = val.split(':').map(Number)
        if (h > 23 || m > 59) return 'Invalid time value'
        return true
      },
    },
    {
      name: 'venue',
      type: 'select',
      required: true,
      defaultValue: 'ljetno-kino',
      options: [
        { label: 'Ljetno kino (320)', value: 'ljetno-kino' },
        { label: 'Zimsko kino / Centar za kulturu (250)', value: 'zimsko-kino' },
      ],
    },
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
