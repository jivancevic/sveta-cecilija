import { describe, it, expect } from 'vitest'
import { Posts } from './Posts'

type ReadAccess = (args: { req: { user: unknown } }) => unknown
type FieldHook = (args: { value?: unknown; data?: unknown }) => unknown
type Field = {
  name: string
  required?: boolean
  unique?: boolean
  hooks?: { beforeValidate?: FieldHook[] }
}

function findField(name: string): Field {
  const f = Posts.fields.find((x) => 'name' in x && x.name === name) as Field | undefined
  if (!f) throw new Error(`field ${name} not on Posts`)
  return f
}

describe('Posts collection', () => {
  it('has the slug = posts (drives /blog/[slug] lookup and SQL table name)', () => {
    expect(Posts.slug).toBe('posts')
  })

  describe('access.read', () => {
    const read = Posts.access!.read as ReadAccess

    it('admin sees everything (returns true, no where filter)', () => {
      const result = read({ req: { user: { role: 'admin' } } })
      expect(result).toBe(true)
    })

    it('door-staff is treated as public (no admin bypass) — published-only filter applied', () => {
      const result = read({ req: { user: { role: 'door-staff' } } })
      expect(typeof result).toBe('object')
      const where = result as { and: Array<Record<string, unknown>> }
      expect(where.and).toEqual(
        expect.arrayContaining([
          { status: { equals: 'published' } },
        ]),
      )
    })

    it('anonymous visitor gets a published-only, dated-in-the-past filter', () => {
      const result = read({ req: { user: null } }) as {
        and: Array<Record<string, unknown>>
      }
      expect(result.and).toEqual(
        expect.arrayContaining([
          { status: { equals: 'published' } },
        ]),
      )
      const datedFilter = result.and.find((f) => 'publishedAt' in f) as
        | { publishedAt: { less_than_equal: string } }
        | undefined
      expect(datedFilter).toBeDefined()
      // The filter is a snapshot of "now" at access time. Verify shape only.
      expect(datedFilter!.publishedAt.less_than_equal).toMatch(
        /^\d{4}-\d{2}-\d{2}T/,
      )
    })
  })

  describe('access.create/update/delete', () => {
    it.each(['create', 'update', 'delete'] as const)(
      '%s is admin-only — door-staff is rejected',
      (op) => {
        const fn = Posts.access![op] as ReadAccess
        expect(fn({ req: { user: { role: 'door-staff' } } })).toBe(false)
        expect(fn({ req: { user: { role: 'admin' } } })).toBe(true)
        expect(fn({ req: { user: null } })).toBe(false)
      },
    )
  })

  describe('slug field', () => {
    const field = findField('slug')
    const hook = field.hooks!.beforeValidate![0]

    it('is unique (one canonical URL per slug)', () => {
      expect(field.unique).toBe(true)
    })

    it('auto-generates from title when slug is empty', () => {
      const out = hook({ value: undefined, data: { title: 'The Story of the Moreška' } })
      expect(out).toBe('the-story-of-the-moreska')
    })

    it('normalises an explicit slug (lowercase, dashed, no diacritics)', () => {
      const out = hook({ value: 'Moreška & Čakavski Verse!', data: {} })
      expect(out).toBe('moreska-cakavski-verse')
    })

    it('returns the original value when both value and title are missing', () => {
      const out = hook({ value: undefined, data: {} })
      expect(out).toBe(undefined)
    })
  })

  describe('required fields', () => {
    it.each(['title', 'slug', 'locale', 'excerpt', 'heroImage', 'body', 'publishedAt', 'status'])(
      '%s is required',
      (name) => {
        expect(findField(name).required).toBe(true)
      },
    )
  })
})
