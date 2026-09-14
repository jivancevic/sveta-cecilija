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
import { FilterChips } from './FilterChips'
import { KindChip } from './KindChip'
import { Seasons } from './Seasons'
import { Hero } from './Hero'
import { List, ListRow } from './ListRow'
import { Note } from './Note'
import { CountUp } from './CountUp'
import { Podium } from './Podium'
import { Ring } from './Ring'
import { RoleMark } from './RoleMark'
import { Section } from './Section'
import { ScreenIcon } from './ScreenIcon'
import { Segmented } from './Segmented'
import { Sheet, SheetOption } from './Sheet'
import { Switch } from './Switch'
import { Tile, Tiles } from './Tile'
import { Toast } from './Toast'
import { Trophy } from './Trophy'

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

  // Članovi lists the roster out of an evening, so no row has a title and
  // every disc would otherwise be a blank colour swatch (#573).
  it('wears a person’s initials when there is no title to draw', () => {
    const ciro = render(h(RoleMark, { army: 'crni', initials: 'ĆŠ' }))
    expect(ciro).toContain('ĆŠ')
    expect(ciro).toContain('ui-mark--crni')
  })

  it('lets the evening’s title win over the initials, never both', () => {
    const king = render(h(RoleMark, { army: 'bili', title: 'bili_kralj', initials: 'IM' }))
    expect(king).toContain('<svg')
    expect(king).not.toContain('IM')
  })

  // The crown without a base was the whole of the distinction between the two
  // crni titles, and nobody can name it at 32px. The letter is the name (#592).
  it('puts an O in the Otmanović crown and leaves the kralj’s alone', () => {
    const otman = render(h(RoleMark, { army: 'crni', title: 'otmanovic' }))
    expect(otman).toContain('>O</text>')
    const king = render(h(RoleMark, { army: 'crni', title: 'crni_kralj' }))
    expect(king).not.toContain('<text')
  })

  it('rings the bula of the night and no other bula', () => {
    expect(render(h(RoleMark, { army: 'bula', title: 'bula' }))).toContain('ui-mark--titled')
    expect(render(h(RoleMark, { army: 'bula' }))).not.toContain('ui-mark--titled')
  })
})

describe('Trophy', () => {
  it('draws one cup per place, each in its own metal', () => {
    expect(render(h(Trophy, { place: 1 }))).toContain('ui-trophy--1')
    expect(render(h(Trophy, { place: 2 }))).toContain('ui-trophy--2')
    expect(render(h(Trophy, { place: 3 }))).toContain('ui-trophy--3')
  })

  it('draws one flat silhouette and no numeral inside it (#611)', () => {
    // A digit in a 26px bowl was unreadable and made the cup read as clip art.
    // The place is printed beside the cup, in the same metal; the cup itself
    // only has to say "a medal" and does that with one path.
    const bronze = render(h(Trophy, { place: 3 }))
    expect(bronze).not.toContain('>3<')
    expect(bronze).not.toContain('<text')
    expect((bronze.match(/<path/g) ?? []).length).toBe(1)
  })

  it('still names its place for a reader who cannot see the metal', () => {
    expect(render(h(Trophy, { place: 2 }))).toContain('2. mjesto')
  })

  it('draws nothing below third: a trophy for everybody is a bullet point', () => {
    expect(render(h(Trophy, { place: 4 }))).toBe('')
    expect(render(h(Trophy, { place: 0 }))).toBe('')
  })

  it('has a small size for a cup that stands in a list row', () => {
    expect(render(h(Trophy, { place: 1, small: true }))).toContain('ui-trophy--sm')
    expect(render(h(Trophy, { place: 1 }))).not.toContain('ui-trophy--sm')
  })
})

describe('Ring', () => {
  it('turns a share into an arc, and refuses to pass the full circle', () => {
    expect(render(h(Ring, { value: 175, max: 350 }))).toContain('180deg')
    expect(render(h(Ring, { value: 400, max: 350 }))).toContain('360deg')
    expect(render(h(Ring, { value: 1, max: 0 }))).toContain('0deg')
  })

  it('grows on the one screen it is the subject of', () => {
    // Skener's ring is read at arm's length in the dark (#572), and the size
    // is a prop rather than a screen-side override — the rule the folder is for.
    expect(render(h(Ring, { value: 1, max: 2, size: 'lg' }))).toContain('ui-ring--lg')
    expect(render(h(Ring, { value: 1, max: 2 }))).not.toContain('ui-ring--lg')
  })
})

describe('the rest of the shapes render', () => {
  it('each carries the class its screen composes against', () => {
    expect(render(h(Card, { eyebrow: 'Sljedeća izvedba' }, 'x'))).toContain('ui-card')
    expect(render(h(Hero, { day: '14', month: 'rujna', meta: 'Sutra' }))).toContain('ui-card--hero')
    expect(render(h(Section, { title: 'Rujan', aside: '5 izvedbi' }))).toContain('ui-section')
    expect(render(h(Chip, { tone: 'gold' }, '2 nove'))).toContain('ui-chip--gold')
    expect(render(h(DateDisc, { day: 14, weekday: 'pon', gold: true }))).toContain('ui-date--gold')
    // The third category wears copper, and `tone` is what says which (#591).
    expect(render(h(DateDisc, { day: 14, tone: 'experience' }))).toContain('ui-date--experience')
    expect(render(h(DateDisc, { day: 14, tone: 'regular' }))).toContain('ui-date--gold')
    expect(render(h(DateDisc, { day: 14, tone: 'extra' }))).not.toContain('ui-date--')
    // The same three tones as a pill, for a hero that has no disc (#592).
    expect(render(h(KindChip, { tone: 'experience' }, 'Experience'))).toContain(
      'ui-kindchip--experience',
    )
    expect(render(h(KindChip, { tone: 'regular' }, 'Redovna'))).toContain('ui-kindchip--regular')
    expect(render(h(KindChip, { tone: 'extra' }, 'Vanredna'))).toContain('ui-kindchip--extra')
    expect(render(h(Note, {}, 'Skup u 20:15'))).toContain('ui-note')
    expect(render(h(List, {}, h(ListRow, { title: 'Redovna', meta: '21:00' })))).toContain('ui-row')
    expect(render(h(Tiles, { children: h(Tile, { eyebrow: 'Ljestvica' }) }))).toContain('ui-tile')
    expect(render(h(Toast, { message: 'Osvježeno', open: true }))).toContain('ui-toast--on')
    expect(render(h(Podium, { entries: [{ label: 'Brko', value: 14 }] }))).toContain(
      'ui-podium__step--1',
    )
    // The cup is its own slot above the mark (#607), and the large podium is
    // the only place that draws either.
    expect(
      render(
        h(Podium, {
          large: true,
          entries: [{ label: 'Brko', value: 14, cup: h(Trophy, { place: 1 }) }],
        }),
      ),
    ).toContain('ui-trophy--1')
    expect(
      render(h(Podium, { entries: [{ label: 'Brko', value: 14, cup: h(Trophy, { place: 1 }) }] })),
    ).not.toContain('ui-trophy')
  })

  it('renders the count at its final value on the server, so nothing reflows', () => {
    // The animation is something the browser does to a number that is already
    // right (#568): a reader with no JavaScript, or a screen reader, gets the
    // count itself and the row never changes width after first paint.
    expect(render(h(CountUp, { value: 14 }))).toContain('14')
  })

  it('a segmented control says which of its views is on', () => {
    const seg = render(
      h(Segmented, {
        items: [
          { key: 'all', label: 'Ljestvica' },
          { key: 'mine', label: 'Moja sezona' },
        ],
        value: 'all',
        onSelect: () => {},
        label: 'Ljestvica',
        panelId: 'p',
      }),
    )
    expect(seg).toContain('ui-seg__item--on')
    expect(seg).toContain('aria-selected="true"')
  })

  it('the same control is a radiogroup when it chooses a setting, not a view', () => {
    // Profil's Izgled (#569): three words and no panel behind them. A
    // `role="tab"` with an `aria-controls` pointing at nothing is a lie a
    // screen reader repeats out loud.
    const seg = render(
      h(Segmented, {
        items: [
          { key: 'light', label: 'Svijetla' },
          { key: 'dark', label: 'Tamna' },
        ],
        value: 'dark',
        onSelect: () => {},
        mode: 'options' as const,
        label: 'Izgled aplikacije',
      }),
    )
    expect(seg).toContain('role="radiogroup"')
    expect(seg).toContain('aria-checked="true"')
    expect(seg).not.toContain('aria-controls')
  })

  it('a switch carries its state where a screen reader can hear it', () => {
    const on = render(
      h(Switch, { checked: true, onChange: () => {}, label: 'Obavijesti', note: 'na ovom uređaju' }),
    )
    expect(on).toContain('role="switch"')
    expect(on).toContain('aria-checked="true"')
    expect(on).toContain('ui-switch__thumb')

    const off = render(h(Switch, { checked: false, onChange: () => {}, label: 'Obavijesti' }))
    expect(off).toContain('aria-checked="false"')
  })

  it('a screen icon is the same drawing in the bar and in a Vise row', () => {
    // One map, since #569: a reader who finds Statistika in Više and later gets
    // it as a tab has to recognise it as the same screen.
    const tab = render(h(ScreenIcon, { screen: 'stats' as const, on: true }))
    const row = render(h(ScreenIcon, { screen: 'stats' as const, size: 22 }))
    expect(tab).toContain('<svg')
    expect(row).toContain('<svg')
    // The blades are Cecilija's own drawing and belong to the dance (#565).
    expect(render(h(ScreenIcon, { screen: 'moreska' as const }))).toContain('M14.5 17.5')
  })

  it('a row of filter chips fills the one that is on, and links the rest', () => {
    const filters = render(
      h(FilterChips, {
        items: [
          { key: '', label: 'Sve narudžbe', href: '/app/orders' },
          { key: 'refunded', label: 'Vraćene', href: '/app/orders?state=refunded' },
        ],
        active: 'refunded',
        label: 'Stanje',
      }),
    )
    expect(filters).toContain('ui-filter--on')
    expect(filters).toContain('aria-current="true"')
    // Every chip is an address, so the control works with no JavaScript and a
    // filtered list can be sent to somebody in a message.
    expect(filters).toContain('href="/app/orders?state=refunded"')
  })

  // The other kind of list (#573): Članovi is already in the page and narrows
  // on the keystroke, so its chips are buttons rather than addresses.
  it('a chip with nowhere to go is a button that says whether it is on', () => {
    const chips = render(
      h(FilterChips, {
        items: [
          { key: 'all', label: 'Svi' },
          { key: 'no-login', label: 'Bez prijave' },
        ],
        active: 'no-login',
        label: 'Filtar popisa',
      }),
    )
    expect(chips).toContain('<button')
    expect(chips).not.toContain('href=')
    expect(chips).toContain('aria-pressed="true"')
  })

  it('a large podium carries a mark, a place and the reader own step', () => {
    const podium = render(
      h(Podium, {
        large: true,
        entries: [
          { id: '1', label: 'Brko', value: 14, caption: '1. mjesto', me: true },
          { id: '2', label: 'Cico', value: 12, caption: '2. mjesto' },
        ],
      }),
    )
    expect(podium).toContain('ui-podium--lg')
    expect(podium).toContain('ui-podium__step--me')
    expect(podium).toContain('1. mjesto')
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

describe('Seasons', () => {
  it('marks the year being read and links the others', () => {
    const html = render(
      h(Seasons, {
        seasons: [2026, 2025],
        season: 2026,
        href: (year: number) => `/app/stats?season=${year}`,
        label: 'Sezona',
      }),
    )
    expect(html).toContain('ui-season--on')
    // One current year, whatever the row is long: `aria-current` is how a
    // screen reader hears which of six pills is the one being read.
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toContain('/app/stats?season=2025')
  })
})
