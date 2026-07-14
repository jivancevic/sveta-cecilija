import { describe, it, expect } from 'vitest'
import { buildFaqPageJsonLd, lexicalToPlainText } from './faq-schema'

describe('buildFaqPageJsonLd', () => {
  it('emits a FAQPage with one Question/Answer per entry', () => {
    const ld = buildFaqPageJsonLd([
      { question: 'What is the Moreška?', answerText: 'A traditional sword dance from Korčula.' },
      { question: 'Are the swords real?', answerText: 'Yes, they are iron.' },
    ])
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('FAQPage')
    const mainEntity = ld.mainEntity as Array<Record<string, unknown>>
    expect(mainEntity).toHaveLength(2)
    expect(mainEntity[0]['@type']).toBe('Question')
    expect(mainEntity[0].name).toBe('What is the Moreška?')
    const answer = mainEntity[0].acceptedAnswer as Record<string, unknown>
    expect(answer['@type']).toBe('Answer')
    expect(answer.text).toBe('A traditional sword dance from Korčula.')
  })

  it('emits an empty mainEntity array for no entries', () => {
    const ld = buildFaqPageJsonLd([])
    expect(ld.mainEntity).toEqual([])
  })
})

describe('lexicalToPlainText', () => {
  it('flattens a lexical paragraph tree to plain text', () => {
    const data = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Moreška is a ' },
              { type: 'text', text: 'sword dance' },
              { type: 'text', text: ' from Korčula.' },
            ],
          },
        ],
      },
    }
    expect(lexicalToPlainText(data)).toBe('Moreška is a sword dance from Korčula.')
  })

  it('separates block-level nodes with a single space', () => {
    const data = {
      root: {
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'First.' }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'Second.' }] },
        ],
      },
    }
    expect(lexicalToPlainText(data)).toBe('First. Second.')
  })

  it('returns empty string for null, non-objects, and malformed input', () => {
    expect(lexicalToPlainText(null)).toBe('')
    expect(lexicalToPlainText(undefined)).toBe('')
    expect(lexicalToPlainText('text')).toBe('')
    expect(lexicalToPlainText({})).toBe('')
    expect(lexicalToPlainText({ root: {} })).toBe('')
  })
})
