import type { CollectionConfig, Where } from 'payload'
import { can, type PermissionUser } from '@/lib/access/permissions'

// Published content is the `editor` permission since #500 (Cecilija, #476):
// `tickets` is the ticketing backoffice and no longer reaches Objave or FAQ.
const contentEditor = ({ req }: { req: { user: unknown } }) =>
  can(req.user as PermissionUser, 'editor')

// Public reads: only published posts. An `editor` sees everything (drafts +
// scheduled); everyone else, staff included, reads as a visitor does.
const publicRead = ({ req }: { req: { user: unknown } }): true | Where => {
  if (can(req.user as PermissionUser, 'editor')) return true
  return {
    and: [
      { status: { equals: 'published' } },
      { publishedAt: { less_than_equal: new Date().toISOString() } },
    ],
  } as Where
}

function slugify(input: string): string {
  return input
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    read: publicRead,
    create: contentEditor,
    update: contentEditor,
    delete: contentEditor,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'locale', 'status', 'publishedAt'],
    description:
      'Blog posts. Author = HGD Sveta Cecilija. Pick a locale; posts only appear on the public /blog of that locale.',
    hidden: ({ user }) => !can(user as PermissionUser, 'editor'),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'URL path under /blog/. Auto-generated from title; edit if you need a custom URL.',
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            if (value && typeof value === 'string' && value.trim()) {
              return slugify(value)
            }
            const title = (data as { title?: string } | undefined)?.title
            if (title) return slugify(title)
            return value
          },
        ],
      },
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
      name: 'excerpt',
      type: 'textarea',
      required: true,
      admin: { description: 'Shown on the /blog index card and used as the meta description. Aim for ~155 chars.' },
    },
    {
      name: 'heroImage',
      type: 'text',
      required: true,
      admin: {
        description: 'Path under /public (e.g. /moreska01.webp) or a full URL. Used as the post hero + OG image.',
      },
    },
    {
      name: 'heroImageAlt',
      type: 'text',
      admin: { description: 'Alt text for the hero image. Leave blank for purely decorative photos.' },
    },
    {
      name: 'body',
      type: 'richText',
      required: true,
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy HH:mm' },
        description: 'Date shown to readers and used as datePublished in schema.org. Posts dated in the future are hidden from the public site until that time.',
      },
    },
    {
      name: 'updatedAtPublic',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy HH:mm' },
        description: 'Optional. Sets schema.org dateModified separately from the row updatedAt timestamp.',
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
