import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'
import { Users } from './collections/Users'
import { Shows } from './collections/Shows'
import { Orders } from './collections/Orders'
import { QRTokens } from './collections/QRTokens'
import { ContactSubmissions } from './collections/ContactSubmissions'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '— Sveta Cecilija',
    },
    theme: 'dark',
    components: {
      graphics: {
        Logo: '@/components/payload/AdminLogo#AdminLogo',
        Icon: '@/components/payload/AdminIcon#AdminIcon',
      },
      views: {
        bulkCreateShows: {
          Component: '@/components/payload/BulkCreateShowsView#BulkCreateShowsView',
          path: '/bulk-create-shows',
        },
      },
    },
    dashboard: {
      widgets: [
        {
          slug: 'collections',
          Component: '@payloadcms/next/rsc#CollectionCards',
          minWidth: 'full',
        },
      ],
    },
  },
  collections: [Users, Shows, Orders, QRTokens, ContactSubmissions],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    push: true,
  }),
  serverURL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  graphQL: {
    disable: true,
  },
})
