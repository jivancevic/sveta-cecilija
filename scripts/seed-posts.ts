/**
 * Seed the `posts` collection from the reviewed blog drafts (issue #47).
 *
 *   npm run seed:posts                 # upsert into the configured DATABASE_URL
 *   npm run seed:posts -- --dry-run    # parse + print only, no DB (offline)
 *   npm run seed:posts -- --emit-sql   # print db/schema/seed-posts.sql to stdout
 *
 * Reads every docs/blog-drafts/*.md except README.md, parses each with the
 * offline logic in src/lib/post-seed.ts (unit-tested), and UPSERTS by
 * (slug, locale) so re-runs are idempotent and never duplicate. Frontmatter is
 * the source of truth for status + publishedAt (the 1/month cadence).
 *
 * The DB write goes to whatever DATABASE_URL is set — but the canonical prod
 * path is the generated db/schema/seed-posts.sql applied by bootstrap-db.mjs
 * on deploy (the standalone prod image doesn't ship this script or the drafts).
 *
 * Parsing/printing (--dry-run / --emit-sql) needs no DB or secrets and can run
 * under plain tsx; the real seed loads the Payload config lazily under
 * `payload run`.
 */
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { parsePostDraft, toPostsSeedSql, type PostSeedEntry } from '../src/lib/post-seed'

const DRY_RUN = process.argv.includes('--dry-run')
const EMIT_SQL = process.argv.includes('--emit-sql')

function loadEntries(): PostSeedEntry[] {
  const dir = path.resolve(process.cwd(), 'docs/blog-drafts')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
  return files.map((f) => parsePostDraft(readFileSync(path.join(dir, f), 'utf8'), f))
}

async function main() {
  const entries = loadEntries()

  if (EMIT_SQL) {
    process.stdout.write(toPostsSeedSql(entries))
    return
  }

  const published = entries.filter((e) => e.status === 'published').length
  console.log(
    `Parsed ${entries.length} blog posts: ${published} published, ${entries.length - published} draft.`,
  )

  if (DRY_RUN) {
    for (const e of entries) {
      const flag = e.status === 'draft' ? ' [DRAFT]' : ''
      console.log(
        `  ${e.publishedAt.slice(0, 10)} (${e.locale}) /blog/${e.slug}${flag}\n` +
          `       ${e.bodyText.slice(0, 90)}...`,
      )
    }
    console.log('\nDry run: no database changes made.')
    return
  }

  // Lazy imports so --dry-run stays offline (no PAYLOAD_SECRET / DB needed).
  const { getPayload } = await import('payload')
  const { default: config } = await import('@payload-config')
  const payload = await getPayload({ config })

  let created = 0
  let updated = 0
  for (const e of entries) {
    const existing = await payload.find({
      collection: 'posts',
      where: { and: [{ slug: { equals: e.slug } }, { locale: { equals: e.locale } }] },
      limit: 1,
      depth: 0,
    })
    const data = {
      title: e.title,
      slug: e.slug,
      locale: e.locale,
      excerpt: e.excerpt,
      heroImage: e.heroImage,
      heroImageAlt: e.heroImageAlt ?? undefined,
      body: e.body,
      publishedAt: e.publishedAt,
      status: e.status,
    }
    if (existing.docs[0]) {
      await payload.update({ collection: 'posts', id: existing.docs[0].id, data })
      updated++
    } else {
      await payload.create({ collection: 'posts', data })
      created++
    }
  }

  console.log(`Seed complete: ${created} created, ${updated} updated (${entries.length} total).`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
