import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { en } from '@payloadcms/translations/languages/en'
import { hr } from '@payloadcms/translations/languages/hr'
import path from 'path'
import { fileURLToPath } from 'url'
import { Users } from './collections/Users'
import { Shows } from './collections/Shows'
import { Orders } from './collections/Orders'
import { Tickets } from './collections/Tickets'
import { ContactSubmissions } from './collections/ContactSubmissions'
import { Posts } from './collections/Posts'
import { OrderLookups } from './collections/OrderLookups'
import { Partners } from './collections/Partners'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '- Sveta Cecilija',
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
          // Handles /admin/stats/[showId] drill-down. Bare /admin/stats
          // redirects to /admin (the list view is folded into the dashboard).
          // Payload v3 only dispatches custom views for single-segment paths
          // when exact=false, so we keep the drill-down here.
          Component: '@/components/payload/AdminStatsView#AdminStatsView',
          path: '/stats',
          exact: false,
        },
        scan: {
          // Inline scan station for tehnika. Camera stays live across scans;
          // results overlay the feed via /api/scan/[token]. No page transitions.
          Component: '@/components/payload/AdminScanView#AdminScanView',
          path: '/scan',
        },
        // Replace Payload's default collection-card dashboard with the
        // role-branched view. `admin.dashboard.widgets` is additive (it
        // appends to the default `CollectionCards` widget), so to *replace*
        // the dashboard we override the dashboard view entirely. See ADR-0006.
        dashboard: {
          Component: '@/components/payload/AdminDashboardView#AdminDashboardView',
        },
      },
    },
  },
  collections: [Users, Shows, Orders, Tickets, ContactSubmissions, Posts, OrderLookups, Partners],
  // Admin-panel i18n (issue #234, ADR-0015). Restricting supportedLanguages to
  // en + hr localizes the whole Payload chrome and makes the native account
  // language selector show exactly these two. fallbackLanguage is English (the
  // developer/superadmin default); a new staff login is seeded to Croatian via
  // the Users afterLogin hook (see src/lib/admin-i18n.ts + Users.ts). Croatian
  // ships in @payloadcms/translations.
  i18n: {
    supportedLanguages: { en, hr },
    fallbackLanguage: 'en',
  },
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
    // `PAYLOAD_DISABLE_PUSH=1` forces push off even in dev — escape hatch for
    // running/verifying the app in a worktree whose dev DB carries columns from
    // *other* branches (push would otherwise hit an interactive DATA-LOSS prompt
    // and `next dev` exits on stdin EOF). Schema is still applied by
    // bootstrap-db.mjs / app.sql, so the app runs fine without push.
    push: process.env.PAYLOAD_DISABLE_PUSH ? false : process.env.NODE_ENV !== 'production',
  }),
  serverURL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  graphQL: {
    disable: true,
  },
})
