import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { APP_STRINGS } from '@/lib/app/strings'
import { ArmyBar } from './ArmyBar'
import { armyStatus } from './army-status'
import { Button } from './Button'
import { Card } from './Card'
import { Chip } from './Chip'
import { DateDisc } from './DateDisc'
import { Hero } from './Hero'
import { List, ListRow } from './ListRow'
import { Note } from './Note'
import { Podium } from './Podium'
import { Ring } from './Ring'
import { RoleMark } from './RoleMark'
import { Section } from './Section'
import { Sheet, SheetOption } from './Sheet'
import { Tile, Tiles } from './Tile'
import { Toast } from './Toast'

// The shared shapes, rendered (#562).
//
// Not a snapshot: a snapshot of a design system is a test that fails every time
// the design changes, which is the one thing it is FOR. These assert the few
// things a screen composing a component actually relies on — the class that
// carries the shape, the variant that says which of five buttons this is, and
// the numbers the two computed components draw.
//
// `renderToStaticMarkup` rather than a DOM: these are server-renderable by
// design (only Sheet is a client component), and it keeps the suite in the
// `node` environment the rest of the project runs in.

const render = renderToStaticMarkup

describe('armyStatus', () => {
  it('says so, once, when both armies are there', () => {
    expect(armyStatus(9, 8, { crni: 8, bili: 8 })).toEqual({
      ok: true,
      text: APP_STRINGS.ui.enough,
    })
  })

  it('counts both shortfalls, in Croatian, sentence case', () => {
    const status = armyStatus(6, 7, { crni: 8, bili: 8 })
    expect(status.ok).toBe(false)
    expect(status.text).toBe('Fale još 2 crna · fali još 1 bili')
  })

  it('switches to the genitive plural past four', () => {
    expect(armyStatus(1, 8, { crni: 8, bili: 8 }).text).toBe('Fale još 7 crnih')
  })

  it('reads the evening’s own thresholds, not a constant', () => {
    expect(armyStatus(6, 6, { crni: 6, bili: 6 }).ok).toBe(true)
    expect(armyStatus(6, 6, { crni: 10, bili: 6 }).ok).toBe(false)
  })
})

describe('Button', () => {
  it('carries its variant, so a screen cannot invent a sixth', () => {
    expect(render(h(Button, { variant: 'primary' }, 'Dolazim'))).toContain('ui-btn--primary')
    expect(render(h(Button, { variant: 'destructive' }, 'Povrat'))).toContain('ui-btn--destructive')
  })

  it('draws the tick only when asked, and pops only when told', () => {
    expect(render(h(Button, { variant: 'done', check: true }, 'Dolaziš'))).toContain('ui-check')
    expect(render(h(Button, {}, 'x'))).not.toContain('ui-check')
    expect(render(h(Button, { pop: true }, 'x'))).toContain('ui-btn--pop')
  })
})

describe('ArmyBar', () => {
  /** The society's usual evening. It is a PROP, never a default (#562 review). */
  const EIGHT = { crni: 8, bili: 8 }

  it('fills each half in proportion to twelve, the size of an army', () => {
    const html = render(h(ArmyBar, { crni: 6, bili: 12, threshold: EIGHT }))
    expect(html).toContain('width:25%') // 6 of 12, over half the bar
    expect(html).toContain('width:50%') // a full half
  })

  it('marks the number that is short and says how short', () => {
    const html = render(h(ArmyBar, { crni: 3, bili: 9, threshold: EIGHT }))
    expect(html).toContain('ui-army__v--low')
    expect(html).toContain('Fale još 5 crnih')
  })

  it('reads the evening’s own thresholds, so a short night is the voditelj’s call', () => {
    const html = render(h(ArmyBar, { crni: 6, bili: 6, threshold: { crni: 6, bili: 6 } }))
    expect(html).not.toContain('ui-army__v--low')
    expect(html).toContain('Ima nas dovoljno')
  })

  it('is a button only when it leads somewhere', () => {
    expect(render(h(ArmyBar, { crni: 8, bili: 8, threshold: EIGHT }))).not.toContain('<button')
    expect(
      render(h(ArmyBar, { crni: 8, bili: 8, threshold: EIGHT, onClick: () => {} })),
    ).toContain('<button')
  })
})

describe('RoleMark', () => {
  it('is the army in the disc and the evening’s title in the glyph', () => {
    const king = render(h(RoleMark, { army: 'crni', title: 'crni_kralj' }))
    expect(king).toContain('ui-mark--crni')
    expect(king).toContain('<svg')

    const plain = render(h(RoleMark, { army: 'crni' }))
    expect(plain).toContain('ui-mark--crni')
    expect(plain).not.toContain('<svg')
  })

  it('rings the bula of the night and no other bula', () => {
    expect(render(h(RoleMark, { army: 'bula', title: 'bula' }))).toContain('ui-mark--titled')
    expect(render(h(RoleMark, { army: 'bula' }))).not.toContain('ui-mark--titled')
  })
})

describe('Ring', () => {
  it('turns a share into an arc, and refuses to pass the full circle', () => {
    expect(render(h(Ring, { value: 175, max: 350 }))).toContain('180deg')
    expect(render(h(Ring, { value: 400, max: 350 }))).toContain('360deg')
    expect(render(h(Ring, { value: 1, max: 0 }))).toContain('0deg')
  })
})

describe('the rest of the shapes render', () => {
  it('each carries the class its screen composes against', () => {
    expect(render(h(Card, { eyebrow: 'Sljedeća izvedba' }, 'x'))).toContain('ui-card')
    expect(render(h(Hero, { day: '14', month: 'rujna', meta: 'Sutra' }))).toContain('ui-card--hero')
    expect(render(h(Section, { title: 'Rujan', aside: '5 izvedbi' }))).toContain('ui-section')
    expect(render(h(Chip, { tone: 'gold' }, '2 nove'))).toContain('ui-chip--gold')
    expect(render(h(DateDisc, { day: 14, weekday: 'pon', gold: true }))).toContain('ui-date--gold')
    expect(render(h(Note, {}, 'Skup u 20:15'))).toContain('ui-note')
    expect(render(h(List, {}, h(ListRow, { title: 'Redovna', meta: '21:00' })))).toContain('ui-row')
    expect(render(h(Tiles, { children: h(Tile, { eyebrow: 'Ljestvica' }) }))).toContain('ui-tile')
    expect(render(h(Toast, { message: 'Osvježeno', open: true }))).toContain('ui-toast--on')
    expect(render(h(Podium, { entries: [{ label: 'Brko', value: 14 }] }))).toContain(
      'ui-podium__step--1',
    )
  })

  it('a sheet is nothing at all until it is open', () => {
    expect(render(h(Sheet, { open: false, onClose: () => {}, children: 'x' }))).toBe('')
    const open = render(
      h(Sheet, {
        open: true,
        title: 'Brko',
        onClose: () => {},
        children: h(SheetOption, { on: true }, 'Crni kralj'),
      }),
    )
    expect(open).toContain('ui-sheet__grab')
    expect(open).toContain('ui-sheet__opt--on')
  })

  it('keeps its answer out of the half that scrolls', () => {
    // A sheet taller than the screen scrolls in the middle and nowhere else
    // (#563): the handle, the title and the buttons stay put, or a landscape
    // phone loses the title off the top with nothing to scroll back to.
    const open = render(
      h(Sheet, {
        open: true,
        title: 'Brko',
        onClose: () => {},
        footer: h('button', {}, 'Spremi'),
        children: h(SheetOption, { on: true }, 'Crni kralj'),
      }),
    )
    expect(open.indexOf('ui-sheet__body')).toBeLessThan(open.indexOf('ui-sheet__foot'))
    expect(open.indexOf('ui-sheet__opt')).toBeLessThan(open.indexOf('ui-sheet__foot'))
  })

  it('shields every half of a sheet from the pull gesture', () => {
    // Without this the wrapper's transform drags the sheet down with the page
    // and then refreshes it away underneath the reader (#562 review). Three
    // since #563: the scrim, the panel, and the half that scrolls inside it.
    const open = render(h(Sheet, { open: true, onClose: () => {}, children: 'x' }))
    expect(open.match(/data-no-pull/g)).toHaveLength(3)
  })
})
