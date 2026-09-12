import { describe, it, expect } from 'vitest'
import { Faqs } from './Faqs'

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

  // Access is permission-driven since #395 and is covered, for every verb and
  // every bundle, by collections/access.test.ts.

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
