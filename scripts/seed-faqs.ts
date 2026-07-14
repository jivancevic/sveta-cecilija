/**
 * Seed the `faqs` collection from the reviewed English drafts.
 *
 *   npm run seed:faqs                 # upsert into the configured DATABASE_URL
 *   npm run seed:faqs -- --dry-run    # parse + print only, no DB (offline)
 *
 * Reads docs/faq-drafts/faq-answers-en.md, parses it with the offline logic in
 * src/lib/faq-seed.ts (unit-tested), and UPSERTS each entry by (question,
 * locale='en') so re-runs are idempotent and never duplicate. English only for
 * now; every answer is published except the still-flagged tour-list one (Q49),
 * which is seeded as draft.
 *
 * The DB write goes to whatever DATABASE_URL is set — run it in the PRODUCTION
 * container (env lives in Coolify) to publish to moreska.eu. Safe to re-run.
 *
 * Parsing/printing (--dry-run) needs no DB or secrets and can run under plain
 * tsx; the real seed loads the Payload config lazily and runs under `payload run`.
 */
import { readFileSync } from 'fs'
import path from 'path'
import { parseFaqDrafts, lexicalPlainText, toSeedSql } from '../src/lib/faq-seed'

const DRY_RUN = process.argv.includes('--dry-run')
const EMIT_SQL = process.argv.includes('--emit-sql')

async function main() {
  const file = path.resolve(process.cwd(), 'docs/faq-drafts/faq-answers-en.md')
  const md = readFileSync(file, 'utf8')
  const entries = parseFaqDrafts(md)

  // Emit the prod seed SQL to stdout (redirect to db/schema/seed-faqs.sql).
  if (EMIT_SQL) {
    process.stdout.write(toSeedSql(entries))
    return
  }

  const published = entries.filter((e) => e.status === 'published').length
  const draft = entries.filter((e) => e.status === 'draft').length
  console.log(`Parsed ${entries.length} FAQ entries: ${published} published, ${draft} draft (EN).`)

  if (DRY_RUN) {
    for (const e of entries) {
      const flag = e.status === 'draft' ? ' [DRAFT]' : ''
      console.log(
        `  [${String(e.order).padStart(2, '0')}] (${e.category}) ${e.question}${flag}\n` +
          `       ${lexicalPlainText(e.answer).slice(0, 90)}...`,
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
      collection: 'faqs',
      where: { and: [{ question: { equals: e.question } }, { locale: { equals: 'en' } }] },
      limit: 1,
      depth: 0,
    })
    const data = {
      question: e.question,
      answer: e.answer,
      category: e.category,
      locale: 'en' as const,
      order: e.order,
      status: e.status,
    }
    if (existing.docs[0]) {
      await payload.update({ collection: 'faqs', id: existing.docs[0].id, data })
      updated++
    } else {
      await payload.create({ collection: 'faqs', data })
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
