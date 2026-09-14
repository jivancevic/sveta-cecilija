import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { APP_STRINGS } from '@/lib/app/strings'
import { AnswerPair } from './AnswerPair'

// The answer pair, rendered (#592).
//
// Not a snapshot, and nothing here about the animation: what a screen relies on
// is that BOTH buttons are on screen in every state, that the words never
// change, and that the state the caller handed in is the one the markup
// reports. The rest — the sparks, the spring, the blades — is CSS and a tap,
// and neither survives `renderToStaticMarkup`.

const render = renderToStaticMarkup
const noop = () => {}

describe('AnswerPair', () => {
  it('shows both buttons when nothing has been answered', () => {
    const html = render(h(AnswerPair, { state: 'none', onChoose: noop }))
    expect(html).toContain(APP_STRINGS.answer.coming)
    expect(html).toContain(APP_STRINGS.answer.notComing)
    expect(html).toContain('data-state="none"')
    // Neither is pressed: an unanswered pair is a question, not a default.
    expect(html).not.toContain('aria-pressed="true"')
  })

  it('keeps both buttons after an answer, and presses the chosen one', () => {
    const yes = render(h(AnswerPair, { state: 'yes', onChoose: noop }))
    expect(yes).toContain(APP_STRINGS.answer.coming)
    expect(yes).toContain(APP_STRINGS.answer.notComing)
    expect(yes).toContain('data-state="yes"')
    expect(yes.split('aria-pressed="true"').length - 1).toBe(1)

    const no = render(h(AnswerPair, { state: 'no', onChoose: noop }))
    expect(no).toContain('data-state="no"')
    expect(no.split('aria-pressed="true"').length - 1).toBe(1)
  })

  it('never names an army: the words are always the first person', () => {
    for (const state of ['none', 'yes', 'no'] as const) {
      const html = render(h(AnswerPair, { state, onChoose: noop }))
      expect(html).not.toContain(APP_STRINGS.ui.armyCrni)
      expect(html).not.toContain(APP_STRINGS.ui.armyBili)
      expect(html).not.toContain('Dolaziš')
    }
  })

  it('carries the small variant on the pair, not on the buttons', () => {
    const html = render(h(AnswerPair, { state: 'none', onChoose: noop, small: true }))
    expect(html).toContain('app__ans--sm')
  })

  it('disables both buttons when the evening is locked', () => {
    const html = render(h(AnswerPair, { state: 'yes', onChoose: noop, disabled: true }))
    expect(html.split('disabled=""').length - 1).toBe(2)
  })
})
