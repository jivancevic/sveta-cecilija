import { describe, it, expect } from 'vitest'
import { Faqs } from './Faqs'

type ReadAccess = (args: { req: { user: unknown } }) => unknown
type Field = {
  name: string
  required?: boolean
  options?: Array<{ label: string; value: string }>
  defaultValue?: unknown
}

function findField(name: string): Field {
  const f = Faqs.fields.find((x) => 'name' in x && x.name === name) as Field | undefined
  if (!f) throw new Error(`field ${name} not on Faqs`)
  return f
}

describe('Faqs collection', () => {
  it('has the slug = faqs (drives /faq lookup and SQL table name)', () => {
    expect(Faqs.slug).toBe('faqs')
  })

  it('uses question as the admin title', () => {
    expect(Faqs.admin?.useAsTitle).toBe('question')
  })

  describe('access.read', () => {
    const read = Faqs.access!.read as ReadAccess

    it('admin-tier sees everything (returns true, no where filter)', () => {
      expect(read({ req: { user: { role: 'superadmin' } } })).toBe(true)
      expect(read({ req: { user: { role: 'admin' } } })).toBe(true)
    })

    it('tehnika is treated as public (no admin bypass) — published-only filter', () => {
      const result = read({ req: { user: { role: 'tehnika' } } })
      expect(result).toEqual({ status: { equals: 'published' } })
    })

    it('anonymous visitor gets a published-only filter', () => {
      const result = read({ req: { user: null } })
      expect(result).toEqual({ status: { equals: 'published' } })
    })
  })

  describe('access.create/update/delete', () => {
    it.each(['create', 'update', 'delete'] as const)(
      '%s is admin-tier-only — tehnika and anonymous are rejected',
      (op) => {
        const fn = Faqs.access![op] as ReadAccess
        expect(fn({ req: { user: { role: 'tehnika' } } })).toBe(false)
        expect(fn({ req: { user: { role: 'partner' } } })).toBe(false)
        expect(fn({ req: { user: { role: 'admin' } } })).toBe(true)
        expect(fn({ req: { user: { role: 'superadmin' } } })).toBe(true)
        expect(fn({ req: { user: null } })).toBe(false)
      },
    )
  })

  describe('category field', () => {
    const field = findField('category')

    it('is required', () => {
      expect(field.required).toBe(true)
    })

    it('has exactly the seven canonical categories in order', () => {
      expect(field.options?.map((o) => o.value)).toEqual([
        'about',
        'story',
        'dance',
        'music',
        'visiting',
        'dancers',
        'history',
      ])
    })
  })

  describe('locale field', () => {
    const field = findField('locale')
    it('defaults to en with en/hr options', () => {
      expect(field.defaultValue).toBe('en')
      expect(field.options?.map((o) => o.value)).toEqual(['en', 'hr'])
    })
  })

  describe('status field', () => {
    const field = findField('status')
    it('defaults to draft (ships unpublished)', () => {
      expect(field.defaultValue).toBe('draft')
      expect(field.options?.map((o) => o.value)).toEqual(['draft', 'published'])
    })
  })

  describe('required fields', () => {
    it.each(['question', 'answer', 'category', 'locale', 'status'])('%s is required', (name) => {
      expect(findField(name).required).toBe(true)
    })

    it('order is optional (sort-only)', () => {
      expect(findField('order').required).toBeFalsy()
    })
  })
})
