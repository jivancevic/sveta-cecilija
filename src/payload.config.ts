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
import { Posts } from './collections/Posts'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '— Sveta Cecilija',
    },
    theme: 'dark',
    // Disable Payload's runtime regeneration of src/app/(payload)/admin/importMap.js.
    // The regeneration is async — it overwrites the file *after* layout.tsx has
    // already imported it, leaving the in-memory `importMap` reference empty `{}`
    // and silently rendering nothing for editMenuItems / Logo / Icon. We commit a
    // hand-maintained importMap.js (which already has correct keys), and Payload
    // does not touch it.
    importMap: {
      autoGenerate: false,
    },
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
        stats: {
          // Handles both /admin/stats (list) and /admin/stats/[showId]
          // (drill-down) — Payload v3 only dispatches custom views for
          // single-segment top-level paths, so the drill-down can't be a
          // separate `path: '/stats/:showId'` entry. Branch inside the
          // component based on the requested pathname.
          Component: '@/components/payload/AdminStatsView#AdminStatsView',
          path: '/stats',
          exact: false,
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
  collections: [Users, Shows, Orders, QRTokens, ContactSubmissions, Posts],
  editor: lexicalEditor(),
  secret: (() => {
    const s = process.env.PAYLOAD_SECRET
    if (!s) throw new Error('PAYLOAD_SECRET is not set')
    return s
  })(),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    // Auto-push schema in dev. In production it's a no-op (Payload
    // disables push in NODE_ENV=production); schema is applied by
    // scripts/bootstrap-db.mjs from the start script before next start.
    // See docs/agents/db-bootstrap.md.
    push: process.env.NODE_ENV !== 'production',
  }),
  serverURL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  graphQL: {
    disable: true,
  },
})
