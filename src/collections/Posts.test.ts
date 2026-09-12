import { describe, it, expect } from 'vitest'
import { Posts } from './Posts'

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

  // Access is permission-driven since #395 and is covered, for every verb and
  // every bundle, by collections/access.test.ts.

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
