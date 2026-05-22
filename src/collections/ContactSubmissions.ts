import type { CollectionConfig } from 'payload'

export const ContactSubmissions: CollectionConfig = {
  slug: 'contact-submissions',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'enquiryType', 'createdAt'],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'email', type: 'email', required: true },
    {
      name: 'enquiryType',
      type: 'select',
      required: true,
      options: [
        { label: 'General', value: 'general' },
        { label: 'Private Moreška', value: 'private-moreska' },
        { label: 'Moreška Experience', value: 'moreska-experience' },
        { label: 'Other', value: 'other' },
      ],
    },
    { name: 'message', type: 'textarea', required: true },
  ],
  timestamps: true,
}
