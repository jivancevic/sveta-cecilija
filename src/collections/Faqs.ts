import type { CollectionConfig, Where } from 'payload'
import { isAdminTier } from '@/lib/access/roles'

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdminTier(req.user as { role?: string } | null)

// Public reads: only published FAQs. Admins see everything (drafts included).
const publicRead = ({ req }: { req: { user: unknown } }): true | Where => {
  if (isAdminTier(req.user as { role?: string } | null)) return true
  return { status: { equals: 'published' } } as Where
}

export const Faqs: CollectionConfig = {
  slug: 'faqs',
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    useAsTitle: 'question',
    defaultColumns: ['question', 'category', 'locale', 'order', 'status'],
    description:
      'Frequently asked questions, shown on /faq grouped by category. Pick a locale; FAQs only appear on the public /faq of that locale. Answers must be verified by HGD before publishing.',
    hidden: ({ user }) => !isAdminTier(user as { role?: string } | null),
  },
  fields: [
    { name: 'question', type: 'text', required: true },
    {
      name: 'answer',
      type: 'richText',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'About', value: 'about' },
        { label: 'Story', value: 'story' },
        { label: 'Dance', value: 'dance' },
        { label: 'Music', value: 'music' },
        { label: 'Visiting', value: 'visiting' },
        { label: 'Dancers', value: 'dancers' },
        { label: 'History', value: 'history' },
      ],
    },
    {
      name: 'locale',
      type: 'select',
      required: true,
      defaultValue: 'en',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Hrvatski', value: 'hr' },
      ],
    },
    {
      name: 'order',
      type: 'number',
      admin: {
        description: 'Sort order within a category (ascending). Lower numbers appear first.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    },
  ],
  timestamps: true,
}
