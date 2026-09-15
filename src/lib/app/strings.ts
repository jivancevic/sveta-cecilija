// Every word `/app` says, in one place (#421).
//
// Cecilija is Croatian-only by decision (ADR-0024, story 33): it is a
// tool for the society's own dancers, not a second face of the ticket shop, so
// it carries no i18n layer, no locale cookie and no `src/messages` dictionary.
// One frozen map, imported by the pages and by the route handlers that answer
// with a message.
//
// Copy rules (CONTEXT.md): "moreška" lowercase in Croatian, a dancer is a
// "moreškant" and never a "moreškar", the event noun is never "predstava", and
// no em-dashes in anything a person reads.
//
// **Two registers for one evening** (CONTEXT.md, decided 2026-09-13, applied in
// #565). The border is the AUDIENCE, never the screen or the URL:
//
//   selling register, "izvedba"  everything a buyer, a partner, the blagajna,
//                                the door or a statistics reader sees.
//   dancer register, "nastup"    everything a moreškant or a voditelj reads AS
//                                A DANCER: Moreška, attendance, the lineup, the
//                                roster's push messages and the Ljestvica.
//
// So `home.*` (Izvedbe) says "izvedba" and `moreska.*` says "nastup" about the
// same evening, and a person who holds both sets reads both words. Before you
// add a string here, ask who reads it.

import type { Permission } from '@/lib/access/permissions'
import type { EnquiryType } from '@/lib/contact/enquiry-type'
import type { PerformanceKind } from '@/lib/show-performance'
import type { LineupRole } from '@/lib/moreskant-profile'
import { LINEUP_ROLE_LABELS } from '@/lib/moreskant-profile'
// A type, and therefore erased: `members-screen.ts` imports these strings back,
// and a value import either way would be a cycle.
import type { MemberFilter } from './members-screen'

/**
 * "7 moreški": a count and the Croatian form that follows it (#628).
 *
 * The same three forms `pluralize` in `roster-loaders.ts` picks between, and a
 * deliberate second copy of that ONE line rather than an import: that module
 * imports this file, so a value import back would be a cycle. Two callers here
 * needed it and each had grown its own four-branch cascade, which is a worse
 * copy than this one.
 */
function croatianPlural(n: number, forms: { one: string; few: string; many: string }): string {
  const mod100 = Math.abs(n) % 100
  const mod10 = Math.abs(n) % 10
  if (mod100 >= 11 && mod100 <= 14) return `${n} ${forms.many}`
  if (mod10 === 1) return `${n} ${forms.one}`
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${forms.few}`
  return `${n} ${forms.many}`
}

export const APP_STRINGS = {
  /** The product name: the manifest, the header and the browser tab all use it. */
  name: 'Cecilija',
  tagline: 'HGD Sveta Cecilija',

  header: {
    logout: 'Odjava',
    /** Shown next to the nickname when the account has no dance roles yet. */
    noRoles: 'bez uloge',
    /** The bell's accessible name; the inbox behind it is #496. */
    notifications: 'Obavijesti',
    /** The bar and the sidebar are one landmark each, and both need a name. */
    navLabel: 'Glavni izbornik',
  },

  /**
   * The words the shared shapes say for themselves (#562).
   *
   * A component under `src/app/app/ui/` renders these; a screen passes it
   * numbers and never copy. Two of them are the answer to "are we enough
   * tonight", which is the one sentence the whole ArmyBar exists to say.
   */
  ui: {
    /** The pull-to-refresh confirmation. `time` is already "21:05". */
    refreshed: (time: string) => `Osvježeno · ${time}`,
    /** What the gesture IS, for a reader who cannot see the ring fill. */
    refreshing: 'Osvježavam',
    /** The skeleton says nothing on screen, so it says this out loud (#593). */
    loading: 'Učitavam',
    armyCrni: 'Crni',
    armyBili: 'Bili',
    enough: 'Ima nas dovoljno',
    /**
     * A PAST evening's bar: the plain counts, never a shortfall (#620).
     *
     * "Fale još 2 crna" about an evening that has been danced is an instruction
     * nobody can act on. Once the nastup has started the same line states what
     * turned up, in the same two words the rest of the app uses for the armies.
     */
    countCrni: (n: number) =>
      n === 1 ? '1 crni' : `${n} ${n < 5 ? 'crna' : 'crnih'}`,
    countBili: (n: number) =>
      n === 1 ? '1 bili' : `${n} ${n < 5 ? 'bila' : 'bilih'}`,
    /** "fale još 2 crna" / "fali još 1 bili": Croatian counts, not a plural. */
    shortCrni: (n: number) =>
      n === 1 ? 'fali još 1 crni' : `fale još ${n} ${n < 5 ? 'crna' : 'crnih'}`,
    shortBili: (n: number) =>
      n === 1 ? 'fali još 1 bili' : `fale još ${n} ${n < 5 ? 'bila' : 'bilih'}`,
    /**
     * The niz, said out loud (#628).
     *
     * A flame means nothing to a screen reader, and "vatrica 7" means less. The
     * glyph and the digits are both `aria-hidden` so this is read once. The
     * forms are GENITIVE, because they follow "od".
     */
    flame: (n: number) =>
      `niz od ${croatianPlural(n, { one: 'moreške', few: 'moreške', many: 'moreški' })}`,
    /** The sheet's way out, for a screen reader; the scrim is the visible one. */
    sheetClose: 'Zatvori',
    /**
     * The "i" beside a heading (#571): what the control IS, since the glyph
     * alone is a shape and not a name. The card's own title is the sheet's
     * heading, so this never has to say which explanation it opens.
     */
    explain: 'Objašnjenje',
  },

  login: {
    title: 'Prijava',
    intro: 'Prijavi se e-mailom ili korisničkim imenom.',
    identifier: 'E-mail ili korisničko ime',
    password: 'Lozinka',
    submit: 'Prijavi se',
    submitting: 'Prijava u tijeku...',
    missingFields: 'Upiši e-mail ili korisničko ime i lozinku.',
    failed: 'Neispravni podaci za prijavu.',
    unexpected: 'Prijava trenutno nije moguća. Pokušaj ponovno.',
    /**
     * The way in for everybody who never set a password (#463), which after the
     * passwordless invitation is most of the roster. It sits UNDER the form
     * rather than over it, because the dancer who reads this screen at all is
     * usually the one who does have a password and typed it wrong.
     */
    magicLink: 'Pošalji mi link za prijavu',
  },

  /**
   * Signing in from a link (#463): what `/app/session` says while it works and
   * when it cannot.
   *
   * The screen has no form, so every sentence here is either a spinner or a
   * dead end, and each dead end names the way out rather than the cause.
   */
  signIn: {
    title: 'Prijava',
    working: 'Prijavljujem te...',
    /** Unknown, expired or malformed: one situation for the person holding it. */
    invalidToken: 'Poveznica nije ispravna ili je istekla. Zatraži novu.',
    /** ADR-0022: a login several people hold is nobody in particular. */
    sharedAccount: 'Ovu prijavu koristi više osoba, pa se ne može otvoriti poveznicom.',
    notAppAccount:
      'Ta prijava nije za Ceciliju. Lozinku za nju postavi u administraciji.',
    unexpected: 'Prijava trenutno nije moguća. Pokušaj ponovno.',
    retry: 'Zatraži novu poveznicu',
    toLogin: 'Prijava lozinkom',
  },

  /**
   * The refusal panel (#473). Two of them, and the difference matters: an
   * account that unlocks nothing has nowhere to be sent, while one that typed a
   * route it does not hold gets the way back to its own landing screen. Never a
   * silent redirect, which hides a stale bookmark, and never a 404, which lies.
   *
   * The Backoffice link is for a `dev` holder and nobody else: after #473 no
   * Cecilija page offers `/admin` to anyone who is not developing it.
   */
  denied: {
    title: 'Nemate pristup',
    body: 'Tvoj račun još nema pristup nijednom dijelu Cecilije. Javi se tajnici ili voditelju.',
    screenTitle: 'Ovaj dio nije za tvoj račun',
    screenBody: 'Tvoj račun ne otvara ovaj ekran. Ako ti treba, javi se tajnici ili voditelju.',
    back: 'Natrag na početak',
    adminLink: 'Otvori Backoffice',
    logout: 'Odjavi se',
  },

  /**
   * The screen names (#495): the labels of the permission → screen table in
   * `lib/app/screens.ts`, which the bottom bar, the laptop sidebar and every
   * page title read. One spelling per screen, in one place.
   */
  screens: {
    /** The landing screen (#564). The first tab, and the only one with a logo. */
    home: 'Početna',
    orders: 'Narudžbe',
    /** The dancer's own screen (#565). The dance, and the tab named after it. */
    moreska: 'Moreška',
    performances: 'Izvedbe',
    members: 'Članovi',
    leaderboard: 'Ljestvica',
    scan: 'Skener',
    sell: 'Prodaja',
    statement: 'Obračun',
    inquiries: 'Upiti',
    /**
     * "Gratis", not the route map's "Gratis i kodovi" (#506): promo codes are
     * not on the screen and never were (#476), so the second half of that name
     * promised something the page does not have.
     */
    comp: 'Gratis',
    /** The tab bar has a fifth of a phone for it. */
    compShort: 'Gratis',
    users: 'Korisnici',
    stats: 'Statistika',
    finance: 'Financije',
    more: 'Više',
    /**
     * "Profil", not the old "Moj račun" (#569, Q20): the row in Više and the
     * screen it opens have to be called the same thing, and the screen is about
     * the person (their nadimak, their skin, their phone's notifications)
     * rather than about an account in a system.
     */
    account: 'Profil',
    notifications: 'Obavijesti',
  },

  /** The laptop sidebar's workspaces (#472). */
  groups: {
    moreskant: 'Moreškant',
    box: 'Blagajna',
    partner: 'Partner',
    door: 'Vrata',
    admin: 'Uprava',
  },

  list: {
    season: 'Sezona',
  },

  /**
   * Početna (#564), the landing screen `/app` became when it stopped
   * redirecting.
   *
   * Two sentences and then cards. The greeting names the reader and nothing
   * else: no vocative ("Dobra večer, Josip." and never "Josipe"), because the
   * roster is full of names whose vocative nobody agrees on and a form a person
   * would not use for themselves reads as a machine trying to be familiar. An
   * account with no name to use (a shared login, ADR-0022) gets no greeting at
   * all rather than a greeting addressed to nobody.
   *
   * The second sentence is in the reader's own register (CONTEXT.md, two
   * registers): a moreškant and a voditelj read "nastup", everybody else reads
   * "izvedba" about the same evening.
   *
   * Every card names its screen and offers ONE way in, spelled out here rather
   * than composed from the screen's label: "Otvori Upite" is the accusative of
   * "Upiti", and a template that glued the nominative on would say "Otvori
   * Upiti" on four of the twelve screens.
   */
  landing: {
    /** The wordmark beside the logo. Cecilija is named once, and this is it. */
    brand: 'Cecilija',
    morning: 'Dobro jutro',
    afternoon: 'Dobar dan',
    evening: 'Dobra večer',
    greeting: (part: string, name: string) => `${part}, ${name}.`,
    /** The one sentence about the next evening, in the two registers. */
    next: {
      nastup: {
        today: 'Danas je nastup.',
        tomorrow: 'Sutra je nastup.',
        onDay: (weekday: string) => `Nastup je u ${weekday}.`,
        onDate: (date: string) => `Sljedeći nastup je ${date}.`,
      },
      izvedba: {
        today: 'Danas je izvedba.',
        tomorrow: 'Sutra je izvedba.',
        onDay: (weekday: string) => `Izvedba je u ${weekday}.`,
        onDate: (date: string) => `Sljedeća izvedba je ${date}.`,
      },
    },
    /** The one way into each screen, in the case the verb asks for. */
    open: {
      moreska: 'Otvori Morešku',
      orders: 'Otvori Narudžbe',
      performances: 'Otvori Izvedbe',
      members: 'Otvori Članove',
      leaderboard: 'Otvori Ljestvicu',
      scan: 'Otvori Skener',
      sell: 'Otvori Prodaju',
      statement: 'Otvori Obračun',
      inquiries: 'Otvori Upite',
      comp: 'Otvori Gratis',
      users: 'Otvori Korisnike',
      stats: 'Otvori Statistiku',
      finance: 'Otvori Financije',
      notifications: 'Otvori obavijesti',
    },
    /** What each card's figure means. The number itself sits above it. */
    captions: {
      orders: {
        one: 'narudžba za sljedeću izvedbu',
        few: 'narudžbe za sljedeću izvedbu',
        many: 'narudžbi za sljedeću izvedbu',
      },
      ordersAll: { one: 'narudžba ukupno', few: 'narudžbe ukupno', many: 'narudžbi ukupno' },
      inquiries: {
        one: 'neodgovoren upit',
        few: 'neodgovorena upita',
        many: 'neodgovorenih upita',
      },
      /**
       * "javnih" on purpose: the Izvedbe screen lists every performance of the
       * season, public and private (#502), and this figure is the public half
       * — the one the schedule sells. Naming it is cheaper than a second load.
       */
      performances: {
        one: 'javna izvedba do kraja sezone',
        few: 'javne izvedbe do kraja sezone',
        many: 'javnih izvedbi do kraja sezone',
      },
      /**
       * The dancer's register (CONTEXT.md): "nastup", never "izvedba". Only
       * ever read on a Moreška TILE, which is what an account that unlocks
       * Moreška without carrying it as a tab gets instead of the hero.
       */
      moreska: {
        one: 'nastup do kraja sezone',
        few: 'nastupa do kraja sezone',
        many: 'nastupa do kraja sezone',
      },
      members: {
        one: 'aktivan moreškant',
        few: 'aktivna moreškanta',
        many: 'aktivnih moreškanata',
      },
      users: { one: 'račun', few: 'računa', many: 'računa' },
      comp: {
        one: 'gratis ulaznica ove sezone',
        few: 'gratis ulaznice ove sezone',
        many: 'gratis ulaznica ove sezone',
      },
      sell: { one: 'prodana karta', few: 'prodane karte', many: 'prodanih karata' },
      /** "24 prodane karte, Rujan 2026" — the noun, then the month it is about. */
      sellMonth: (noun: string, month: string) => `${noun}, ${month}`,
      /** "od 260 ušlo" — the door's one number, beside how many were sold. */
      scan: (sold: number) => `ušlo, od ${sold} prodanih`,
      /** "karata za sutra, od 350" — the ring's caption, as the prototype has it. */
      stats: (when: string, capacity: number) => `karata za ${when}, od ${capacity}`,
      finance: 'prikupljeno ove sezone',
      /** A screen whose one number would be money, or would repeat another card. */
      statement: 'Mjesečni obračun i CSV za preuzimanje.',
      compPlain: 'Podijeli gratis ulaznice članovima.',
    },
    /** The chip on Članovi when somebody is waiting to be let in (#463). */
    pending: (count: number) => `${count} čeka odobrenje`,
    /** The Ljestvica caption: the reader's own place, or who is leading. */
    myPlace: (rank: number, count: string) => `ti si ${rank}. s ${count}`,
    leading: (nickname: string, count: string) => `vodi ${nickname} s ${count}`,
    /** The Statistika ring and the Skener card when there is no evening left. */
    noShow: 'Nema izvedbe u rasporedu.',
    noSeason: 'Sezona još nije počela.',
    /** The Obavijesti card. */
    notifications: 'Obavijesti',
    notificationsEmpty: 'Nema obavijesti.',
    notificationsNew: (count: number) =>
      `${count} ${count % 100 >= 11 && count % 100 <= 14 ? 'novih' : count % 10 === 1 ? 'nova' : count % 10 >= 2 && count % 10 <= 4 ? 'nove' : 'novih'}`,
  },

  /**
   * The home screen (#457): one hero for the next evening, then the agenda by
   * month, then the past behind a disclosure.
   *
   * `inDays` declines "dan" the way Croatian does (1, 21, 31 → "dan"), and the
   * three count words are the three Croatian plural buckets; `countLabel` in
   * `roster-loaders.ts` picks between them, so the rule is tested once.
   */
  home: {
    next: 'Sljedeća izvedba',
    today: 'danas',
    tomorrow: 'sutra',
    inDays: (days: number) =>
      `za ${days} ${days % 10 === 1 && days % 100 !== 11 ? 'dan' : 'dana'}`,
    detailLink: 'Tko dolazi, postava, ulaznice ›',
    count: { one: 'izvedba', few: 'izvedbe', many: 'izvedbi' },
    answerYes: 'Dolazim',
    answerNo: 'Ne dolazim',
    answerNone: 'Bez odgovora',
    armyCrni: 'Crna vojska',
    armyBili: 'Bila vojska',
    cancelled: 'otkazano',
    past: (count: number) => `Prošle izvedbe (${count})`,
    /**
     * Two ways to have no next evening, and they are not the same news: the
     * season is over, or it has not started. The title is picked on whether
     * there is a last past evening to name.
     */
    eosTitle: 'Sezona je završila',
    eosBody: (date: string) => `Zadnja izvedba bila je ${date}.`,
    eosNothingTitle: 'Sezona još nije počela',
    eosNothing: 'Ove sezone još nije bilo izvedbi.',
    eosLink: 'Pogledaj svoju sezonu',
  },

  /**
   * Moreška, the dancer's own screen (#565).
   *
   * Every noun here is in the DANCER's register: a moreškant reads "nastup",
   * never "izvedba" (CONTEXT.md, two registers, decided 2026-09-13). The same
   * evening is an "izvedba" one tab away on Izvedbe, whose audience is the
   * blagajna, and a person who holds both sets reads both words for the same
   * evening. That is the rule working, not a drift.
   *
   * A non-regular evening reads "Vanredna" and nothing else (Q30): never the
   * client, never the kind name. A dancer turns up for the evening; which
   * agency booked it is the voditelj's business and lives on Izvedbe.
   */
  moreska: {
    next: 'Sljedeći nastup',
    /** Two nastupa on one day share one header, so the word is plural (#591). */
    nextTwo: 'Sljedeći nastupi',
    /**
     * The label in the hero's eyebrow when the evening is TONIGHT (#612).
     *
     * Uppercase because it sits in the eyebrow row, which is the one place in
     * Cecilija where the uppercase micro-label survives, and one word because
     * it has to be readable at the far edge of a card a dancer is glancing at.
     * It carries the news on its own: the gold edge and the sweep around it are
     * both decoration a reader may never see (reduced motion, a colour-blind
     * eye), and this word is what is left when they are gone.
     */
    todayBadge: 'DANAS',
    /**
     * The one line of numbers a half carries: the two armies, no thresholds.
     *
     * The words only. The counts are drawn beside them by the component, which
     * sets them in ink against the muted words (#592), so the line reads as two
     * numbers rather than as a sentence.
     */
    armiesWords: { crni: 'crni', bili: 'bili' },
    /** "još 2 nastupa taj dan" — the third and beyond, which the hero caps off. */
    moreThatDay: { one: 'nastup taj dan', few: 'nastupa taj dan', many: 'nastupa taj dan' },
    /** "9 nastupa pred tobom": what is still ahead of the reader this season. */
    ahead: { one: 'nastup pred tobom', few: 'nastupa pred tobom', many: 'nastupa pred tobom' },
    /** The quiet count beside a month heading. */
    count: { one: 'nastup', few: 'nastupa', many: 'nastupa' },
    /**
     * The only three words a row's title may say (#591). "Experience" is the
     * English word on purpose: it is what the society calls the product,
     * Croatian conversation included. The rule is `performance-kind.ts`.
     */
    regular: 'Redovna',
    extra: 'Vanredna',
    experienceWord: 'Experience',
    cancelled: 'otkazano',
    /**
     * How close a nastup is, beside the kind word in the season list (#612).
     *
     * Only inside a week: past seven days "za 12 dana" stops being a distance a
     * dancer feels and becomes a number they have to convert back into a date,
     * which the row already prints. The wording is deliberately the one said
     * out loud, which is why 1 is "sutra" and not "za 1 dan" — and why
     * `soonInDays` never has to spell the singular: 2 through 7 all take "dana".
     */
    soonToday: 'danas',
    soonTomorrow: 'sutra',
    soonInDays: (days: number) => `za ${days} dana`,
    /**
     * The chip on a PAST row (#612): there is a list of who danced that
     * evening, and the reader can open the row to see whether they are on it.
     *
     * It replaced "Postava potvrđena", which was a gold chip saying a thing
     * about the voditelj's workflow on a screen a dancer reads backwards. The
     * word is short and green because it is an aside, not news.
     */
    lineupList: 'POPIS',
    /**
     * A past evening whose postava nobody ever confirmed (#634).
     *
     * The same shape POPIS had and the opposite colour, because it is the same
     * kind of statement about the same evening: this one has no record of who
     * danced it. Red rather than grey on purpose — it is something a voditelj
     * can still put right, and the season list is where he would notice.
     */
    noLineup: 'Nema popisa',
    /** What "7/9" means, for a reader who cannot see the two colours. */
    postavaLabel: (crni: number, bili: number) => `${crni} crnih, ${bili} bilih`,
    /**
     * The two circles on a future row (#624), which is what a row's answer is
     * now: a green one with the crossed swords and a red one with an X, both
     * always drawn, the chosen one filled.
     *
     * The buttons themselves say "Dolazim" / "Ne dolazim" to a screen reader
     * (`APP_STRINGS.answer`, the same two words the hero's pair carries), so
     * only the un-tap needs its own sentence. The three chip words that used to
     * live here — "bez odgovora", "dolaziš", "ne dolaziš" — went with the chip:
     * a state drawn as a colour does not also need a label beside it.
     */
    /**
     * The hero once an answer has landed, in the third person, for a sentence
     * ABOUT the answer rather than for the buttons.
     *
     * The pair itself never says these (#592): it always reads "Dolazim" / "Ne
     * dolazim" (`APP_STRINGS.answer`), and it never names the army. The army is
     * the server's decision, a voditelj can change it for one evening, and a
     * button whose label moves under the thumb is not a button. `comingIn` and
     * *Promijeni* went with the collapsed single button that printed them.
     */
    coming: 'Dolaziš',
    notComing: 'Ne dolaziš',
    past: (count: number) => `Prošli nastupi (${count})`,
    /** Two ways to have no next nastup, and they are not the same news. */
    eosTitle: 'Sezona je završila',
    eosBody: (date: string) => `Zadnji nastup bio je ${date}.`,
    eosNothingTitle: 'Sezona još nije počela',
    eosNothing: 'Ove sezone još nije bilo nastupa.',
    /**
     * A voditelj who does not dance (#419, story 15) opens this screen to read
     * the roster, not to answer for themselves. The line says so once, quietly,
     * so it does not read as something they are late on.
     */
    noMember: 'Nemaš povezan profil moreškanta, pa ovdje nema tvog odgovora.',
  },

  /**
   * Stanje: one nastup, its two armies and its titles (#566).
   *
   * The DANCER's register throughout ("nastup", never "izvedba"), because the
   * whole screen is read as a dancer: a voditelj standing in front of the
   * columns at seven in the evening is not selling anything.
   *
   * Two words are worth pinning. **"Mjesto"** is what an unfilled place in a
   * column is called, never "prazno" or a dash: the columns are a picture of
   * the two lines on the pier, and a line has places. **"Titula"** is the
   * glossary's word (CONTEXT.md) and never "uloga", which is the profile fact a
   * dancer carries from evening to evening.
   */
  stanje: {
    title: 'Stanje',
    back: 'Moreška',
    /** The place a column is still short. `n` is the place's own number. */
    slot: (n: number) => `mjesto ${n}`,
    /** The head of a column: "7 od 8". */
    ofThreshold: (count: number, threshold: number) => `${count} od ${threshold}`,
    bule: 'Bule',
    noAnswer: 'Bez odgovora',
    notComing: 'Ne dolaze',
    /**
     * Odustali (#612; glossary: *Odustajanje*). The word is deliberately NOT
     * "Otkazali": in this app *otkazati* is what happens to an izvedba, with
     * refunds behind it, and the two must never share a verb.
     */
    withdrawn: 'Odustali',
    /**
     * Under a name on that list. THREE wordings, not two: `withdrewOwn` is
     * null on a row stamped before it existed, and a screen that read null as
     * "the dancer did it" would assert something nobody knows. The neutral one
     * says only what the row actually holds.
     */
    withdrewSelf: (time: string) => `odustao u ${time}`,
    withdrewByVoditelj: (time: string) => `voditelj upisao u ${time}`,
    withdrewUnknown: (time: string) => `povukao se u ${time}`,
    nobody: 'Nema nikoga.',
    lineupConfirmed: 'Postava potvrđena',
    cancelled: 'Otkazano',
    /** The tally over the voditelj's two actions: "Titule 3 od 4". */
    titles: (given: number, all: number) => `Titule ${given} od ${all}`,
    noTitle: 'Bez titule',
    /**
     * The bula's one row, where every other column has a list of titles (#627).
     *
     * `titlesForArmy('bula')` is a list of one, so her sheet offered a choice
     * between "Bula" and "Bez titule" — and "Bez titule" for a bula IS taking
     * her out of the postava, because there is no plain bula to fall back to
     * (`lineup/titles.ts`). This says what the tap does.
     */
    removeFromLineup: 'Makni iz postave',
    /** The person sheet's two halves. */
    answerFor: 'Odgovor',
    titleFor: 'Titula',
    clear: 'Poništi odgovor',
    /** The chip on a postava row nobody has answered for (#581 review). */
    noAnswerChip: 'bez odgovora',
    /** The voditelj's two buttons. */
    call: 'Pozovi',
    callTitle: 'Pozovi moreškante',
    confirm: 'Potvrdi postavu',
    confirming: 'Potvrđujem...',
    confirmed: 'Postava je potvrđena.',
    unlock: 'Otključaj postavu',
    unlocking: 'Otključavam...',
    unlocked: 'Postava je otključana.',
    /** Why Potvrdi is not available yet: the rule, in the voditelj's words. */
    needTitles: 'Podijeli sve četiri titule pa potvrdi postavu.',
    /** The confirmed postava, for a dancer: nobody may change it any more. */
    confirmedNote: 'Postava je potvrđena. Titule vide svi.',
    /** The Pozovi sheet: the message that goes out, and the two thresholds. */
    callBody: 'Alarm zvoni na mobitelima onih koji još nisu odgovorili.',
    callMessage: 'Poruka',

    /* Dodavanje u postavu (#620).
       One gesture with two meanings, and the voditelj is told neither: before
       the nastup the tap records PRISUTNOST, after it records the POSTAVA. So
       the wording is about the column and never about the table. */

    /** The empty place and the past evening's row both open the same sheet. */
    addTo: { crni: 'Dodaj u crne', bili: 'Dodaj u bile', bula: 'Dodaj bulu' },
    /** The sheet over the whole roster, on an Experience only. */
    addVoditelj: 'Dodaj voditelja',
    /** Above the list in every picker, so a name is a letter away. */
    search: 'Traži moreškanta',
    /** The chip that shows every role at once: the filter turned off. */
    allRoles: 'Sve',
    /** Nobody is left who may dance this. Not an error, just the end of a list. */
    nobodyToAdd: 'Nema nikoga za dodati.',
    /** Beside a name at the bottom of a picker: they have already said no. */
    notComingChip: 'ne dolazi',
    /**
     * The caption over the second half of an army picker (#633).
     *
     * Anybody may dance any role if the evening needs it, so "Dodaj u bile"
     * offers the crni too. They stand under this line rather than mixed into
     * the names, because the list is read from the top and the first half is
     * who the voditelj is actually looking for.
     */
    otherArmy: 'Ostali moreškanti',

    /* Voditelj (#620).
       A Moreška Experience is run by somebody who does not dance it, and the
       2026 notebook names him. An ordinary moreška has no such line at all
       (glossary: *Voditelj (u postavi)*), which is why the card is drawn only
       on an Experience. */

    voditelj: 'Voditelj',
    noVoditelj: 'Nije određen.',
    /** Why Potvrdi is not available on an Experience yet. */
    needVoditelj: 'Odredi voditelja pa potvrdi postavu.',
    saving: 'Spremam...',
    failed: 'Nije spremljeno. Pokušaj ponovno.',
  },

  /** The "Moje" tab: one dancer's own season (#457). */
  mySeason: {
    title: 'Moje',
    /** The two panels, which are also what `?dio=` means on this tab. */
    segments: {
      mine: 'Moja sezona',
      all: 'Ljestvica',
    },
    season: 'Sezona',
    mine: 'u postavi',
    /** Pluralised by the count on the tile: "1 nastup u sezoni", "22 nastupa u sezoni". */
    total: { one: 'nastup u sezoni', few: 'nastupa u sezoni', many: 'nastupa u sezoni' },
    crni: 'Crna vojska',
    bili: 'Bila vojska',
    byMonth: 'Po mjesecu',
    chartLabel: 'Nastupi po mjesecu',
    legend: 'Zlatno: u potvrđenoj postavi. Sivo: svi potvrđeni nastupi sezone.',
    roles: 'Uloge',
    times: (count: number) => `${count}×`,
    /**
     * The four milestones of the glossary (5, 10, 15, 20) and "puna sezona",
     * on the dancer's own panel since #568 — the board next to it is a ranking
     * and a ranking is about everybody, while a prekretnica is about one
     * person's season. **No streaks here or anywhere**, which is a decision
     * rather than an omission (glossary: *Ljestvica*).
     */
    /** The season's nastupi split by what kind of evening they were. */
    byKind: 'Po vrsti nastupa',
    emptyTitle: 'Još nisi plesao ove sezone',
    emptyBody: 'Prva potvrđena postava pojavit će se ovdje.',
    emptyLink: 'Odgovori na sljedeći nastup',
    /**
     * A voditelj without a Member row is not a dancer who has not danced yet
     * (#457 review): the season below is the SOCIETY's, so the line says what
     * is missing and the tiles say whose numbers those are.
     */
    noMember: 'Nemaš povezan profil moreškanta.',
    noMemberBody: 'Ispod su brojke cijele sezone.',
    seasonTotal: 'potvrđenih nastupa',
    seasonMonths: 'mjeseci s nastupom',
  },

  /**
   * The Ljestvica, the second panel of the Moje tab (#457, glossary:
   * *Ljestvica*).
   *
   * Every counted noun here is handed to `pluralize` rather than written with a
   * fixed ending: "1 nastupa do 2. mjesta" would be the kind of sentence that
   * tells a dancer the app was written by somebody who does not speak to them.
   */
  board: {
    /** The small caption under the big "#3": out of how many moreškanata. */
    outOf: (total: number) => `od ${total}`,
    leading: 'Vodiš ljestvicu.',
    toNextPlace: (count: string, place: number) => `Još ${count} do ${place}. mjesta.`,
    /** The chip that says which row is the reader's own. */
    you: 'ti',
    /** The caption under a podium tile, so the rank reads as a place and not as a second count. */
    place: (rank: number) => `${rank}. mjesto`,
    confirmedCount: {
      one: 'potvrđen nastup',
      few: 'potvrđena nastupa',
      many: 'potvrđenih nastupa',
    },
    footer: (confirmed: string) =>
      `Broji se samo potvrđena postava. ${confirmed} u sezoni.`,
    empty: 'Ljestvica počinje s prvom potvrđenom postavom.',

    /* ── One season, two lists (#568, decision Q36) ──────────────────────
       The Experience is danced by three pairs and a full evening by the whole
       ansambl, so they are ranked apart. The second name is the English one on
       purpose: *Moreška Experience* is what the society sells it as (glossary),
       and "iskustvo" is nobody's word for it. */
    lists: {
      moreska: 'Moreška',
      experience: 'Experience',
    },
    /** The quiet count beside a list heading: how many moreškanata are on it. */
    onList: { one: 'moreškant', few: 'moreškanta', many: 'moreškanata' },
    /** Under each list, when there is more of it than the screen shows. */
    seeAll: 'Vidi cijeli popis',
    /**
     * "s 1 nastupom", "s 14 nastupa" — the INSTRUMENTAL, which is the case the
     * standing sentence needs and the only place in the app that needs it.
     * `moreska.count` is the nominative ("1 nastup") and reads as a typo after
     * "s": Croatian declines, and a counted noun is not one word.
     */
    withCount: { one: 'nastupom', few: 'nastupa', many: 'nastupa' },
    /** The reader's standing, above the list rather than in a card of its own. */
    standing: (rank: number, count: string) => `Ti si ${rank}. s ${count}.`,
    /**
     * The pinned last row of a reader who is further down than the cut: their
     * own place, always on the screen, never behind "vidi cijeli popis".
     */
    pinned: (rank: number) => `ti · ${rank}.`,
    /** A row's rank, in the column in front of the mark. */
    rank: (rank: number) => `${rank}.`,

    /* ── The seven chips (#607, decision Q2) ──────────────────────────────
       Two groups under one control, and the labels do not try to hide it: the
       line under the heading says which number the list is showing, because
       "18" meaning "evenings danced" and "18" meaning "crowns worn" look
       identical in a column. */
    filters: {
      svi: 'Svi',
      crni: 'Crni',
      bili: 'Bili',
      bula: 'Bula',
      crni_kralj: 'Crni kralj',
      bili_kralj: 'Bili kralj',
      otmanovic: 'Otmanović',
      /** The third group (#634): a run of evenings, not a count of them. */
      niz: 'Najduži niz',
    },
    /** What the number in the row means, under the heading, for each group. */
    countsEvenings: 'Broj je ukupan broj nastupa u sezoni.',
    countsTitle: 'Broj je koliko je puta uloga podijeljena.',
    /**
     * The niz chip's own caption (#634). It says two things, because both are
     * surprising: the number is a RUN, and it is this season's run only.
     */
    countsNiz: 'Broj je najduži niz uzastopnih moreški u sezoni.',
    /** Nobody wore this title in this season's evenings of this kind. */
    emptyFilter: 'Nitko ove sezone nije igrao ovu ulogu.',

    /* ── Rank movement (#607) ─────────────────────────────────────────────
       A drop is printed exactly like a rise. Somebody passed the reader
       because the reader was not there, and saying so plainly is the opposite
       of a reproach. */
    /** "▲2" / "▼1" — the glyph is the direction, the number is the distance. */
    movement: (places: number) => `${places > 0 ? '▲' : '▼'}${Math.abs(places)}`,
    movementLabel: (places: number) =>
      places > 0
        ? `Popeo si se ${places} mjesta nakon zadnje moreške.`
        : `Pao si ${Math.abs(places)} mjesta nakon zadnje moreške.`,
    movementSince: 'nakon zadnje moreške',
    /** An Experience list in a season that has had none. */
    emptyExperience: 'Ove sezone još nema potvrđene postave za Moreška Experience.',

    /* ── The reader's own card (#614, Q1) ─────────────────────────────────
       The board's one motivating sentence used to be set as a grey caption
       between the podium and the list. It is the most valuable thing on the
       screen — where am I, and what is one evening worth — so it is now the
       first card under the podium, and these are its four lines.

       `mine` rather than `you`, which is taken by the one-word chip on the
       reader's row. */
    mine: {
      /** Q6: the rank said the way a person hears it, beside the rank itself. */
      betterThan: (percent: number) => `bolji si od ${percent}% moreškanata`,
      /** The reader at the top, where there is no percentage to print. */
      leading: 'vodiš ljestvicu',
      /** The line under the track: how far the next place is, and who holds it. */
      toNext: (count: string, place: number) => `Još ${count} do ${place}. mjesta`,
      /** Q5, the neighbour: "ispred tebe je Ojda (12)". */
      ahead: (nickname: string, count: number) => `ispred tebe je ${nickname} (${count})`,
      /**
       * A reader who has not danced one yet: a count of zero is not a place
       * (#614), so the card is replaced by the plain fact.
       */
      none: {
        moreska: 'Još nemaš nastup ove sezone.',
        experience: 'Još nemaš Experience ove sezone.',
      },
    },

    /* ── Who moved past whom on the last evening (#614, Q5) ───────────────
       Both nicknames stay in the NOMINATIVE and neither sentence carries a
       participle: a Croatian nickname declines in ways no template can guess,
       and "prestigao / prestigla" would need a gender this screen does not
       hold. The two read as a pair, which is also the point — a loss is
       reported in exactly the same words as a win. */
    rival: {
      passed: (nickname: string) => `${nickname} je sad iza tebe.`,
      overtaken: (nickname: string) => `${nickname} je sad ispred tebe.`,
    },

    /* ── The season's clock (#614, Q3) ────────────────────────────────────
       Without a deadline a rank is a verdict; with one it is a thing to play
       for. The number is the season's own remaining evenings, so it needs no
       new data and cannot disagree with the ring on Moja sezona. */
    remaining: (count: string) => `Ostalo još ${count} u sezoni.`,
    remainingCount: {
      moreska: { one: 'moreška', few: 'moreške', many: 'moreški' },
      experience: { one: 'Experience', few: 'Experiencea', many: 'Experiencea' },
    },
    /** Nothing left on the calendar: the season is played out, not "0 left". */
    remainingNone: 'Sezona je odigrana.',

    /* ── What the next nastup is worth (#614, Q4) ─────────────────────────
       The one piece of gamification here that no other app could copy: this
       app knows what is coming and whether the reader has answered, so it can
       say what one evening changes before the evening happens. */
    next: {
      ask: (day: string, place: number) => `Dođeš li u ${day}, ideš na ${place}. mjesto.`,
      coming: (day: string, place: number) => `U ${day} ideš na ${place}. mjesto.`,
      /**
       * The reader who has not danced one yet (#614 review).
       *
       * They are exactly who this card is for, and they were the one reader it
       * skipped: with no count they hold no place, so there was no rank for the
       * projection to improve on. They are not climbing, they are STARTING, and
       * the sentence says that instead of naming a place out of nowhere.
       */
      first: (day: string) => `Dođeš li u ${day}, ulaziš na ljestvicu.`,
      firstComing: (day: string) => `U ${day} ulaziš na ljestvicu.`,
    },

    /* ── A list too small to rank (#614, finding 02) ──────────────────────
       Two Experiences bought "3. mjesto od 70" and the same gold mark that
       twenty-one moreške buys. Under the floor the list is COUNTED and not
       placed: a leader line, and rows with no rank. */
    leadersLine: (names: string, count: number, shared: boolean) =>
      `Najviše nastupa: ${names} (${shared ? 'po ' : ''}${count}).`,
    /** Two names read as "A i B"; more than three are cut with a count. */
    leadersAnd: (names: string[], rest: number) =>
      rest > 0 ? `${names.join(', ')} i još ${rest}` : names.join(' i '),
    unranked: 'Premalo nastupa za rang, pa se ovdje samo broji.',

    /* ── Kralj sezone (#614, Q8) ──────────────────────────────────────────
       The only mechanic on this screen that belongs to this society rather
       than to a fitness app. It does NOT put a crown on anybody: a titula
       belongs to one evening's lineup (CONTEXT.md → *Title*), and this is a
       season's counter exactly as a rank is. */
    kings: {
      title: 'Kralj sezone',
      /** "Markan · 11×", with the title itself as the row's own label. */
      line: (names: string, count: number) => `${names} · ${count}×`,
      /**
       * Under the heading, so nobody reads the tally as a standing title.
       *
       * It says WHO WORE IT MOST and not how many times the titula was given,
       * because the row carries the first number and not the second — a label
       * that promises a figure the renderer does not print is the #599 fault
       * in miniature.
       */
      note: 'Tko je koju titulu nosio najviše puta ove sezone.',
    },

    /* ── The full list (#568) ────────────────────────────────────────── */
    full: {
      title: 'Cijeli popis',
      back: 'Natrag na ljestvicu',
      /** The voditelj's own line on a row: which evenings the count is made of. */
      breakdown: (parts: string[]) => parts.join(' · '),
      /**
       * "2 × crni kralj · 1 × otmanović" — the titles a dancer wore in THOSE
       * evenings, the quiet second line under the split.
       *
       * Only the four titles, and only the ones above zero: a dancer with no
       * titula that season gets no line rather than four zeros.
       */
      worn: (count: number, label: string) => `${count} × ${label}`,
    },
  },

  /**
   * A moreškant's season profile (#608), and Moja sezona, which is the same
   * screen with the reader in it.
   *
   * Croatian throughout, like every `/app` screen. The two rings are named by
   * the lists they belong to (`board.lists`) rather than re-worded here.
   */
  profile: {
    /** Under the name: the roles this person is able to dance. */
    canDance: 'Pleše',
    /** A dancer whose profile carries no role yet. */
    canDanceNone: 'Uloge još nisu upisane.',
    /** Under a ring: "4. mjesto od 70". */
    place: (rank: number, total: number) => `${rank}. mjesto od ${total}`,
    /** A dancer with no evening of this kind: a rank would be a rank of nothing. */
    placeNone: 'bez nastupa',
    /** Inside a ring: "od 21". */
    ringOf: (total: number) => `od ${total}`,
    /**
     * The two small rings beside the big one (#634): which half of the season
     * each is. The word goes UNDER the ring, because at that size it will not
     * fit inside it.
     */
    partLabel: { redovna: 'Redovne', vanredna: 'Vanredne' } as const,
    /**
     * The second list with nothing in it (#614, finding 11).
     *
     * A ring at "0 od 2" is a dead circle: it says nothing and invites nothing.
     * Two words say the same thing and read as a sentence.
     */
    sideNone: 'još nijedan',
    /**
     * The record (#628), across every season: the longest niz.
     *
     * It took "Najbolja sezona"'s place, and the swap is the point. A best
     * season is a number that can only be beaten once a year and is settled by
     * August; a longest niz is a record somebody can break next Wednesday,
     * which is what a record on a dancer's own profile is for.
     */
    niz: 'Najduži niz',
    nizValue: (count: number) =>
      `${croatianPlural(count, { one: 'moreška', few: 'moreške', many: 'moreški' })} zaredom`,
    /** When the record IS the run still going. */
    nizCurrent: 'I još traje.',
    /**
     * Which evenings the record was (#634): a RANGE, and deliberately no verb.
     *
     * "Ugasio se" was the word Josip reached for and asked to be replaced,
     * because it is ambiguous in exactly the wrong place: it reads as either
     * the last evening danced in the run or the first one missed. Two dates
     * with "od" and "do" cannot be read two ways, and both of them are the
     * dancer's own evenings. "Do" is never the evening they missed: the run is
     * theirs and not the gap's.
     */
    nizRange: (from: string, to: string) => `Od ${from} do ${to}.`,
    /** The run that is still going has one end only. */
    nizSince: (from: string) => `Traje od ${from}.`,
    nizNone: 'još nema',
    /** What the flame means, said once under the list rather than on every row. */
    nizLegend: 'Vatrica uz nadimak: niz od barem 3 moreške koji još traje.',
    /** The list of evenings danced. */
    evenings: 'Nastupi',
    eveningsCount: { one: 'nastup', few: 'nastupa', many: 'nastupa' },
    /** A dancer who has danced nothing this season. */
    eveningsEmpty: 'Ove sezone još nema potvrđene postave.',
    /** The chart at the bottom, on somebody else's profile. */
    legendOther: 'Zlatno: u potvrđenoj postavi. Sivo: svi potvrđeni nastupi sezone.',
    /** The back link of the profile, which is always reached from a list. */
    back: 'Natrag',
    /** The screen title in the header: the person, not the word "profil". */
    title: (nickname: string) => nickname,
  },

  /** The "Više" tab: everything that is not an evening (#457). */
  more: {
    stats: 'Statistika sezone',
    /** The walkthrough, replayable from here (#457). */
    onboarding: 'Dobrodošlica',
    notifications: 'Obavijesti',
    calendar: 'Kalendar izvedbi',
    profile: 'Moji podaci',
    nickname: 'Nadimak',
    roles: 'Uloge',
    mobile: 'Mobitel',
    missing: 'nije upisano',
    /**
     * The four rows of the person's own card (#569, Q20), in the order they are
     * needed: who am I, what happened, how do I get in, who do I ask.
     */
    accountRow: 'Profil',
    security: 'Sigurnost',
    support: 'Podrška',
    /** A login several people hold, said on the header rather than implied. */
    shared: 'Dijeljeni račun',
    /**
     * The groups under the person: their screens by workspace, then the app
     * itself. The screens' own headings are `GROUP_LABEL` (`app/screens.ts`),
     * the same words the laptop sidebar uses, so "Ekrani" no longer names
     * anything (#627, Q22).
     */
    appTitle: 'Aplikacija',
    /** The install guide as a row; the guide's own title names the platform. */
    install: 'Instalacija',
    /**
     * The foot of the screen: which build is this, and who to blame for it.
     *
     * The credit is deliberately in English and deliberately tiny: it is a
     * signature, not a sentence anybody reads, and it says the same thing on
     * every build. It is the one English string on a Croatian-only screen and
     * it stays that way by decision (#637), so a later reader does not "fix" it.
     */
    createdBy: 'Created by: Josip Ivančević',
    /**
     * Tapping the build line copies it (#637). The sha is not a thing to read
     * out loud, so the clipboard and the Podrška mail are the two ways it
     * travels. The whole line is copied rather than the bare sha: pasted into an
     * SMS on its own, `ad0eb9c` reads as a typo.
     */
    buildCopy: 'Kopiraj oznaku builda',
    buildCopied: 'Kopirano',
    /** `navigator.clipboard` can be refused; the failure is not silent. */
    buildCopyFailed: 'Kopiranje nije uspjelo. Označi redak i kopiraj ručno.',
    /* The raw Payload UI is the **Backoffice** and never "administracija"
       (ADR-0027): Cecilija is what everyone else works in, and only a `dev`
       holder is offered this row at all. */
    admin: 'Backoffice',
  },

  /**
   * The date vocabulary the list needs beside `formatPerformanceDate`: month
   * names in the NOMINATIVE for a heading ("Rujan", not "rujna"), plus the short
   * forms of the month and the weekday for the date tile and the bar chart.
   */
  date: {
    months: [
      'Siječanj',
      'Veljača',
      'Ožujak',
      'Travanj',
      'Svibanj',
      'Lipanj',
      'Srpanj',
      'Kolovoz',
      'Rujan',
      'Listopad',
      'Studeni',
      'Prosinac',
    ],
    monthsShort: [
      'sij',
      'velj',
      'ožu',
      'tra',
      'svi',
      'lip',
      'srp',
      'kol',
      'ruj',
      'lis',
      'stu',
      'pro',
    ],
    weekdaysShort: ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'],
  },

  card: {
    cancelled: 'Otkazano',
    noteLabel: 'Voditelj',
  },

  /**
   * The two buttons and everything that can go wrong around them (#422).
   *
   * `locked` and `cancelled` are ONE sentence each, shared by the card, the
   * detail view and the answer route's refusal: a dancer who taps a locked
   * button and a dancer whose POST is refused are in the same situation, and
   * two wordings for it would only look like two different rules.
   *
   * Every reader of these is answering for a dancer, so they say "nastup"
   * (#565): the hero's lock note on Moreška and the 403 the route sends back
   * are the same sentence, and a person who reads "Izvedba je otkazana" one
   * tab away is reading the blagajna's screen, where that IS the word.
   */
  answer: {
    coming: 'Dolazim',
    notComing: 'Ne dolazim',
    clear: 'Poništi',
    /**
     * What an already-filled circle on the month list does when it is tapped
     * again (#624): it is only ever read out loud, because the control is two
     * circles and the un-tap is the same circle a second time.
     *
     * Not the same word as `clear` above, and the difference is the point.
     * `clear` is the voditelj's "obriši odgovor" on the person sheet: this
     * answer was never given. This is the dancer taking their own answer back,
     * which after ten minutes is an odustajanje the voditelj sees.
     */
    undo: 'Poništi odgovor',
    locked: 'Nastup je počeo, odgovori se više ne mijenjaju.',
    cancelled: 'Nastup je otkazan.',
    failed: 'Odgovor nije spremljen. Pokušaj ponovno.',
    saving: 'Spremam...',
  },

  /**
   * The performance detail and the voditelj's headcount (#423, redesigned in
   * #457 into three segments).
   *
   * The segment labels are also the three `?dio=` values, read off one object,
   * so a link into a segment and the word on its tab can never drift apart.
   * No push sends such a link yet; the parameter is reserved for one.
   */
  detail: {
    back: 'Izvedbe',
    note: 'Poruka voditelja',
    crni: 'Crni',
    bili: 'Bili',
    bula: 'Bule',
    notComing: 'Ne dolaze',
    noAnswer: 'Bez odgovora',
    call: 'Nazovi',
    move: 'Prebaci',
    /**
     * "Prebaci u bile" (#581 review).
     *
     * The armies are common nouns and the phrase wants the ACCUSATIVE PLURAL,
     * so neither "Bili" (the heading's nominative) nor a capital survives here:
     * the word is not at the start of a sentence. It takes the army ITSELF
     * rather than a label, so the two surfaces that offer the move, Stanje's
     * person sheet and the old `ArmyMoveButton`, cannot decline it two ways.
     */
    moveTo: (army: 'crni' | 'bili') => (army === 'crni' ? 'Prebaci u crne' : 'Prebaci u bile'),
    missing: 'Ta izvedba ne postoji.',
    /** What the segmented control IS, for a screen reader announcing the tablist. */
    segmentsLabel: 'Dijelovi izvedbe',
    /** The three segments (#457). */
    segments: {
      dolaze: 'Dolaze',
      postava: 'Postava',
      ulaznice: 'Ulaznice',
    },
    /** A counter with nothing to count: a dash, never a zero that means "none". */
    noCount: '–',
    /** One muted line under an empty group heading. */
    nobody: 'nitko',
    /** The one empty group that is good news. */
    allAnswered: 'Svi su odgovorili',
    noAnswersTitle: 'Još nitko nije odgovorio',
    noAnswersBody: 'Odgovori prvi, ostali vide tko dolazi.',
    callAria: (nickname: string) => `Nazovi ${nickname}`,
  },

  /** The voditelj's tools, gathered at the bottom of the detail page (#457). */
  lead: {
    title: 'Alati za voditelja',
    lineupConfirmed: (inLineup: number) => `Postava: potvrđena, ${inLineup} u postavi`,
    lineupDraft: (coming: number, noAnswer: number) =>
      `Postava: nije potvrđena, ${coming} dolazi, ${noAnswer} bez odgovora`,
  },

  /**
   * Dodaj / Uredi / Otkaži an izvedba (#503).
   *
   * The refusals that a route also speaks are one sentence each, the way the
   * answer and comp sections do it: a control that is not offered and a POST
   * that is refused are the same rule, and two wordings would read as two.
   *
   * `publicRow` is the one a voditelj is most likely to meet, so it says what
   * to do rather than what went wrong. Cancelling a Redovna refunds every
   * buyer and mails them (#497), which is the blagajna's action and not a
   * harder version of this one.
   */
  performance: {
    add: 'Dodaj izvedbu',
    addTitle: 'Nova izvedba',
    adding: 'Dodajem...',
    added: 'Izvedba je dodana.',
    close: 'Odustani',
    kind: 'Vrsta',
    date: 'Datum',
    time: 'Vrijeme',
    location: 'Mjesto',
    locationPlaceholder: 'npr. Luka ili Sv. Justina',
    client: 'Naručitelj',
    clientPlaceholder: 'npr. Le Ponant',
    clientOptional: 'nije obavezno',
    edit: 'Uredi izvedbu',
    editTitle: 'Podaci o izvedbi',
    save: 'Spremi izmjene',
    saving: 'Spremam...',
    saved: 'Izmjene su spremljene.',
    cancelAction: 'Otkaži izvedbu',
    cancelling: 'Otkazujem...',
    cancelConfirm: 'Otkazati ovu izvedbu? Moreškanti dobivaju obavijest.',
    /** The second tap. Not a browser dialog: this is a phone, and one is a wall. */
    cancelYes: 'Da, otkaži',
    cancelNo: 'Ne',
    cancelled: 'Izvedba je otkazana.',
    /**
     * A cancelled booking, in one sentence for both halves of it.
     *
     * Cancelling again is a no-op the route answers 200 to, but EDITING is
     * refused with a 409: moving a cancelled evening would push "premještena"
     * at a roster that has been told it is off. So the tools card drops both
     * controls and says this instead, naming the way forward rather than the
     * rule.
     */
    cancelledNotEditable:
      'Izvedba je otkazana, pa se više ne mijenja. Ako se ipak održava, dodaj novu izvedbu.',
    publicRow:
      'Ovo je javna izvedba. Njezin datum, mjesto i otkazivanje vodi blagajna, jer o tome ovise prodane ulaznice.',
    /**
     * The one refusal Dodaj and Uredi have left (#567, Q53).
     *
     * Both halves of Izvedbe may now enter and correct both kinds of evening,
     * so the two sentences that told each half off the other's row are gone
     * (#502's `publicNeedsTickets` and `nonPublicNeedsMoreska`). What remains
     * is the caller who holds neither word and has no business on this screen
     * at all — the route's own gate answers that first, so this is the
     * handler's backstop rather than something a reader meets.
     *
     * It names the SCREEN rather than a permission: `tickets` and `moreska` are
     * words from the codebase.
     */
    needsIzvedbe: 'Izvedbe unose blagajna i voditelj.',
    /** The blagajna's own fields on a public evening (#502). */
    venue: 'Mjesto',
    isPublic: 'Javna izvedba, prodaje ulaznice',
    notPublicNoSales: 'Ova izvedba ne prodaje ulaznice, pa nema što pauzirati.',
    /**
     * The one field Uredi will not change once a ticket exists (#502 review).
     *
     * Moving a sold evening to another house is a thing every buyer has to
     * hear about: *Preseli u zimsko* mails them and stamps `venue_changed_at`,
     * and a quiet edit of the same column would move the room, tell nobody, and
     * then hide the button that would have told them. So the edit is refused
     * while there are seats sold, and offered on an evening that has none.
     */
    venueLocked:
      'Ova izvedba ima prodane ulaznice, pa se mjesto mijenja radnjom "Preseli u zimsko", koja o tome obavijesti kupce.',
    missing: 'Ta izvedba ne postoji.',
    failed: 'Izvedba nije spremljena. Pokušaj ponovno.',
    rejected: 'Zahtjev nije prihvaćen. Pokušaj ponovno iz aplikacije.',
  },

  /**
   * The two army thresholds of one evening (#408, #503).
   *
   * A stepper and never a native number input: on a phone that control is a
   * tiny spinner next to a keyboard that opens over the page, and the answer is
   * always a small whole number.
   */
  thresholds: {
    title: 'Pragovi',
    hint: 'Najmanji broj crnih i bilih za ovu izvedbu. Ispod praga brojka pocrveni.',
    save: 'Spremi pragove',
    saving: 'Spremam...',
    saved: 'Pragovi su spremljeni.',
    outOfRange: (max: number) => `Prag mora biti cijeli broj između 0 i ${max}.`,
    failed: 'Pragovi nisu spremljeni. Pokušaj ponovno.',
  },

  /**
   * The invitation a voditelj sends and the two pages it leads to (#424).
   *
   * The four refusals are the four things a voditelj can fix themselves on the
   * Member form, so each one names the field rather than the rule.
   */
  invite: {
    action: 'Pošalji pozivnicu',
    sending: 'Šaljem...',
    missingMember: 'Taj član ne postoji.',
    notMoreskant: 'Član nije označen kao moreškant. Označi ga i spremi, pa pošalji pozivnicu.',
    notActive: 'Član nije aktivan.',
    noEmail: 'Član nema e-mail adresu. Upiši je i spremi, pa pošalji pozivnicu.',
    createFailed:
      'Račun nije stvoren: adresa ili korisničko ime već postoje. Provjeri podatke i pokušaj ponovno.',
    sendFailed: 'Prijava je otvorena, ali pozivnica nije poslana. Pokušaj ponovno.',
    baseUrlMissing: 'Poveznica se ne može izraditi jer aplikacija nije ispravno postavljena.',
    tokenFailed: 'Poveznica se ne može izraditi. Pokušaj ponovno.',
    /**
     * The takeover guard (#462 review): the Member's login is not a dancer's.
     * It names no permission and no account, because the presser does not need
     * to know whose login it is, only that this is not the way to reset it.
     */
    staffLogin:
      'Prijava tog člana ima šire dozvole od moreškanta, pa pozivnica nije poslana. Lozinku za takav račun postavlja administrator.',
    sentNew: 'Pozivnica je poslana i prijava je otvorena.',
    sentAgain: 'Nova poveznica je poslana na e-mail člana.',
    unexpected: 'Slanje trenutno nije moguće. Pokušaj ponovno.',
    /** The Members list column: does this member already have a login? */
    hasLogin: 'Ima prijavu',
  },

  /**
   * "Pošalji pozivnice svima" on the Members LIST (#462).
   *
   * The per-row action leaves a voditelj to work out who is still missing by
   * reading the "Ima prijavu" column, which is a job for the machine. This one
   * sends to everyone eligible and then says what it did per outcome, because
   * "poslano 9" alone hides the three dancers whose row has no e-mail and who
   * are exactly the ones that still need a hand.
   */
  inviteAll: {
    action: 'Pošalji pozivnice svima',
    sending: 'Šaljem...',
    /** Nothing to do, which is the good ending and not an error. */
    none: 'Svi aktivni moreškanti s e-mailom već imaju prijavu.',
    sent: (count: number) => `Poslano pozivnica: ${count}.`,
    /**
     * The two bad outcomes NAME the dancers rather than counting them: a
     * voditelj can only act on a name. The failed ones especially, because a
     * failed send still leaves a login behind, so the next bulk press skips
     * them and only the per-row "Pošalji pozivnicu" will reach them.
     */
    noEmail: (who: string) => `Bez e-maila: ${who}.`,
    failed: (who: string) => `Nije poslano: ${who}. Pošalji im pojedinačno.`,
    andMore: (count: number) => `i još ${count}`,
    unexpected: 'Slanje trenutno nije moguće. Pokušaj ponovno.',
  },

  /**
   * Članovi (#511): the voditelj's roster screen, and the profile behind a row.
   *
   * Everything here is aimed at a voditelj holding a phone at a rehearsal, so
   * the list says one fact per dancer and every refusal names what to do rather
   * than which rule was broken. The invitation words are NOT here: they are
   * `inviteLink` and `inviteAll`, unchanged, because the same invitation is the
   * same invitation wherever it is handed over from.
   */
  members: {
    /** The list */
    searchLabel: 'Traži moreškanta',
    searchPlaceholder: 'Nadimak ili ime',
    /**
     * The three Croatian plural buckets, as every other count on `/app` spells
     * them: `pluralize` picks between them (`roster-loaders.ts`), so 22 reads
     * "22 moreškanta" and 12 reads "12 moreškanata" without this screen owning
     * a rule of its own.
     */
    count: { one: 'moreškant', few: 'moreškanta', many: 'moreškanata' },
    empty: 'Nema moreškanta po tom upitu.',
    emptyAll: 'Još nema nijednog moreškanta na popisu.',
    listTitle: 'Moreškanti',
    hasLogin: 'ima prijavu',
    noLogin: 'bez prijave',
    retired: 'neaktivan',
    /**
     * The three chips over the list (#573). The keys are `MemberFilter`, and
     * `satisfies` is what stops a fourth chip shipping without its Croatian.
     */
    filters: {
      all: 'Svi',
      active: 'Aktivni',
      'no-login': 'Bez prijave',
    } satisfies Record<MemberFilter, string>,
    filtersLabel: 'Filtar popisa',
    /** The header icon: everything about letting somebody in, in one sheet. */
    invitations: 'Pozivnice',
    invitationsBody:
      'Kod za probu, zahtjevi koji čekaju odobrenje i pozivnica e-mailom za sve koji je još nemaju.',
    invitationsClose: 'Zatvori',
    /** The per-row disclosure the two invitation channels sit behind. */
    invite: 'Pozivnica',
    /** The way back from a profile. */
    back: 'Članovi',

    /** The profile */
    profileTitle: 'Podaci moreškanta',
    profileIntro: 'Nadimak, mobitel i uloge mijenja voditelj. Ime i bilješku mijenja blagajna.',
    nickname: 'Nadimak',
    name: 'Ime i prezime',
    mobile: 'Mobitel',
    mobileHint: 'Na taj broj ide pozivnica SMS-om. Vidljiv je ostalim moreškantima.',
    email: 'E-mail',
    emailHint: 'Nije obavezan. Koristi se samo za pozivnicu i nikad se ne prikazuje drugima.',
    roles: 'Plesne uloge',
    primaryRole: 'Glavna uloga',
    active: 'Aktivan moreškant',
    activeHint:
      'Neaktivan moreškant ostaje u povijesti i na dnu popisa, ali ispada iz postave i s popisa dolazaka.',
    yearRound: 'Cijelu godinu u Korčuli',
    yearRoundHint:
      'U predsezoni i postsezoni mogu plesati samo moreškanti koji su cijelu godinu u Korčuli.',
    save: 'Spremi',
    saving: 'Spremam...',
    saved: 'Spremljeno.',
    saveFailed: 'Nije spremljeno. Pokušaj ponovno.',

    /** "Dodaj plesača" */
    addTitle: 'Dodaj plesača',
    addIntro:
      'Za moreškanta koji nije na popisu. Upiši ime, nadimak i uloge; pozivnicu mu pošalji poslije s popisa.',
    addOpen: 'Dodaj plesača',
    addSubmit: 'Dodaj',
    addCancel: 'Odustani',
    adding: 'Dodajem...',
    added: (who: string) => `${who} je na popisu.`,

    /** Refusals, each of them also spoken by the route. */
    rejected: 'Spremanje trenutno nije moguće. Pokušaj ponovno iz aplikacije.',
    notFound: 'Taj moreškant ne postoji.',
    nothingToSave: 'Nema promjena za spremiti.',
    invalidBody: 'Podaci nisu ispravni.',
    lockedField: 'Ime i bilješku mijenja blagajna, ne voditelj.',
    badMobile: 'Mobitel nije u ispravnom obliku. Upiši ga kao 0912345678 ili +385912345678.',
    badEmail: 'E-mail nije u ispravnom obliku.',
    missingName: 'Upiši ime i prezime.',
  },

  /**
   * "Kopiraj pozivnicu" (#463): the invitation a voditelj sends themselves.
   *
   * Seventy-six moreškanti, one e-mail address between them, so the letter was
   * never going to be the way most of the roster got in. This is the same
   * invitation handed over by phone, and every sentence here is aimed at the
   * voditelj holding it, not at the dancer receiving it.
   */
  inviteLink: {
    title: 'Pozivnice',
    /** The second half of the screen: the roster, one invitation at a time. */
    listTitle: 'Pošalji pozivnicu',
    intro:
      'Kopiraj pozivnicu i pošalji je SMS-om. Poveznica prijavljuje moreškanta bez lozinke i vrijedi 7 dana.',
    /** The one sentence that decides whether the app can be installed at all. */
    channelHint:
      'Šalji SMS-om. WhatsApp i Viber otvaraju poveznicu u svom pregledniku, gdje se aplikacija ne može dodati na zaslon.',
    action: 'Kopiraj pozivnicu',
    working: 'Pripremam...',
    copy: 'Kopiraj',
    copied: (name: string) => `Pozivnica za ${name} je kopirana. Pošalji je SMS-om.`,
    /** The clipboard is refused in more browsers than one expects; show the text. */
    copyFailed: 'Kopiranje nije uspjelo. Označi poruku i kopiraj je ručno.',
    copiedShort: 'Kopirano',
    sms: 'SMS',
    whatsapp: 'WhatsApp',
    noMobile: 'nema mobitel',
    empty: 'Svi aktivni moreškanti već imaju prijavu.',
    /** The ones already in, kept on the list because re-sending is the fix. */
    joined: (count: number) => `Već imaju prijavu (${count})`,
    failed: 'Pozivnica nije izrađena. Pokušaj ponovno.',
    /** The message itself, as it lands in the dancer's inbox. */
    message: (greeting: string, link: string) =>
      `${greeting ? `Bok ${greeting}, ` : 'Bok, '}ovo je tvoja pozivnica za Ceciliju, gdje se vidi raspored izvedbi i javlja dolazak: ${link} Otvori poveznicu i odmah si prijavljen, bez lozinke. Vrijedi 7 dana.`,
  },

  /**
   * The rehearsal join code (#463): `/app/join/<kod>` and the voditelj's half.
   *
   * The dancer's side of this screen is read by somebody who has never used the
   * app, standing in a hall, on a phone somebody else may be holding. So it
   * says what will happen before it happens ("javit ćemo voditelju"), and every
   * dead end names the person to ask rather than the rule that was broken.
   */
  join: {
    title: 'Pridruži se',
    intro: 'Odaberi svoje ime s popisa. Voditelj će potvrditi i aplikacija se otvara.',
    /** The code is dead or was never real: the voditelj has a new one. */
    badCode: 'Kod nije ispravan ili je istekao. Zatraži novi od voditelja.',
    badMember: 'Taj član nije na popisu aktivnih moreškanata.',
    alreadyHasLogin: 'Taj moreškant već ima prijavu. Zatraži poveznicu od voditelja.',
    alreadyPending:
      'Zahtjev za tog moreškanta već čeka potvrdu. Ako to nisi ti, reci voditelju da ga odbije.',
    throttled: 'Previše pokušaja. Pričekaj malo pa probaj ponovno.',
    empty: 'Svi aktivni moreškanti već imaju prijavu.',
    loading: 'Trenutak...',
    /** The wait, which is the screen a dancer actually sits on. */
    waiting: 'Javili smo voditelju. Čekaj potvrdu, ne zatvaraj ovu stranicu.',
    /**
     * The pairing number (#463 review). The voditelj taps a NAME, and a name is
     * what anybody holding the code can also tap; this is how the person in
     * front of them proves the waiting phone is theirs.
     */
    pairingLabel: 'Reci voditelju ovaj broj:',
    approved: 'Potvrđeno. Otvaram aplikaciju...',
    rejected: 'Zahtjev nije potvrđen. Javi se voditelju.',
    expired: 'Zahtjev je istekao. Odaberi svoje ime ponovno.',
    unexpected: 'Trenutno nije moguće. Pokušaj ponovno.',

    /** The voditelj's half, on Članovi (`/app/members`, #511). */
    codeTitle: 'Kod za probu',
    codeIntro:
      'Pokaži ovaj QR ili kod na probi. Moreškant odabere svoje ime, ti potvrdiš i ulazi bez lozinke.',
    codeNone: 'Nema aktivnog koda.',
    codeCreate: 'Napravi kod',
    codeRotate: 'Novi kod',
    codeWorking: 'Radim...',
    codeValid: (until: string) => `Vrijedi do ${until}`,
    codeFailed: 'Kod nije napravljen. Pokušaj ponovno.',
    /** Rotating kills the old one, which is the point: say so before the tap. */
    rotateHint: 'Novi kod poništava stari, pa stara slika QR-a više ne vrijedi.',
    pendingTitle: 'Čekaju potvrdu',
    /** Shown beside the name: it must match the number on the dancer's screen. */
    pairingCheck: (code: string) => `broj ${code}`,
    pairingHint: 'Potvrdi tek kad ti moreškant pročita isti broj koji piše uz njegovo ime.',
    pendingNone: 'Nema zahtjeva.',
    approve: 'Potvrdi',
    reject: 'Odbij',
    deciding: 'Šaljem...',
    badClaim: 'Taj zahtjev ne postoji.',
    decided: 'O tom zahtjevu je već odlučeno.',
    claimExpired: 'Zahtjev je istekao. Neka moreškant odabere svoje ime ponovno.',
    loginFailed: 'Prijava nije otvorena. Pokušaj ponovno.',
    approveFailed:
      'Prijava je otvorena, ali zahtjev nije potvrđen. Pošalji mu pozivnicu s popisa ispod.',
    decideFailed: 'Nije uspjelo. Pokušaj ponovno.',
  },

  /**
   * "Poveži svoj račun s članom" (#462).
   *
   * A voditelj who also dances has no way to fill `Users.member` in: the field
   * is locked to a `users` holder for read and write, deliberately, and without
   * it they cannot answer their own dolazak or appear in a postava. This screen
   * is the narrow way through, and every sentence it can say is also said by
   * the route, so a refused tap and a hidden line read as one rule.
   */
  linkSelf: {
    title: 'Poveži svoj račun s članom',
    intro:
      'Odaberi sebe s popisa i moći ćeš javljati svoj dolazak i biti u postavi. Na popisu su aktivni moreškanti koji još nemaju prijavu.',
    /** The quiet way in, from the hero and from the Više tab. */
    action: 'Poveži svoj račun s članom',
    linking: 'Povezujem...',
    linked: 'Račun je povezan.',
    empty: 'Svi aktivni moreškanti već imaju prijavu. Javi drugom voditelju da te poveže.',
    /** Refusals, each of them also spoken by the route. */
    rejected: 'Povezivanje trenutno nije moguće. Pokušaj ponovno iz aplikacije.',
    missingMember: 'Odaberi člana s popisa.',
    notFound: 'Taj član ne postoji.',
    notMoreskant: 'Taj član nije označen kao moreškant.',
    notActive: 'Taj član nije aktivan.',
    taken: 'Taj član već ima prijavu. Ako je tvoja, prijavi se njome.',
    /**
     * The one refusal that is not a data problem: repointing an existing link
     * stays administration, because a self-edit path that can move a link is
     * what the field lock exists to prevent.
     */
    alreadyLinked: 'Tvoj račun je već povezan s članom. Promjenu radi administrator.',
    /** A login several people share is nobody in particular (ADR-0022). */
    sharedAccount:
      'Ovu prijavu koristi više osoba, pa se ne može povezati s jednim moreškantom. Zatraži vlastitu prijavu.',
    failed: 'Povezivanje nije uspjelo. Pokušaj ponovno.',
  },

  /**
   * Choosing a password (#424, rewritten in #463).
   *
   * It is no longer the end of a mail: the link signs the dancer in, so this is
   * a row in Više they open when they want a password and never if they do not.
   * That is why the intro says what a password BUYS rather than asking for one:
   * on a phone that stays signed in for thirty days, a dancer who sets none is
   * not neglecting anything.
   */
  setPassword: {
    title: 'Postavi lozinku',
    intro:
      'Lozinka nije obavezna: u aplikaciju uvijek možeš ući poveznicom koju ti pošaljemo. Postavi je ako se želiš prijavljivati bez čekanja poruke.',
    password: 'Nova lozinka',
    repeat: 'Ponovi lozinku',
    submit: 'Spremi lozinku',
    submitting: 'Spremam...',
    tooShort: 'Lozinka mora imati barem 8 znakova.',
    mismatch: 'Lozinke se ne podudaraju.',
    saved: 'Lozinka je spremljena.',
    /** ADR-0022 again: one holder of a shared login may not rotate it. */
    sharedAccount:
      'Ovu prijavu koristi više osoba, pa lozinku mijenja administrator.',
    unexpected: 'Spremanje trenutno nije moguće. Pokušaj ponovno.',
  },

  /**
   * "Pošalji mi link za prijavu": one answer, whatever was typed (#424, #463).
   *
   * The route and the URL are still the "zaboravljena lozinka" ones, because
   * the token and the silence are the same; only what arrives changed. A
   * password is no longer the thing being recovered, so neither is the wording.
   */
  forgot: {
    title: 'Prijava poveznicom',
    link: 'Pošalji mi link za prijavu',
    intro:
      'Upiši svoj e-mail ili korisničko ime. Ako račun ima e-mail, poslat ćemo poveznicu koja te odmah prijavljuje.',
    identifier: 'E-mail ili korisničko ime',
    submit: 'Pošalji poveznicu',
    submitting: 'Šaljem...',
    missing: 'Upiši e-mail ili korisničko ime.',
    /** The SAME sentence for a hit and a miss: no account enumeration. */
    sent: 'Ako račun postoji, poveznica je poslana na e-mail te osobe.',
    /**
     * The dancer with no e-mail on their Member row is the reason #463 exists,
     * and this screen is where they would otherwise wait for a letter nobody
     * can send. It names the way out instead of apologising.
     */
    noEmailHint: 'Nemaš e-mail kod nas? Zatraži poveznicu od voditelja.',
    unexpected: 'Slanje trenutno nije moguće. Pokušaj ponovno.',
    backToLogin: 'Natrag na prijavu',
  },

  /**
   * The Dobrodošlica (#457, glossary: *Dobrodošlica*).
   *
   * Three steps, and each one asks for a permission or a subscription the app
   * cannot grant itself, so every step says WHAT IT BUYS before it asks: the
   * notification step names the three things that will ring rather than
   * promising "obavijesti", because a dancer who does not know what will ring
   * says no. Every step can be refused and refusing is not a failure, which is
   * why the quiet link is "Ne sada" and never "Odustani".
   */
  onboarding: {
    skip: 'Preskoči',
    step: (index: number, total: number) => `Korak ${index} od ${total}`,

    /**
     * Step 1 IS the #455 install guide: the numbered steps themselves live in
     * `install.iosSteps` / `androidSteps` / `desktopSteps` and are rendered by
     * the same `InstallSteps` component as the banner and `/app/install`,
     * so there is one set of instructions in the app rather than two that can
     * disagree. Only the frame around them is written here.
     */
    install: {
      title: 'Dodaj Ceciliju na početni zaslon',
      body: 'Otvara se kao aplikacija, bez adresne trake, i može ti slati obavijesti.',
      /** The quiet way to the full-screen guide, which is also the QR target. */
      guide: 'Detaljne upute',
      primary: 'Dodao sam',
      later: 'Kasnije',
    },

    push: {
      title: 'Uključi obavijesti',
      body: 'Javljamo samo kad se nešto tiče tebe. Bez reklama, bez podsjetnika svaki dan.',
      /**
       * The fake notification. It is the T-48h ANSWER REMINDER, type (2) of the
       * glossary's *Notification types*, and not an invented one: confirming a
       * postava deliberately rings nobody, so a sample "postava je potvrđena"
       * would promise a push that does not exist.
       */
      sampleTitle: 'Cecilija',
      sampleBody: 'Četvrtak u 21:00, Ljetno kino. Još nisi odgovorio dolaziš li.',
      sampleWhen: 'prije 2 min',
      benefitLineup: 'Podsjetnik za odgovor',
      benefitAlarm: 'Alarm od voditelja',
      benefitChange: 'Promjena mjesta ili sata',
      primary: 'Uključi obavijesti',
      working: 'Uključujem...',
      on: 'Obavijesti su uključene',
      skip: 'Ne sada',
    },

    calendar: {
      title: 'Izvedbe u tvom kalendaru',
      body: 'Pretplata se sama osvježava kad se raspored promijeni. Radi u Apple i Google kalendaru.',
      /**
       * Only off iOS (#457 review). There the link goes on the clipboard, and a
       * clipboard with no instructions is a dancer holding a URL they have
       * nowhere to put, so the sentence names the three taps in Google kalendar.
       */
      googleHint: 'U Google kalendaru: Postavke, Dodaj kalendar, Putem URL-a.',
      cardTitle: 'Kalendar izvedbi',
      cardBody: 'Sve izvedbe sezone, javne i privatne, s bilješkom voditelja.',
      primary: 'Pretplati se na kalendar',
      copy: 'Kopiraj link',
      copied: 'Link kopiran',
      /** After the handoff: the step waits, it never scrolls on by itself. */
      next: 'Dalje',
      skip: 'Ne sada',
    },

    done: {
      title: 'Spremno',
      next: (date: string) => `Sljedeća izvedba je ${date}. Reci nam dolaziš li.`,
      nothing: 'Vidimo se na prvoj izvedbi sezone.',
      primary: 'Na izvedbe',
    },
  },

  /**
   * Installation (#421, rewritten in #455).
   *
   * One sentence of generic advice used to serve every device. It could not:
   * the wording that helps an iPhone ("izbornik dijeljenja") is wrong on
   * Android, both are wrong inside Viber's webview, and on Android the whole
   * thing is a single button. So the copy is per platform, and the steps are
   * numbered because a person holding the phone is following along rather than
   * reading.
   *
   * The menu entries are quoted in Croatian AND English: a phone bought here is
   * as likely to be in one as the other, and "Add to Home Screen" is the string
   * most of them will actually see.
   */
  install: {
    title: 'Dodaj Ceciliju na ekran',
    why: 'S ikonom na ekranu dobivaš obavijesti o izvedbama i raspored u jednom dodiru.',
    snooze: 'Kasnije',
    /**
     * The Početna offer's way on (#616), where the browser gives no one-tap
     * install to run: an iPhone, or a webview that has to be left first. It
     * opens the same full-screen guide the rehearsal QR points at.
     */
    nudgeGuide: 'Upute za instalaciju',
    /** The full-screen guide at `/app/install`, also the QR target. */
    guideTitle: 'Instalacija',
    guideIntro: 'Tri koraka i Cecilija je na ekranu kao svaka druga aplikacija.',
    guideDone: 'Kad završiš, otvori raspored.',
    guideOpenApp: 'Otvori raspored',
    /** A voditelj showing somebody else's phone needs the other instructions. */
    otherDevice: 'Upute za drugi uređaj',
    deviceIphone: 'iPhone',
    deviceAndroid: 'Android',
    deviceDesktop: 'Računalo',

    iosSteps: [
      'Dodirni ikonu dijeljenja, kvadratić sa strelicom prema gore. Na iPhoneu je u donjoj traci, na iPadu gore desno.',
      'Pomakni popis prema dolje i odaberi "Dodaj na početni zaslon", na engleskom "Add to Home Screen".',
      'Potvrdi s "Dodaj" i ikona Cecilija je na ekranu.',
    ],
    androidSteps: [
      'Dodirni tri točkice gore desno.',
      'Odaberi "Instaliraj aplikaciju" ili "Dodaj na početni zaslon".',
      'Potvrdi i ikona je na ekranu.',
    ],
    desktopSteps: [
      'U adresnoj traci dodirni ikonu za instalaciju, monitor sa strelicom prema dolje.',
      'Potvrdi "Instaliraj".',
    ],
    /** Chromium only: one tap instead of the three steps above. */
    action: 'Instaliraj',
    acting: 'Instaliram...',
    failed: 'Instalacija nije uspjela. Probaj kroz izbornik preglednika.',
    installedTitle: 'Cecilija je instalirana.',

    /**
     * The webview dead end, and the reason this rewrite exists (#455): a link
     * that travels through Viber or WhatsApp opens in THEIR browser, whose
     * share sheet has no "add to home screen" at any scroll position. Telling
     * that person to look for it is the single most common way the install
     * fails, so they get the way out instead.
     */
    inappTitle: 'Otvori u pregledniku',
    inappBody:
      'Otvorio si Ceciliju unutar druge aplikacije, a odatle se ikona ne može dodati na ekran.',
    inappIos: 'Dodirni izbornik ove aplikacije, tri točkice ili strelicu, pa "Otvori u Safariju".',
    inappAndroid: 'Dodirni tri točkice pa "Otvori u pregledniku" ili "Otvori u Chromeu".',
    inappCopy: 'Kopiraj link',
    inappCopied: 'Link je kopiran. Zalijepi ga u Safari ili Chrome.',
  },

  /**
   * Push (#431): the banner on `/app`, the per-device switch and the voditelj's
   * manual alarm button.
   *
   * An uninstalled iPhone never reaches these strings: Safari exposes no
   * `PushManager` outside a home screen app, so `decideInstallStep` sends that
   * device to the install copy above instead, and a button that silently does
   * nothing is never rendered (#430, story 2; #455).
   */
  push: {
    title: 'Uključi obavijesti',
    body: 'Javit ćemo ti kad fali ljudi za izvedbu i kad treba javiti dolazak.',
    enable: 'Uključi',
    enabling: 'Uključujem...',
    onTitle: 'Obavijesti su uključene na ovom uređaju.',
    disable: 'Isključi',
    disabling: 'Isključujem...',
    denied: 'Obavijesti su blokirane u postavkama preglednika. Uključi ih tamo pa pokušaj ponovno.',
    failed: 'Uključivanje obavijesti nije uspjelo. Pokušaj ponovno.',
    /** The `/app` POST routes answer with this when the guard refuses. */
    rejected: 'Obavijesti trenutno nije moguće promijeniti.',
    badRequest: 'Podaci o uređaju nisu potpuni.',
    /**
     * Profil's switch (#569, Q49).
     *
     * It says "na ovom uređaju" because that is the truth of it: a subscription
     * belongs to one browser on one phone, so a dancer with a phone and a
     * laptop turns it on twice and a shared `tehnika` tablet answers only for
     * itself.
     */
    switchLabel: 'Obavijesti na ovom uređaju',
    switchOn: 'Javit ćemo ti kad fali ljudi i kad treba javiti dolazak.',
    switchOff: 'Telefon je tih. Uključi i javit ćemo ti kad fali ljudi.',
    /** The three reasons this phone cannot be switched on at all. */
    needsInstall:
      'Da bi iPhone zvonio, prvo dodaj Cecilija na početni zaslon. Upute su u Instalaciji.',
    inapp:
      'Otvorio si aplikaciju unutar druge aplikacije, pa obavijesti nisu moguće. Otvori je u Safariju ili Chromeu.',
    unsupported: 'Ovaj preglednik ne podržava obavijesti.',
  },

  /**
   * Which skin Cecilija wears, on this phone (#569, Q21).
   *
   * Three words rather than a single on/off, because "Kao sustav" is the
   * default and the other two are a deliberate override: a foyer is lit and a
   * backstage corridor is not, and a phone's own setting knows neither.
   */
  theme: {
    title: 'Izgled',
    /** The radiogroup's accessible name; the three words are its options. */
    label: 'Izgled aplikacije',
    light: 'Svijetla',
    dark: 'Tamna',
    system: 'Kao sustav',
    note: 'Vrijedi samo na ovom uređaju.',
  },

  /**
   * Podrška (#569, Q20): the one sentence, and the one address.
   *
   * E-mail only, and never a phone number: the number on the registry is the
   * president's private mobile (CLAUDE.md, #383, #548). Cecilija is a staff
   * tool rather than a buyer-facing surface, but the rule is about the number,
   * not about the audience, so the sheet says what the buyer's block says.
   */
  support: {
    title: 'Podrška',
    body: 'Ako nešto ne radi ili ti treba pomoć oko aplikacije, piši nam. Javljamo se u roku od 24 sata.',
    email: 'info@moreska.eu',
    action: 'Pošalji e-poštu',
    /**
     * What the mail arrives already carrying (#637), so that the first question
     * back — which build, which account — is answered before it is asked.
     * Assembled in `support-mail.ts`; see its header for why the account is in
     * there.
     */
    mailSubject: 'Cecilija: podrška',
    mailIntro: 'Opiši što se dogodilo:',
    mailAccount: 'Račun:',
    mailBuild: 'Build:',
  },

  /** The voditelj's "Pošalji alarm" control on `/app/performances/[id]` (#431). */
  alarm: {
    action: 'Pošalji alarm',
    sending: 'Šaljem...',
    includeNotComing: 'i onima koji ne dolaze',
    /** What the page reports back: how many devices actually rang (story 24). */
    sent: (devices: number) =>
      `Alarm je poslan na ${devices} ${devices === 1 ? 'uređaj' : 'uređaja'}.`,
    noDevices: 'Nitko od njih nema uključene obavijesti, alarm nije poslan.',
    noRecipients: 'Svi su odgovorili, nema kome poslati alarm.',
    cancelled: 'Izvedba je otkazana, alarm se ne šalje.',
    started: 'Izvedba je već počela, alarm se ne šalje.',
    missing: 'Ta izvedba ne postoji.',
    failed: 'Alarm nije poslan. Pokušaj ponovno.',
  },

  /**
   * The voditelj's note, edited from the phone (#436, story 25).
   *
   * The same note the admin form calls "Note from the voditelj": one field, two
   * places to type it, and one hook that notifies the roster either way.
   */
  note: {
    label: 'Poruka voditelja',
    placeholder: 'npr. nađemo se na molu u 9:30',
    save: 'Spremi poruku',
    saving: 'Spremam...',
    saved: 'Poruka je spremljena.',
    missing: 'Ta izvedba ne postoji.',
    failed: 'Poruka nije spremljena. Pokušaj ponovno.',
    tooLong: 'Poruka je predugačka.',
  },

  /**
   * The postava (#432, glossary: *Lineup (postava)*).
   *
   * `locked` is the sentence behind BOTH the read-only editor and the route's
   * 409: a voditelj who taps a dead field and one whose save is refused are in
   * the same situation, and two wordings would look like two rules. The warning
   * line says "spremit će se svejedno" out loud, because story 29 is precisely
   * that an unusual role is recorded rather than refused.
   */
  lineup: {
    title: 'Postava',
    fromAttendance: 'Napravi iz prisutnosti',
    add: 'Dodaj moreškanta',
    addPlaceholder: 'Odaberi moreškanta',
    remove: 'Makni',
    save: 'Spremi postavu',
    saving: 'Spremam...',
    saved: 'Postava je spremljena.',
    confirm: 'Potvrdi',
    confirming: 'Potvrđujem...',
    unlock: 'Otključaj',
    unlocking: 'Otključavam...',
    confirmed: 'Postava je potvrđena.',
    unlocked: 'Postava je otključana.',
    confirmedNote: 'Potvrđena postava. Otključaj je za izmjene.',
    draftNote: 'Postava još nije potvrđena, moreškanti je ne vide.',
    empty: 'Postava je prazna.',
    /** The dancer's Postava segment before the voditelj has locked the list (#457). */
    notConfirmedTitle: 'Postava još nije potvrđena',
    notConfirmedBody: 'Voditelj je slaže na dan izvedbe. Dobit ćeš obavijest.',
    confirmedAt: (when: string) => `Potvrđena ${when}`,
    /** A named role nobody is dancing tonight. */
    unassigned: 'nije dodijeljeno',
    warningSuffix: 'Spremit će se svejedno.',
    nobodyToAdd: 'Svi aktivni moreškanti su već u postavi.',
    /** The route's own refusals. */
    rejected: 'Postavu trenutno nije moguće mijenjati.',
    missing: 'Ta izvedba ne postoji.',
    locked: 'Postava je potvrđena. Otključaj je pa pokušaj ponovno.',
    badConfirm: 'Nejasno je treba li postavu potvrditi ili otključati.',
    confirmEmpty: 'Prazna postava se ne može potvrditi. Dodaj barem jednog moreškanta.',
    /**
     * What follows the sentence naming the missing or doubled title (#566).
     * The rule in one line, so a voditelj reads what is wrong and then why it
     * matters, rather than a rule with no example in front of it.
     */
    confirmTitles: 'Potvrđena postava nosi sve četiri titule, svaku po jednom.',
    /**
     * The same, for the other half of the kind split (#620). An Experience is
     * confirmed by naming who ran it and never by handing out crowns, so the
     * explanation under the complaint has to be the Experience's own rule.
     */
    confirmVoditelj: 'Potvrđeni Moreška Experience ima jednog voditelja.',
    /** A `voditelj` line on an evening that has no such line at all (#620). */
    voditeljKind: 'Voditelja ima samo Moreška Experience.',
    failed: 'Postava nije spremljena. Pokušaj ponovno.',
  },

  /**
   * The season scoreboard (#437, glossary: *Dancer statistics*).
   *
   * Read on Ljestvica by a moreškant about themselves, so it counts "nastupi"
   * (#565): the season screen that counts "izvedbe" is Statistika, whose reader
   * is the blagajna.
   */
  stats: {
    title: 'Statistika',
    season: 'Sezona',
    dancer: 'Moreškant',
    performances: 'Nastupa',
    crniKralj: 'Crni kralj',
    biliKralj: 'Bili kralj',
    otmanovic: 'Otmanović',
    bula: 'Bula',
    byKind: 'Po vrsti nastupa',
    empty: 'U ovoj sezoni još nema potvrđenih postava.',
    noRoster: 'Nema aktivnih moreškanata.',
    hint: 'Broje se samo potvrđene postave. Dodirni redak za razradu po vrsti nastupa.',
  },

  /**
   * Self-issued comps (#434, glossary: *Moreškant comp*).
   *
   * One sentence per refusal, shared by the section a dancer sees and the two
   * routes: a button that is hidden and a POST that is refused are the same
   * rule, and two wordings for it would read as two.
   */
  comp: {
    /**
     * One word for the thing throughout (#457 review): the segment is called
     * "Ulaznice", so every sentence under it says "ulaznica" too. "Karta" was
     * the same object under a second name, which reads as a second rule.
     */
    title: 'Besplatne ulaznice',
    intro: 'Do 4 ulaznice po izvedbi. Stižu ti na e-mail kao PDF, s QR kodom za ulaz.',
    adults: 'Odrasli',
    children: 'Djeca',
    nameLabel: 'Ime na ulaznici',
    namePlaceholder: 'Ime i prezime',
    issue: 'Izdaj ulaznice',
    issuing: 'Izdajem...',
    issued: 'Ulaznice su izdane i poslane na tvoj e-mail.',
    issuedNoEmail: 'Ulaznice su izdane, ali e-mail nije otišao. Javi voditelju.',
    cancel: 'Otkaži',
    cancelling: 'Otkazujem...',
    cancelled: 'Ulaznice su otkazane.',
    /** Refusals, all of them also spoken by the routes. */
    /** The `/app` cross-site guard, in the comp routes' own words. */
    rejected: 'Zahtjev nije prihvaćen. Pokušaj ponovno iz aplikacije.',
    pickOne: 'Odaberi barem jednu ulaznicu.',
    capReached: 'Potrošio si svoje 4 besplatne ulaznice za ovu izvedbu.',
    noMember: 'Tvoja prijava nije povezana s moreškantom, pa ne možeš izdati besplatne ulaznice.',
    noEmail: 'Na tvojem moreškantu nema e-mail adrese, pa ulaznice nemaju kamo. Javi voditelju.',
    notPublic: 'Za ovu izvedbu se ne prodaju ulaznice.',
    showCancelled: 'Izvedba je otkazana.',
    started: 'Izvedba je počela, ulaznice se više ne mijenjaju.',
    soldOut: 'Nema više slobodnih mjesta.',
    scanned: 'Ulaznica je već skenirana, pa se narudžba ne može otkazati.',
    /**
     * The ONE answer to every cancel that is not the caller's own self-issued
     * comp: unknown, paid, an admin's, or another dancer's. Three honest
     * sentences would map the order table for anyone who tried them.
     */
    notFound: 'Ulaznice nisu pronađene.',
    failed: 'Ulaznice nisu izdane. Pokušaj ponovno.',
    cancelFailed: 'Otkazivanje nije uspjelo. Pokušaj ponovno.',
    /**
     * The Ulaznice segment's own words (#457): the big count's caption, the
     * line that replaces the form once the four are gone, and one sentence per
     * reason there is nothing to issue (`compUnavailableReason`).
     */
    headline: 'besplatnih ulaznica za ovu izvedbu',
    allUsed: 'Iskoristio si sve četiri.',
    privateNoTickets: 'Privatna izvedba, nema ulaznica.',
    past: 'Izvedba je prošla.',
    noMemberShort: 'Ulaznice može izdati samo moreškant s povezanim profilom.',
  },

  /**
   * Skener, the door screen (#504, ported from `/admin/scan` and the door
   * dashboard).
   *
   * Croatian, with ONE deliberate exception: `result` below is English,
   * because the card is held up to a guest who has just handed over a phone.
   * Everything the volunteer reads on their own — the ring, the buttons, the
   * search — is Croatian like the rest of the app.
   */
  scan: {
    /** The ring for tonight, and the evening with no ring. */
    admitted: 'ušlo',
    of: 'od',
    noShow: 'Večeras nema izvedbe.',
    noShowBody: 'Skener radi kad je izvedba na rasporedu.',
    /** The dominant button and the scanner overlay around it. */
    open: 'Skeniraj ulaznicu',
    close: 'Zatvori',
    starting: 'Palim kameru...',
    idleTitle: 'Spremno za skeniranje',
    idleBody: 'Dodirni za kameru. Telefon će prvi put pitati za dopuštenje.',
    idleAction: 'Dodirni za skeniranje',
    errorTitle: 'Kamera ne radi',
    errorFallback: 'Kamera nije dostupna.',
    retry: 'Pokušaj ponovno',
    scanMore: 'Skeniraj sljedeću',
    /** The `refunds` holder's one link off the card (#476). */
    openOrder: 'Otvori narudžbu',
    /** Party admit and undo, both spoken on the result card. */
    admitParty: (n: number) => `Pusti ostatak grupe (${n})`,
    admitting: 'Propuštam...',
    admittedParty: (n: number) =>
      n > 0 ? `Propušteno još ${n} iz grupe.` : 'Cijela grupa je već propuštena.',
    admitPartyFailed: 'Propuštanje grupe nije uspjelo.',
    undo: 'Poništi propuštanje',
    undoing: 'Poništavam...',
    undone: 'Propuštanje je poništeno.',
    undoExpired: 'Isteklo je vrijeme za poništavanje (2 minute).',
    /** Pronađi ulaznicu: the manual-admit fallback when a QR will not scan. */
    lookupTitle: 'Pronađi ulaznicu',
    lookupIntro: 'Za večerašnju izvedbu, po kodu, e-pošti ili imenu.',
    modeCode: 'Kod',
    modeEmail: 'E-pošta',
    modeName: 'Ime',
    placeholderCode: 'npr. AB3K',
    placeholderEmail: 'kupac@primjer.com',
    placeholderName: 'Ime Prezime',
    search: 'Traži',
    searching: '...',
    searchFailed: 'Pretraga nije uspjela.',
    notFound: 'Nema narudžbe za ovu izvedbu.',
    ambiguous: (n: number) => `Pronađeno ${n} narudžbi. Suzi pretragu ili upiši kod narudžbe.`,
    admit: 'Pusti',
    back: 'Natrag',
    admitFailed: 'Propuštanje nije uspjelo.',
    noTickets: 'Narudžba nema važećih ulaznica.',
    allAdmitted: 'Svi su propušteni',
    admittedOf: (done: number, all: number) => `${done} / ${all} propušteno`,
    adults: (n: number) => `${n} odraslih`,
    children: (n: number) => `${n} djece`,
    /**
     * The English result card (#476). A guest reads it over the volunteer's
     * shoulder, so these five lines are the one place in Cecilija that is not
     * Croatian; the headings themselves live in `lib/app/scan-screen.ts`.
     */
    result: {
      voided: 'This ticket has been voided',
      voidedRefund: 'This ticket has been voided (refunded).',
      voidedStorno: 'This ticket has been voided (cancelled).',
      unknown: 'This ticket is not recognised.',
      firstScanned: 'First scanned at',
    },
  },

  /**
   * Prodaja, the reseller's sell screen (#505, ported from the Backoffice
   * partner dashboard).
   *
   * The audience is an agency clerk at a desk in Korčula, so the words are the
   * ones on the counter: an "izvedba" is picked, "ulaznice" are issued, and a
   * mistake is "otkazano" even though the mechanism is a storno (ADR-0017: the
   * user-facing verb is otkazati).
   */
  sell: {
    /** The two fail-safe screens: a login with no usable Partner (#476). */
    unlinkedTitle: 'Prijava još nije povezana s partnerom',
    unlinkedBody:
      'Javi se HGD-u Sveta Cecilija da dovrši postavljanje, pa će prodaja proraditi.',
    inactiveTitle: 'Partner je trenutno neaktivan',
    inactiveBody: 'Ovaj partnerski račun više ne prodaje ulaznice. Javi se HGD-u Sveta Cecilija.',
    /** The form. */
    formTitle: 'Nova prodaja',
    show: 'Izvedba',
    seatsLeft: (n: number) => `još ${n}`,
    soldOut: 'rasprodano',
    noShows: 'Trenutno nema izvedbe za prodaju.',
    adults: 'Odrasli',
    children: 'Djeca',
    issue: 'Izdaj ulaznice',
    issuing: 'Izdajem...',
    tooMany: 'Nema toliko slobodnih mjesta.',
    failed: 'Prodaja nije uspjela. Pokušaj ponovno.',
    network: 'Veza je pukla. Pokušaj ponovno.',
    /** The success banner: the PDF opens by itself, this says so. */
    doneTitle: 'Ulaznice su izdane',
    doneBody: (count: number, code: string) => `${count} ulaznica · ${code} · PDF se otvorio`,
    openPdf: 'Otvori PDF ponovno',
    /** Recent orders, and the delete-then-undo cancel (ADR-0017). */
    recentTitle: 'Zadnje prodaje',
    recentNote: 'Prodaju možeš otkazati isti dan.',
    recentEmpty: 'Još nema prodaje.',
    earlier: 'Ranije',
    /** The three hover labels of a sale row: without them it is three numbers. */
    sold: 'Prodano',
    performance: 'Izvedba',
    people: 'Osoba',
    downloadTickets: 'Preuzmi ulaznice',
    cancelOrder: 'Otkaži prodaju',
    cancelTicket: 'Otkaži ulaznicu',
    cancelling: 'Otkazujem...',
    cancelFailed: 'Otkazivanje nije uspjelo. Pokušaj ponovno.',
    orderCancelled: (code: string) => `Prodaja ${code} je otkazana`,
    ticketCancelled: (ref: string) => `Ulaznica ${ref} je otkazana`,
    undo: 'Poništi',
    undoFailed: 'Poništavanje nije uspjelo.',
    undoSeatTaken: 'Mjesto je u međuvremenu prodano, pa se otkazivanje ne može poništiti.',
    statusCancelled: 'otkazano',
    typeAdult: 'odrasli',
    typeChild: 'dijete',
    showMore: 'Prikaži više',
    showLess: 'Prikaži manje',
    loading: 'Učitavam...',
    prevPage: 'Prethodna stranica',
    nextPage: 'Sljedeća stranica',
    /** This month's standing, the same three figures as the month-end statement. */
    monthTitle: 'Ovaj mjesec',
    monthTickets: 'Prodanih ulaznica',
    monthOwed: 'Za uplatiti HGD-u',
    monthCommission: 'Tvoja provizija',
    monthNote: 'Računa se uživo, a mjesečni obračun je na ekranu Obračun.',
  },

  /**
   * Obračun, the reseller's statement screen (#505).
   *
   * Two questions a partner asks between invoices: how the season is going
   * (every izvedba as a bar, theirs in gold), and what one month came to. The
   * month's figures are shown on screen BEFORE the CSV link, because the
   * person reading this is usually holding a phone, where a CSV is not a
   * document one can read.
   */
  statement: {
    seasonTitle: 'Sezona',
    seasonSold: (n: number) => `${n} prodanih ulaznica ove sezone`,
    seasonEmpty: 'Ove sezone još nema prodanih ulaznica.',
    adults: 'Odrasli',
    children: 'Djeca',
    monthlyTitle: 'Mjesečni obračun',
    monthlyIntro: 'Odaberi mjesec i provjeri iznose prije uplate.',
    partner: 'Partner',
    month: 'Mjesec',
    year: 'Godina',
    show: 'Prikaži',
    loading: 'Učitavam...',
    failed: 'Obračun se nije učitao. Pokušaj ponovno.',
    tickets: 'Prodanih ulaznica',
    cancelled: 'Otkazanih',
    /**
     * **One name for one number** (#599). It was *Ukupno naplaćeno* here and
     * *Naplaćeno* on Financije, one line under *Prikupljeni prihod*, which
     * means something else entirely: money the society actually holds. Partner
     * money is not collected revenue and the two must never be summed
     * (ADR-0015). The secretary's own phrase settles it, and the document
     * prints the same words (`STATEMENT_DOC_COPY.gross`).
     */
    gross: 'Vrijednost prodanog',
    commission: (percent: number) => `Provizija (${percent}%)`,
    owed: 'Za uplatu HGD-u',
    perShow: 'Po izvedbama',
    empty: 'U tom mjesecu nema prodaje.',
    downloadPdf: 'Preuzmi PDF',
    downloadCsv: 'Preuzmi tablicu',
    /** The row under the table: what was voided, never a deduction. */
    cancelledLine: (count: number, amount: string) =>
      `Stornirano u razdoblju: ${count} kom., ${amount}`,
    cancelledNote: 'Nije uključeno u iznose iznad.',
    /** The period, spelled as the SALE days it covers. */
    periodLabel: 'Razdoblje',
    periodValue: (label: string) => `prodaja ${label}`,
    noPartners: 'Nema partnera za prikaz.',

    /**
     * **Označi poslanim** (#599): the secretary's stamp, and the moment a
     * live calculation becomes a settlement.
     *
     * The copy carries the consequence rather than hiding it, because the
     * action is not undoable by accident and should not read as a tick: once a
     * month is stamped, its figures stop moving, and changing the partner's
     * commission afterwards leaves it exactly where it was.
     */
    sent: {
      title: 'Slanje partneru',
      idle: 'Ovaj mjesec još nije označen poslanim, pa se iznosi računaju uživo.',
      mark: 'Označi poslanim',
      marking: 'Spremam...',
      unmark: 'Poništi oznaku',
      /** `date` is already a Croatian date and carries its own final dot. */
      stamped: (date: string) => `Poslano ${date}`,
      frozen: 'Iznosi su zamrznuti onakvi kakvi su poslani. Promjena provizije ih više ne mijenja.',
      /** The refusal the route gives, said before the button is pressed too. */
      monthNotOver: 'Obračun se može označiti poslanim tek kad mjesec završi.',
      failed: 'Spremanje nije uspjelo. Pokušaj ponovno.',
      invalid: 'Neispravan zahtjev.',
      rejected: 'Zahtjev je odbijen.',
      noPartner: 'Partner nije pronađen.',
      /** The handover: Cecilija never sends the mail (same rule as Upiti). */
      mailTitle: 'Pošalji e-mailom',
      mailNote: 'Preuzmi PDF, pa ga priloži u poruci koja se otvori. Odgovor tako dolazi na info@.',
      mailOpen: 'Otvori poruku',
      mailNoAddress: 'Partner nema upisanu e-mail adresu za obračun. Dodaj je u Backofficeu.',
      mailFallback: (address: string) => `Adresa obračuna nije upisana, pa se koristi ${address}.`,
      mailSubject: (partner: string, period: string) => `Obračun ${period} - ${partner}`,
      mailBody: (partner: string, period: string, amount: string) =>
        `Poštovani,\n\nu prilogu je obračun prodaje za ${period}.\n` +
        `Za uplatu HGD-u: ${amount}.\n\n` +
        `Na temelju ovog obračuna knjigovodstvo izdaje račun.\n\n` +
        `Lijep pozdrav,\nHGD Sveta Cecilija\n${partner}`,
    },
  },

  /**
   * Financije (#509): the society's money, for a `finance` holder and nobody
   * else (#500).
   *
   * **Two iznosa, nikad zbrojena, i nikad riječ dobit.** Prikupljeni prihod is
   * cash in hand; Potraživanje od partnera is money a reseller still holds.
   * The society has no cost data, so a single bottom line would be a
   * mislabelled gross (CONTEXT.md, glossary *Dashboard*). The copy keeps them
   * in two separate cards with a sentence between them saying so, because two
   * euro figures side by side invite a reader to add them.
   *
   * No buyer is named anywhere on this screen. "Povrati" is a count and an
   * amount; whose order it was is a question for Narudžbe.
   */
  finance: {
    season: 'Sezona',
    collectedTitle: 'Prikupljeni prihod',
    /**
     * Every explanation on this screen is TWO parts since #571 (Q46): the
     * `lead` says what the figure is and stays under it, and `rest` is the
     * caveat, behind the "i" in the card's heading. Printed in full the caveats
     * were longer than the figures they explained and the screen read as a
     * disclaimer with numbers in it; none of them is dropped, and a reader who
     * wants to know why a number is what it is is one tap away from the answer.
     *
     * Three channels sell a seat and only two of them put money in the
     * society's account on the spot: online checkout and the ulaz. A partner
     * sale is money the reseller holds until the monthly obračun, so it is
     * *Potraživanje od partnera* and never this figure (ADR-0008, ADR-0015).
     */
    collectedNote: {
      lead: 'Naplaćeno online i na ulazu, umanjeno za povrate.',
      rest: 'Partnerska prodaja nije u ovom iznosu nego u potraživanju od partnera, jer taj novac društvo još nije naplatilo. Nije dobit: društvo ovdje ne vodi troškove.',
    },
    online: 'Online narudžbe',
    offline: 'Na ulazu i sa stare stranice',
    refundsTitle: 'Povrati',
    /** Three Croatian plural forms, from the one rule in `roster-loaders.ts`. */
    refundsCount: { one: 'narudžba', few: 'narudžbe', many: 'narudžbi' },
    refundsNote: {
      lead: 'Novac vraćen kupcima u ovoj sezoni.',
      rest: 'Uključuje izgubljene prigovore na naplatu, jer i tada novac ode natrag. Iznos je već odbijen od prikupljenog prihoda, pa se ne oduzima drugi put.',
    },
    receivableTitle: 'Potraživanje od partnera',
    receivableNote: {
      lead: 'Iznos koji partneri duguju za prodane ulaznice.',
      rest: 'Ovaj iznos društvo još nije naplatilo, pa se ne zbraja s prikupljenim prihodom. Partner zadržava proviziju, a ostatak uplaćuje po mjesečnom obračunu.',
    },
    seasonReceivable: 'Ukupno za sezonu',
    /** A partner that can no longer sell but still owes for what it sold. */
    inactivePartner: 'neaktivan',
    promoTitle: 'Promo kodovi',
    promoNote: {
      lead: 'Dio prikupljenog prihoda, ne dodatni iznos.',
      rest: 'Promo kod člana snižava cijenu odrasle ulaznice u online prodaji, pa je taj novac već uračunat u prikupljeni prihod. Ovdje se vidi samo koliko ga je došlo preko kodova.',
    },
    promoTickets: { one: 'ulaznica', few: 'ulaznice', many: 'ulaznica' },
    promoEmpty: 'Ove sezone nijedan promo kod nije iskorišten.',
    monthTitle: 'Obračun po partnerima',
    monthIntro: 'Odaberi mjesec, provjeri iznose i preuzmi obračun.',
    month: 'Mjesec',
    year: 'Godina',
    show: 'Prikaži',
    tickets: 'Ulaznica',
    /** The one name, shared with Obračun and with the document (#599). */
    gross: 'Vrijednost prodanog',
    commission: 'Provizija',
    owed: 'Za uplatu HGD-u',
    cancelled: (n: number) => `${n} otkazanih`,
    /** Not a file any more: the link opens the DOCUMENT, on Obračun (#599). */
    download: 'Otvori obračun',
    noPartners: 'Nema partnera za prikaz.',
    /**
     * The ledger (ADR-0025). Every line says what was charged and, where that
     * is below face value, why — that label is the whole reason a €15 seat is
     * explicable a year later.
     */
    ledgerTitle: 'Prodaja na ulazu',
    ledgerNote: {
      lead: 'Svaka stavka po cijeni po kojoj je naplaćena.',
      rest: 'Negativna količina je ispravak ranijeg unosa. Uz sniženu cijenu stoji razlog, da se godinu dana kasnije zna zašto je mjesto prodano ispod cijene.',
    },
    ledgerEmpty: 'Ove sezone nema zabilježene prodaje izvan sustava narudžbi.',
    ledgerSubtotal: 'Ukupno',
    ledgerSeats: (n: number) => `${n} mjesta`,
    sources: {
      door: 'Vrata',
      legacy: 'Staro',
    },
    types: {
      adult: 'Odrasli',
      child: 'Djeca',
    },
    unitPrice: 'po',
  },

  /**
   * Narudžbe (#501): the blagajna's list of orders and the one order behind it.
   *
   * The screen Tatjana opens when a guest is standing in front of her, so the
   * words are the ones she would use out loud: "gratis" for a comp,
   * "propuštena" for a ticket that has been through the door.
   *
   * **Povrat and storno are two different events and this screen says so.** A
   * refund gave the money back; a *storno* voided a partner or comp seat with
   * no money in it (CONTEXT.md, `tickets.cancel_reason`). The badge, the state
   * filter and the ticket line all use *povrat* for the first, and *storno*
   * stays reserved for the second.
   *
   * Every action here is NAMED (#476): four buttons with four verbs, each
   * behind a confirmation, and no raw edit form anywhere. The one field edit is
   * the buyer's name and address, which is a repair rather than a decision.
   */
  orders: {
    /**
     * The search box and the two filter rows, above the list.
     *
     * Since #570 the search runs as it is typed and the filters are chips, so
     * there is no Traži button to name and no "poništi filtre" link: the first
     * chip of each row IS the way back to the whole list, and it says so.
     */
    searchLabel: 'Pretraži narudžbe',
    searchPlaceholder: 'Ime, e-pošta ili kod',
    /** The divider between the filters and the rows, with the count on it. */
    listTitle: 'Narudžbe',
    showLabel: 'Izvedba',
    allShows: 'Sve izvedbe',
    stateLabel: 'Stanje',
    allStates: 'Sve narudžbe',
    /**
     * The four values of the state filter (`lib/app/orders-query.ts`).
     *
     * "Vraćene", NOT "stornirane": in this project *storno* is a specific
     * thing — a ticket voided with `cancel_reason='storno'`, where no money
     * moved (CONTEXT.md, the partner and comp void). A refunded order is the
     * opposite: the money went back. Calling it storno on the one screen that
     * handles both would teach the blagajna the wrong word for the wrong event.
     */
    states: {
      active: 'Važeće',
      refunded: 'Vraćene',
      partner: 'Partnerske',
      comp: 'Gratis',
    },
    /** How an order was sold, as the row and the detail both say it. */
    channels: {
      online: 'Online',
      partner: 'Partner',
      comp: 'Gratis',
    },
    /** An online order that carried a member's promo code (ADR-0018). */
    promo: 'Promo',
    /**
     * The badge on a row whose money has gone back — the same word the ticket
     * line uses ("Poništena · povrat"), never *storno*, which is the void that
     * moved no money.
     */
    refunded: 'Povrat',
    /**
     * "2 odrasle, 1 dječja" — the party, and the result count above it.
     *
     * Three buckets each, handed to `pluralize` (`roster-loaders.ts`), which is
     * where the Croatian rule is stated once: 21 narudžba, 22 narudžbe, but 11
     * narudžbi. Both nouns are the feminine *karta*, so they decline together.
     */
    adults: { one: 'odrasla', few: 'odrasle', many: 'odraslih' },
    children: { one: 'dječja', few: 'dječje', many: 'dječjih' },
    count: { one: 'narudžba', few: 'narudžbe', many: 'narudžbi' },
    empty: 'Nema narudžbe koja odgovara pretrazi.',
    emptyAll: 'Još nema nijedne narudžbe.',
    /** The pager: two buttons and the one sentence between them. */
    previous: 'Prethodna',
    next: 'Sljedeća',
    pageOf: (page: number, pages: number) => `Stranica ${page} od ${pages}`,

    /** The one order: its facts, in the order they are read. */
    detail: {
      back: 'Sve narudžbe',
      /** The line above the facts card: what this card is (#570). */
      eyebrow: 'Narudžba',
      noName: 'Bez imena',
      noEmail: 'Bez e-pošte',
      performance: 'Izvedba',
      showGone: 'Izvedba je obrisana',
      /** The one link the detail builds: the rest of that evening's orders. */
      sameShow: 'sve narudžbe',
      email: 'E-pošta',
      code: 'Kod narudžbe',
      /** The channel line carries the partner or the member with it. */
      channel: 'Kanal',
      promoCode: 'Promo kod',
      total: 'Iznos',
      created: 'Zaprimljeno',
      /** The party, as a fact; the panel below lists the seats one by one. */
      party: 'Ulaznice',
      ticketsTitle: 'Pojedinačne ulaznice',
      adult: 'Odrasla',
      child: 'Dječja',
      active: 'Važeća',
      cancelled: 'Poništena',
      /**
       * Why a ticket was voided — the DB's own two `cancel_reason` values, and
       * two different events: *povrat* gave the money back, *storno* voided a
       * partner or comp seat with no money involved (CONTEXT.md).
       */
      reasonRefund: 'povrat',
      reasonStorno: 'storno',
      scanned: (when: string) => `Propuštena ${when}`,
      /** The same fact with an unreadable timestamp behind it. */
      scannedNoTime: 'Propuštena',
      notScanned: 'Nije propuštena',
      noTickets: 'Ova narudžba nema ulaznica.',
      missing: 'Ova narudžba ne postoji.',
    },

    /** The four named actions. Povrat is only ever offered to `refunds`. */
    actions: {
      refund: 'Povrat',
      resend: 'Pošalji ulaznice ponovno',
      pdf: 'Otvori PDF',
      edit: 'Uredi kupca',
      confirm: 'Potvrdi',
      cancel: 'Odustani',
      working: 'Trenutak...',
    },

    refund: {
      title: 'Povrat novca',
      body: (amount: string) =>
        `Vraćam ${amount} na karticu kupca i poništavam sve ulaznice ove narudžbe. Ovo se ne može opozvati.`,
      /** A comp or a partner sale never moved money through Stripe. */
      notPayable: 'Ova narudžba nije plaćena karticom, pa nema što vratiti.',
      already: 'Novac je već vraćen.',
      done: 'Novac je vraćen i ulaznice su poništene.',
      failed: 'Povrat nije uspio. Pokušaj ponovno ili javi Josipu.',
    },

    resend: {
      title: 'Pošalji ulaznice ponovno',
      body: (email: string) => `Šaljem ulaznice na ${email}.`,
      noEmail: 'Ova narudžba nema e-poštu. Prvo uredi kupca, pa pošalji.',
      done: 'Ulaznice su poslane.',
      failed: 'Slanje nije uspjelo. Pokušaj ponovno.',
    },

    edit: {
      title: 'Uredi kupca',
      body: 'Popravi ime ili e-poštu. Broj ulaznica, iznos i kanal se ovdje ne mijenjaju.',
      nameLabel: 'Ime i prezime',
      emailLabel: 'E-pošta',
      emailHint: 'Ostavi prazno ako narudžba nema e-poštu.',
      save: 'Spremi',
      done: 'Podaci kupca su spremljeni.',
      failed: 'Spremanje nije uspjelo. Pokušaj ponovno.',
      nameMissing: 'Upiši ime kupca.',
      emailInvalid: 'E-pošta nije ispravna.',
      refunded: 'Stornirana narudžba se ne uređuje.',
      notFound: 'Ova narudžba ne postoji.',
      rejected: 'Zahtjev nije prihvaćen.',
    },
  },

  /**
   * Upiti (#507): the enquiry inbox.
   *
   * An inbox rather than a list, so the words are the words of a mailbox: an
   * enquiry is *nov* until somebody answers it and *riješen* afterwards, and
   * those are the two states the filter offers. A booking enquiry (a request to
   * buy a private izvedba or the experience) carries one badge, because it is
   * the one enquiry with money behind it.
   *
   * Two actions, both named (#476): Odgovori opens the mail, Označi riješenim
   * clears the row. Neither is a raw edit form: the enquiry itself is what a
   * stranger wrote and nobody in this app rewrites it.
   */
  inquiries: {
    /** The state filter, above the list; chips since #570, a select before it. */
    filterLabel: 'Stanje',
    all: 'Svi upiti',
    /** The divider between the filter and the rows, with the count on it. */
    listTitle: 'Upiti',
    states: {
      new: 'Novi',
      handled: 'Riješeni',
    },
    /** The two badges on a row: what state it is in, and whether it is money. */
    newBadge: 'Novo',
    booking: 'Rezervacija',
    /** "5 upita" — how many rows the filter matched, above the list. */
    count: { one: 'upit', few: 'upita', many: 'upita' },
    empty: 'Nema upita u ovom stanju.',
    emptyAll: 'Još nema nijednog upita.',
    /** The pager: two buttons and the one sentence between them. */
    previous: 'Prethodni',
    next: 'Sljedeći',
    pageOf: (page: number, pages: number) => `Stranica ${page} od ${pages}`,

    /** One enquiry: its facts, then the whole message, then the two actions. */
    detail: {
      back: 'Svi upiti',
      /** The line above the facts card: what this card is (#570). */
      eyebrow: 'Upit',
      missing: 'Ovaj upit ne postoji.',
      noName: 'Bez imena',
      noEmail: 'Bez e-pošte',
      email: 'E-pošta',
      type: 'Vrsta upita',
      received: 'Zaprimljeno',
      state: 'Stanje',
      message: 'Poruka',
    },

    actions: {
      reply: 'Odgovori',
      /** Why Odgovori is a sentence instead of a button on this one row. */
      noEmail: 'Ovaj upit nema e-poštu, pa nema kome odgovoriti.',
      handle: 'Označi riješenim',
      /** The undo: the same switch, the other way. */
      reopen: 'Vrati među nove',
      working: 'Trenutak...',
      handled: 'Upit je označen riješenim.',
      reopened: 'Upit je vraćen među nove.',
      failed: 'Spremanje nije uspjelo. Pokušaj ponovno.',
      notFound: 'Ovaj upit ne postoji.',
      rejected: 'Zahtjev nije prihvaćen.',
      invalid: 'Neispravan zahtjev.',
    },

    /**
     * The subject of the reply mail (`inquiries-mailto.ts`).
     *
     * The form stores no subject line, so a booking enquiry is answered under
     * the name of the service it asked about and everything else under "Vaš
     * upit". These are customer-facing and deliberately not the inbox's own
     * labels: "Re: Ostalo" is not a thing to send anybody.
     */
    replySubjects: {
      general: 'Vaš upit',
      'private-moreska': 'Privatna moreška',
      'moreska-experience': 'Moreška iskustvo',
      other: 'Vaš upit',
    } as Record<EnquiryType, string>,
  },

  /**
   * Korisnici (#510): the accounts and what each of them may do.
   *
   * `permissionLabels` and `permissionHints` are keyed by the `Permission` type
   * with `satisfies`, not with `as`: a twelfth word added to the vocabulary in
   * `src/lib/access/permissions.ts` then fails `tsc` here until somebody writes
   * the Croatian for it, which is the only way a new permission cannot ship as
   * an unlabelled checkbox.
   *
   * The copy is careful about one thing throughout: this screen hands out a
   * live password or a live sign-in link, so every sentence that carries one
   * says out loud that it is shown once and where it must not be left.
   */
  users: {
    /** The search box over the list; one field over three columns. */
    searchLabel: 'Traži po korisničkom imenu, imenu ili e-mailu',
    searchPlaceholder: 'Traži',
    clear: 'Svi računi',
    /** The heading over the list, since the count moved beside it (#573). */
    listTitle: 'Računi',
    /** The heading over the six named actions on the detail. */
    actionsTitle: 'Što se može s ovim računom',
    /** "1 račun", "7 računa": Croatian only splits at one for this noun. */
    found: (n: number) => (n === 1 ? '1 račun' : `${n} računa`),
    empty: 'Nema računa koji odgovaraju pretrazi.',
    /** The one thing a Users row may not have and a person always does. */
    noEmail: 'bez e-pošte',
    noPermissions: 'bez dozvola',
    sharedBadge: 'Zajednički',
    selfBadge: 'Ti',
    partnerLabel: 'Partner',
    memberLabel: 'Član',
    back: 'Natrag na korisnike',
    missing: 'Taj račun ne postoji.',

    permissionLabels: {
      users: 'Korisnici',
      tickets: 'Blagajna',
      refunds: 'Povrati',
      door: 'Vrata',
      partner: 'Partner',
      season_stats: 'Sezonski pregled',
      moreska: 'Voditelj',
      moreskant: 'Moreškant',
      finance: 'Financije',
      editor: 'Sadržaj',
      dev: 'Razvoj',
    } satisfies Record<Permission, string>,

    permissionHints: {
      users: 'Otvara i uređuje račune i njihove dozvole.',
      tickets: 'Narudžbe, izvedbe, gratis, upiti i partneri.',
      refunds: 'Vraćanje novca na narudžbi.',
      door: 'Skener na ulazu.',
      partner: 'Partnerska prodaja, samo za vlastitog partnera.',
      season_stats: 'Samo brojke sezone, bez kupaca.',
      moreska: 'Postava, članovi i pozivnice.',
      moreskant: 'Vlastiti dolasci i ljestvica. Traži vezu na člana.',
      finance: 'Prihodi i obračuni, bez kupaca.',
      editor: 'Objave i česta pitanja.',
      dev: 'Razvojna dijagnostika i Backoffice.',
    } satisfies Record<Permission, string>,

    /** The named actions, all of them on the detail except the first. */
    actions: {
      create: 'Novi korisnik',
      permissions: 'Dozvole',
      name: 'Ime',
      email: 'E-mail',
      resetPassword: 'Resetiraj lozinku',
      linkPartner: 'Poveži partnera',
      linkMember: 'Poveži člana',
      shared: 'Dijeljeni račun',
      tabs: 'Tabovi',
      confirm: 'Potvrdi',
      cancel: 'Odustani',
      working: 'Spremam...',
      copy: 'Kopiraj',
      copied: 'Kopirano.',
    },

    /** Deleting an account is Backoffice work and stays there (#476). */
    deleteNote:
      'Brisanje računa radi se u Backofficeu. Ovdje se račun gasi tako da mu se oduzmu sve dozvole.',

    permissions: {
      title: 'Dozvole',
      body: 'Označi što ovaj račun smije. Spremanje mijenja pristup odmah, na svim uređajima.',
      saved: 'Dozvole su spremljene.',
      unchanged: 'Ništa nije promijenjeno.',
      failed: 'Spremanje dozvola nije uspjelo. Pokušaj ponovno.',
      /** The lockout guard: the only refusal aimed at the reader themselves. */
      selfLockout:
        'Ne možeš sebi oduzeti dozvolu Korisnici. Neka to napravi drugi korisnik s tom dozvolom.',
      // Since #621 the repair is one button away on this same screen, so the
      // sentence names it instead of sending the reader to the Backoffice.
      emailRequired:
        'Za taj skup dozvola račun mora imati e-mail. Prvo mu upiši adresu u E-mailu pa probaj ponovno.',
      invalid: 'Nepoznata dozvola.',
      /** The other half of the rule above: nobody grants `users` to a shared login. */
      sharedUsers:
        'Zajednički račun ne može imati dozvolu Korisnici. Prvo makni oznaku zajedničkog računa.',
    },

    /**
     * The eighth action (#621): the address on the login.
     *
     * The copy leads with what the address DOES rather than what it is, because
     * the mistake it prevents is thinking this is a contact detail: it is how
     * the person gets back in. The two refusals name their repair — Dozvole for
     * the set that requires an address, the other account for a taken one.
     */
    email: {
      title: 'E-mail',
      body: 'Adresa na koju ide link za prijavu i zaboravljenu lozinku. Dok je račun ima, "Resetiraj lozinku" šalje link; bez nje daje privremenu lozinku koju pročitaš s ekrana.',
      label: 'E-mail',
      placeholder: 'npr. tatjana@moreska.eu',
      /** Said once, in the sheet: nobody gets a letter about this. */
      note: 'Cecilija ne javlja osobi da joj je adresa promijenjena. Reci joj sam.',
      save: 'Spremi',
      saved: 'E-mail je spremljen.',
      cleared: 'E-mail je maknut.',
      unchanged: 'Ništa nije promijenjeno.',
      failed: 'Spremanje e-maila nije uspjelo. Pokušaj ponovno.',
      /** Clearing an address a named-person set depends on. */
      required:
        'Ovaj račun ima dozvole imenovane osobe, pa mora imati e-mail. Prvo mu makni te dozvole u Dozvolama.',
    },

    /**
     * The seventh action (#617): whom this login belongs to, in words.
     *
     * The copy says what the name is FOR (the list, the letter), because the
     * reader's first guess is that it is a login name, and it says that empty
     * is an answer rather than a mistake: `tehnika` is a room.
     */
    name: {
      title: 'Ime i prezime',
      body: 'Ime osobe kojoj ovaj račun pripada. Stoji na popisu računa i u e-mailu za lozinku. Zajednički račun (tehnika) ostavi bez imena.',
      label: 'Ime i prezime',
      placeholder: 'npr. Tatjana Vigna',
      save: 'Spremi',
      saved: 'Ime je spremljeno.',
      cleared: 'Ime je maknuto.',
      unchanged: 'Ništa nije promijenjeno.',
      failed: 'Spremanje imena nije uspjelo. Pokušaj ponovno.',
      invalid: 'Ime nije ispravno.',
      /** The row on the facts card when nobody has been named yet. */
      none: 'bez imena',
    },

    /**
     * The sixth action (#563): which three screens this account opens on.
     *
     * The copy says what a tab IS, because the word is the reader's own and the
     * mistake it prevents is thinking a tab grants something. Every refusal
     * names the repair: a locked screen names the screen, and the permission it
     * would take is one sheet away in Dozvole.
     */
    tabs: {
      title: 'Tabovi',
      body: 'Odaberi do tri ekrana koja stoje u traci ovog računa, redom kojim ih dodaješ. Prazno znači zadani redoslijed.',
      /** The line under the chips: Više is not a choice and never was. */
      note: 'Više je uvijek zadnji tab i ne troši mjesto.',
      /** "2 od 3 odabrana": what is still free, without a second sentence. */
      count: (chosen: number, max: number) => `${chosen} od ${max} odabrano`,
      /** The order a bar reads in, so the chips are not just a set. */
      order: 'Redoslijed u traci',
      /** The chip that stands where the order would be when nothing is chosen. */
      none: 'Zadani redoslijed',
      empty: 'Ovaj račun ne otvara nijedan ekran, pa nema što staviti u traku.',
      save: 'Spremi',
      saved: 'Tabovi su spremljeni.',
      cleared: 'Traka je vraćena na zadani redoslijed.',
      failed: 'Spremanje tabova nije uspjelo. Pokušaj ponovno.',
      invalid: 'Nepoznat ekran.',
      duplicate: 'Isti ekran je odabran dvaput.',
      tooMany: (max: number) => `Najviše ${max} taba.`,
      locked: (screen: string) =>
        `${screen} ovaj račun ne otvara. Prvo mu dodaj dozvolu u Dozvolama.`,
    },

    create: {
      title: 'Novi korisnik',
      body: 'Korisničko ime je obavezno. E-mail traže dozvole imenovane osobe (Korisnici, Blagajna, Voditelj, Financije, Sadržaj).',
      username: 'Korisničko ime',
      usernameHint: 'Mala slova, brojke, točka, crtica. Bez razmaka.',
      name: 'Ime i prezime',
      email: 'E-mail',
      sharedLabel: 'Zajednički račun (koristi ga više osoba)',
      submit: 'Otvori račun',
      created: (username: string) => `Račun ${username} je otvoren.`,
      failed: 'Otvaranje računa nije uspjelo. Pokušaj ponovno.',
      missingUsername: 'Upiši korisničko ime.',
      badUsername: 'Korisničko ime smije imati samo mala slova, brojke, točku i crticu.',
      badEmail: 'E-mail nije ispravan.',
      usernameTaken: 'To korisničko ime je zauzeto.',
      emailTaken: 'Taj e-mail već ima račun.',
    },

    /** The two branches of "how does this person get in the first time". */
    handover: {
      passwordTitle: 'Privremena lozinka',
      passwordBody:
        'Ova lozinka piše samo ovdje i samo sada. Prepiši je osobi koja će se prijaviti i zatvori ovaj prozor.',
      /** A create that could not mint a link: the ACCOUNT is there, only the link is not. */
      noneTitle: 'Račun je otvoren',
      noneBody: 'Poveznicu za prijavu nismo uspjeli napraviti. Pošalji je preko Resetiraj lozinku na tom računu.',
      linkTitle: 'Poveznica za prijavu',
      linkBody: 'Poveznica vrijedi jedan sat i prijavljuje onoga tko je otvori. Pošalji je osobi kojoj račun pripada i nikome drugome.',
      done: 'Gotovo',
    },

    reset: {
      title: 'Resetiraj lozinku',
      bodyEmail: 'Račun ima e-mail, pa dobiva poveznicu za prijavu koju mu proslijediš.',
      bodyNoEmail:
        'Račun nema e-mail, pa dobiva novu privremenu lozinku. Stara prestaje vrijediti odmah.',
      failed: 'Reset lozinke nije uspio. Pokušaj ponovno.',
    },

    link: {
      partnerTitle: 'Poveži partnera',
      partnerBody: 'Partnerska prijava prodaje samo za partnera na koji je vezana.',
      partnerNone: 'Bez partnera',
      partnerEmpty: 'Nema aktivnih partnera.',
      memberTitle: 'Poveži člana',
      memberBody:
        'Na popisu su aktivni moreškanti koji još nemaju prijavu. Dozvolu Moreškant dodaj zasebno, u Dozvolama.',
      memberNone: 'Bez člana',
      memberEmpty: 'Svi aktivni moreškanti već imaju prijavu.',
      unlinkPartner: 'Odveži partnera',
      unlinkMember: 'Odveži člana',
      saved: 'Veza je spremljena.',
      failed: 'Povezivanje nije uspjelo. Pokušaj ponovno.',
      missingTarget: 'Odaberi s popisa.',
      unknownPartner: 'Taj partner ne postoji.',
      inactivePartner: 'Taj partner više nije aktivan, pa se prijava ne može vezati na njega.',
    },

    shared: {
      title: 'Dijeljeni račun',
      /** The two states, as the facts block prints them. */
      isShared: 'Zajednički',
      isPersonal: 'Osobni',
      on: 'Označi kao zajednički',
      off: 'Označi kao osobni',
      bodyOn:
        'Zajednički račun koristi više osoba, pa ne može sam sebi mijenjati zapis ni lozinku.',
      bodyOff: 'Osobni račun pripada jednoj osobi i sam si mijenja lozinku.',
      saved: 'Spremljeno.',
      failed: 'Spremanje nije uspjelo. Pokušaj ponovno.',
      /** A holder marking their own login shared would lock themselves out of it. */
      notSelf: 'Oznaku zajedničkog računa na vlastitoj prijavi mijenja drugi korisnik.',
    },

    /** Every route on this screen refuses the same two things the same way. */
    rejected: 'Promjena trenutno nije moguća. Pokušaj ponovno iz aplikacije.',
    /**
     * ADR-0022, widened by the #510 review: a login several people hold may not
     * administer accounts AT ALL, not merely its own record. The collection
     * only denies it self-edit, and the shared `tehnika` password is written on
     * a wall, so a shared account with `users` would be account administration
     * anybody who works the door could reach.
     */
    sharedCaller:
      'Ovu prijavu koristi više osoba, pa ne može uređivati korisničke račune. Prijavi se vlastitim računom.',
  },

  /**
   * Izvedbe, the box-office register of the season (#567).
   *
   * Every word here is in the SELLING register: an evening is an *izvedba*,
   * never a *nastup* (CONTEXT.md, *Two registers*). The dancer's words for the
   * same evening live in `moreska` and in `stanje`, and the two vocabularies
   * never borrow from each other — a person who holds both sets reads "nastup"
   * on Moreška and "izvedba" here for the same night, which is correct.
   *
   * The screen is one screen for both halves (#476): the blagajna's numbers and
   * the voditelj's own bookings are rows of the same list, so the words that
   * name a row are here rather than in either half's block.
   */
  izvedbe: {
    /** The hero: the next evening on the schedule, whoever is reading. */
    next: 'Sljedeća izvedba',
    /** The quiet count beside a month heading. */
    count: { one: 'izvedba', few: 'izvedbe', many: 'izvedbi' },
    past: (count: number) => `Prošle izvedbe (${count})`,
    /** A row's own line about its sale: "prodano 132 od 350". */
    sold: (sold: number, capacity: number) => `prodano ${sold} od ${capacity}`,
    /** The title of a row that sells nothing and has no client to name. */
    booking: 'Izvedba po narudžbi',
    /** The detail's cards, in the order they are read. */
    salesCard: 'Prodaja',
    actionsCard: 'Radnje',
    performanceCard: 'Izvedba',
    lineupCard: 'Postava',
    compCard: 'Gratis ulaznice',
    /** Where a booking's own two facts are printed, for a reader who is not a dancer. */
    place: 'Mjesto',
    client: 'Naručitelj',
    /** Two ways to have no next izvedba, and they are not the same news. */
    eosTitle: 'Sezona je završila',
    eosBody: (date: string) => `Zadnja izvedba bila je ${date}.`,
    eosNothingTitle: 'Sezona još nije počela',
    eosNothing: 'Ove sezone još nije bilo izvedbi.',
  },

  /**
   * The blagajna's half of Izvedbe (#502): the numbers on a public evening and
   * the named actions that change it.
   *
   * Every word here is about SEATS and MONEY, which is why it is its own block
   * rather than more of `performance` (the voditelj's five fields) or of
   * `detail` (the roster's headcounts). A dancer never reads any of it: the
   * page renders this section only for a `tickets` holder.
   */
  sales: {
    title: 'Prodaja',
    /** The one line every row carries: "148/350" and what is left of it. */
    soldOf: (sold: number, capacity: number) => `${sold}/${capacity}`,
    remaining: (seats: number) => `još ${seats}`,
    /** An oversold room is a real state (a miscounted door batch), so it says so. */
    over: (seats: number) => `${seats} preko kapaciteta`,
    /**
     * The five places a seat can come from, in the order the money reads them:
     * the three ticketed channels first, then the two the ledger holds
     * (ADR-0025). Lowercase, because they are read inside a line rather than as
     * headings.
     */
    channels: {
      online: 'online',
      partner: 'partner',
      comp: 'gratis',
      door: 'vrata',
      legacy: 'staro',
    },
    none: 'Još nema prodaje.',
    /**
     * What is true of this evening besides its numbers.
     *
     * "Preseljeno" and "Pomaknuto" are facts a buyer was already mailed about
     * (#94, #379), so they are a record rather than a warning; "Pauzirano" is
     * the one that is still someone's decision.
     */
    badges: {
      paused: 'Prodaja pauzirana',
      cancelled: 'Otkazano',
      moved: 'Preseljeno',
      rescheduled: 'Datum pomaknut',
    },
    /** The detail's number list. `Prihod` appears for a `finance` holder only. */
    numbers: {
      sold: 'Prodano',
      remaining: 'Slobodno',
      capacity: 'Kapacitet',
      scanned: 'Ušlo',
      revenue: 'Prihod',
      online: 'Online',
      partner: 'Partner',
      comp: 'Gratis',
      door: 'Na vratima',
      legacy: 'Prethodna stranica',
    },
    /**
     * The one line under Prihod (#538).
     *
     * Prihod counts `channel='online'` money and the offline ledger, because a
     * partner order stores `total` at face value the society has not collected
     * (ADR-0008) and a storno leaves that total standing. Partner seats must
     * not silently vanish from the evening's money, though, so they get this
     * sentence instead: what they are WORTH at face value, and the two things
     * that are not true of that number.
     *
     * It deliberately does NOT say *potraživanje*. Financije's *Potraživanje od
     * partnera* is `netCents` from `partner-reconciliation.ts`, which is face
     * value MINUS the partner's commission; this is the gross before it. Using
     * the same word for two different amounts would invite reading one off the
     * other, so the sentence says "prije provizije" and leaves the receivable
     * to the screen that computes it.
     *
     * The three words are the Croatian plural buckets, handed to `pluralize`
     * (`roster-loaders.ts`) by `sales-view.ts` the way every other count on
     * `/app` is.
     */
    partnerFace: {
      ticket: { one: 'ulaznica', few: 'ulaznice', many: 'ulaznica' },
      line: (tickets: string, amount: string) =>
        `Partneri: ${tickets}, nominalno ${amount} (prije provizije, nije u prihodu)`,
    },
    /** A non-public evening sells nothing, so there is nothing to show. */
    notPublic: 'Ova izvedba ne prodaje ulaznice, pa nema brojki o prodaji.',
    ordersLink: 'Narudžbe za ovu izvedbu',
    /**
     * The hero's way into the evening, for a reader who is only the blagajna.
     * "Tko dolazi, postava, ulaznice" names three segments they do not get.
     */
    detailLink: 'Prodaja i radnje',
  },

  /**
   * Statistika (#508): the season in counts, and never in euros.
   *
   * The screen answers to `tickets`, `season_stats` and `finance`, and the
   * money question is a different screen (Financije, #509). So there is no
   * `revenue` key here and there must never be one: a label that does not
   * exist cannot be rendered by accident.
   *
   * The channel words are deliberately the same four `sales.channels` uses on
   * Izvedbe, because the two screens count the same seats and a second
   * vocabulary would read as a second rule.
   */
  statistics: {
    season: 'Sezona',
    /** The band: four figures, read before anything is scrolled. */
    sold: 'Prodano',
    comps: 'Gratis',
    capacity: 'Kapacitet',
    fill: 'Popunjenost',
    /** The three sections under it. */
    performances: 'Izvedbe',
    trajectory: 'Tijek sezone',
    mix: 'Odakle su mjesta',
    compsByMember: 'Gratis po članu',
    /** The per-izvedba row and its columns. */
    soldOf: (sold: number, capacity: number) => `${sold}/${capacity}`,
    adults: 'Odrasli',
    children: 'Djeca',
    scanned: 'Ušlo',
    cancelled: 'Otkazano',
    channels: {
      online: 'online',
      door: 'vrata',
      partner: 'partner',
      comp: 'gratis',
    },
    /**
     * Two footnotes, both about a number that would otherwise be questioned:
     * the old site's seats are counted at the door because they have no other
     * home, and an otkazana izvedba has no seats to sell so it is out of every
     * season figure (the same rule `seasonCapacity` has always applied).
     */
    doorNote: 'U "vrata" su i mjesta prenesena sa stare stranice.',
    cancelledNote: 'Otkazane izvedbe ne ulaze u zbroj sezone.',
    compsHint: 'Aktivne gratis ulaznice ove sezone, po članu kojemu su pripisane.',
    member: 'Član',
    total: 'Ukupno',
    /** Nothing to show, one sentence per reason there is nothing. */
    empty: 'U ovoj sezoni nema izvedbi s prodajom.',
    noSales: 'Još nema prodaje.',
    noComps: 'Ove sezone nema gratis ulaznica.',
  },

  /**
   * The blagajna's named actions on one public evening (#502).
   *
   * Each one is a button with a verb on it and a sheet under it that says what
   * is about to happen, never a browser dialog: three of the five move money or
   * send mail to every buyer, and a mis-tap on a phone is the normal case.
   * Every route behind them already existed and is unchanged.
   */
  showActions: {
    title: 'Radnje',
    /**
     * Why a named action is greyed rather than missing (#567, Q53).
     *
     * A voditelj may now enter and correct a public evening, so they read this
     * screen and its six actions; what they may NOT do is move the money or the
     * buyers. The button stays where it is and says who to ask, because a
     * control that disappears teaches nobody that it exists — and the route
     * refuses the same request anyway, so the caption is the honest half of a
     * refusal rather than the whole of the rule.
     *
     * Both sentences name a PERSON ("Blagajna", the desk that answers for the
     * seats), never a permission word: `tickets` and `refunds` are words from
     * the codebase.
     */
    needsBox: 'traži Blagajnu',
    needsRefundsCaption: 'traži dozvolu za povrate',
    confirm: 'Potvrdi',
    cancel: 'Odustani',
    close: 'Zatvori',
    working: 'Radim...',
    failed: 'Radnja nije uspjela. Pokušaj ponovno.',
    loading: 'Učitavam...',
    /** The online sales switch (#366). The only action that mails nobody. */
    pause: {
      pause: 'Pauziraj online prodaju',
      resume: 'Nastavi online prodaju',
      pauseTitle: 'Pauzirati online prodaju?',
      pauseBody:
        'Izvedba ostaje na rasporedu, ali se ulaznice više ne mogu kupiti online. Partneri i vrata i dalje prodaju.',
      resumeTitle: 'Nastaviti online prodaju?',
      resumeBody: 'Ulaznice se ponovno mogu kupiti online.',
      paused: 'Online prodaja je pauzirana.',
      resumed: 'Online prodaja je nastavljena.',
    },
    /** Otkaži: the #497 route, money and mail to every buyer. */
    cancelShow: {
      action: 'Otkaži izvedbu',
      title: 'Otkazati izvedbu?',
      lead: (date: string, time: string) => `${date} u ${time}. Ovo se ne može poništiti.`,
      refunds: (amount: string, orders: number) =>
        `Povrat ${amount} na ${orders} online ${orders === 1 ? 'narudžbu' : 'narudžbi'}.`,
      voids: (partnerSeats: number, compSeats: number) =>
        `Storniranje ${partnerSeats} partnerskih i ${compSeats} gratis ulaznica.`,
      mails: (buyers: number, noEmail: number) =>
        noEmail > 0
          ? `E-pošta na ${buyers} kupaca; ${noEmail} narudžbi nema adresu.`
          : `E-pošta na ${buyers} kupaca.`,
      already:
        'Izvedba je već otkazana. Ponovno pokretanje dovršava povrate i e-poštu koje raniji pokušaj nije stigao obaviti.',
      overLimit: (limit: number) =>
        `To je više od ${limit} poruka dnevno koliko Brevo dopušta, a dio današnje kvote je možda već potrošen. Poruke koje ne prođu broje se kao neuspjele: pokreni radnju ponovno sutra i poslat će se samo one koje su ostale.`,
      confirm: 'Otkaži, vrati novac i obavijesti',
      /** The way OUT of the cancel sheet: naming the outcome, not "Odustani". */
      keep: 'Zadrži izvedbu',
      done: (refunded: number, amount: string, voided: number, notified: number) =>
        `Otkazano. Povrat na ${refunded} narudžbi (${amount}), stornirano ${voided} ulaznica, obaviješteno ${notified} kupaca.`,
      /** The documented fix for a half-finished run (#497). */
      retry:
        'Dio posla nije prošao. Pokreni radnju ponovno: preskače sve što je već obavljeno i ponavlja samo ovo.',
    },
    /** Pomakni datum: the #379 route, with its test send. */
    reschedule: {
      action: 'Pomakni datum',
      title: 'Pomakni datum izvedbe',
      lead: (date: string, time: string, buyers: number) =>
        `Sada ${date} u ${time}. Obavijest ide na ${buyers} kupaca, a ulaznice se šalju ponovno s novim datumom.`,
      newDate: 'Novi datum',
      test: 'Pošalji probni mail meni',
      testSent: (to: string) => `Probni mail je poslan na ${to} (EN i HR). Provjeri pa potvrdi.`,
      confirm: 'Potvrdi i pošalji kupcima',
      needsDate: 'Prvo odaberi novi datum.',
      done: (oldDate: string, newDate: string, sent: number, total: number) =>
        `Pomaknuto ${oldDate} u ${newDate}. Obaviješteno ${sent} od ${total} kupaca.`,
      noop: 'To je već datum ove izvedbe. Ništa nije promijenjeno.',
      mismatch: 'Datum se u međuvremenu promijenio. Otvori radnju ponovno. Nije poslana e-pošta.',
    },
    /** Preseli u zimsko: the #94 route. Ljetno only, once. */
    move: {
      action: 'Preseli u zimsko',
      title: 'Preseliti u Centar za kulturu?',
      lead: (buyers: number) =>
        `Mjesto se mijenja u Centar za kulturu, a obavijest ide na ${buyers} kupaca. Ovo se radi jednom.`,
      confirm: 'Preseli i obavijesti',
      done: (sent: number, total: number) =>
        `Preseljeno. Obaviješteno ${sent} od ${total} kupaca.`,
      already: 'Izvedba je već preseljena. E-pošta se ne šalje ponovno.',
      notApplicable: 'Ova izvedba je već u Centru za kulturu, pa nema što preseliti.',
    },
    /** Prodaja na vratima: the ledger (ADR-0025), past evenings included. */
    door: {
      action: 'Prodaja na vratima',
      title: 'Upiši prodane ulaznice',
      hint: 'Dodaje se na dosadašnji zbroj. Negativan broj ispravlja raniji unos.',
      sourceLabel: 'Gdje je prodano',
      sourceDoor: 'Na vratima',
      sourceLegacy: 'Prethodna stranica (prije prelaska)',
      adults: 'Odrasli (20 €)',
      children: 'Djeca (10 €)',
      discountHead: 'Sniženo, i dalje odrasla ulaznica',
      discountCount: 'Koliko',
      discountPrice: 'Cijena po ulaznici (€)',
      discountReason: 'Razlog sniženja',
      discountReasonPlaceholder: 'npr. umirovljenici',
      recorded: 'Već upisano',
      recordedHint:
        'Da ispraviš neki redak, upiši istu vrstu i istu cijenu s negativnim brojem.',
      empty: 'Upiši barem jednu ulaznicu.',
      needsPrice: 'Sniženi redak treba cijenu.',
      needsReason: 'Sniženi redak treba razlog.',
      confirm: 'Upiši',
      done: (total: number) => `Upisano. Novi zbroj: ${total}.`,
      /**
       * Why the ledger refused, in Croatian, keyed by the route's own
       * `OfflineSaleValidationError` code.
       *
       * The route predates Cecilija and answers `/admin` too, so its `error`
       * field is developer English ("That correction takes back more adult
       * tickets at €20.00 than were ever recorded"). A cashier standing at the
       * entrance needs the sentence in their own language and, more to the
       * point, needs to know WHICH of their numbers to change. The generic
       * "pokušaj ponovno" told them neither.
       */
      errors: {
        EMPTY: 'Upiši barem jednu ulaznicu.',
        BAD_TYPE: 'Nepoznata vrsta ulaznice.',
        BAD_QUANTITY:
          'Brojevi moraju biti cijeli, a ispravak ne smije izvedbu ostaviti s manje od nula prodanih ulaznica.',
        BAD_PRICE: 'Cijena mora biti broj, i ne smije biti negativna.',
        PRICE_ABOVE_FACE:
          'Cijena je viša od pune cijene ulaznice. Odrasla je 20 €, dječja 10 €, a više se ne naplaćuje.',
        DISCOUNT_REASON_REQUIRED:
          'Sniženi redak treba razlog, na primjer "umirovljenici". Bez njega se kasnije ne zna zašto je ulaznica bila jeftinija.',
        LABEL_TOO_LONG: 'Razlog sniženja je predug.',
        OVER_CORRECTION:
          'Ispravak vraća više ulaznica nego što je upisano po toj cijeni. Redak se ispravlja istom vrstom i istom cijenom po kojoj je upisan, a gore piše što je već upisano.',
      },
    },
  },

  /** The shared calendar subscription (#433, glossary: *Calendar feed*). */
  calendar: {
    body: 'Dodaj ovu poveznicu u Google, Apple ili Outlook kalendar i sve izvedbe su ti u telefonu.',
    copy: 'Kopiraj poveznicu',
    copied: 'Poveznica je kopirana.',
    copyFailed: 'Kopiranje nije uspjelo, označi poveznicu i kopiraj ručno.',
  },

  /**
   * The Sandučić obavijesti (#496): the screen behind the bell.
   *
   * Every notification the app sends is also kept here, per account, so the
   * unread count is the same on the phone and on the laptop. The screen is a
   * Više row rather than a tab, because it is read after something happened
   * rather than as a place to be.
   */
  notifications: {
    title: 'Obavijesti',
    /**
     * The heading over the list (#569). The header already says "Obavijesti",
     * so the section says what the thing IS — the glossary's *Sandučić
     * obavijesti* — and carries "Označi sve pročitanim" on its right.
     */
    section: 'Sandučić',
    /** The bell's accessible name, with the count read out loud. */
    bell: (unread: number) => (unread > 0 ? `Obavijesti, ${unread} nepročitanih` : 'Obavijesti'),
    /** Above 99 the exact number stops being information on a badge. */
    badgeOverflow: '99+',
    markAll: 'Označi sve pročitanim',
    marking: 'Označavam...',
    markAllFailed: 'Označavanje nije uspjelo. Pokušaj ponovno.',
    emptyTitle: 'Još nema obavijesti',
    emptyBody: 'Kad se nešto dogodi oko izvedbi, naći ćeš to ovdje.',
    /** The dot next to a row nobody has opened yet. */
    unread: 'Nepročitano',
    /** "danas u 21:00" / "5. kolovoza u 21:00", built by `notification-view.ts`. */
    today: 'danas',
    yesterday: 'jučer',
  },

  /**
   * Gratis (#506): the secretary hands a society member free seats.
   *
   * Three things on one screen, in the order of the moment they serve: give
   * some away, take one back, and see who has had how many this season. The
   * words are the ones spoken in the office — *gratis* for a comp, *član* for
   * the member it is attributed to, *nositelj* for the name printed on the
   * slip, which ADR-0019 keeps deliberately apart from the attribution.
   *
   * Poništi is *storno*, never *povrat*: no money ever moved through a comp, so
   * the word that means "the money went back" would be a lie about the event.
   * And unlike the partner's cancel there is no way back — `/api/comp/cancel`
   * offers no undo — so the tap is behind a confirmation rather than a bar that
   * drains.
   */
  gratis: {
    /** Podijeli gratis: the button, and the title of the sheet it opens (#570). */
    issueTitle: 'Podijeli gratis',
    /** The sheet's own way out, under the form. */
    close: 'Zatvori',
    show: 'Izvedba',
    noShows: 'Nema nadolazećih izvedbi za koje se dijele ulaznice.',
    seatsLeft: (n: number) => `${n} slobodno`,
    soldOut: 'rasprodano',
    member: 'Član',
    memberSearch: 'Traži po imenu',
    memberRequired: 'Odaberi člana kojemu gratis ide.',
    noMembers: 'Još nema članova. Dodaj prvoga.',
    noMatch: 'Nema člana s tim imenom.',
    addMember: '+ Dodaj člana',
    newMemberName: 'Ime i prezime',
    saveMember: 'Spremi člana',
    savingMember: 'Spremam...',
    addMemberFailed: 'Član nije dodan. Pokušaj ponovno.',
    adults: 'Odrasli',
    children: 'Djeca',
    /** The printed holder row (ADR-0019), prefilled from the member. */
    holder: 'Ime na ulaznici',
    holderHint: 'Prazno znači ime člana.',
    email: 'E-pošta',
    emailHint: 'Nije obavezno. Ako je upišeš, ulaznice idu na nju.',
    issue: 'Izdaj gratis',
    issuing: 'Izdajem...',
    /**
     * One sentence per refusal `/api/comp/issue` can answer with.
     *
     * The route's own `error` field is developer English ("This show has
     * already taken place"), so it must never reach the screen; its `code` is
     * what this maps. Each of these has a different repair — pick another
     * evening, pick fewer seats, pick a member — and a single "pokušaj
     * ponovno" would hide which one, on a screen whose whole job is a form
     * somebody has just filled in.
     */
    tooMany: 'Nema toliko slobodnih mjesta. Smanji broj ulaznica ili odaberi drugu izvedbu.',
    showPast: 'Ta je izvedba već prošla. Odaberi nadolazeću.',
    showCancelled: 'Ta je izvedba otkazana, pa se za nju ne izdaju ulaznice.',
    showNotPublic: 'Za tu se izvedbu ne prodaju ulaznice, pa nema ni gratisa.',
    showGone: 'Ta izvedba više ne postoji. Osvježi stranicu.',
    memberGone: 'Taj član više ne postoji. Odaberi drugoga ili ga dodaj ponovno.',
    failed: 'Gratis nije izdan. Pokušaj ponovno.',
    network: 'Veza je pukla. Pokušaj ponovno.',
    /** The confirmation, and the three honest outcomes of the e-mail. */
    doneTitle: 'Gratis je izdan.',
    doneBody: (tickets: number, code: string) => `${tickets} ulaznica · ${code}`,
    openPdf: 'Otvori PDF',
    emailSent: (address: string) => `Ulaznice su poslane na ${address}.`,
    emailSkipped: 'E-pošta nije upisana, pa ulaznice idu samo na ispis.',
    emailFailed: (address: string) =>
      `Ulaznice nisu otišle na ${address}. Otvori PDF i ispiši ih, ili pošalji ponovno iz narudžbe.`,

    /** Zadnji gratisi: the void list. */
    recentTitle: 'Zadnji gratisi',
    recentEmpty: 'Još nije izdan nijedan gratis.',
    noMember: 'Bez člana',
    noHolder: 'Bez imena',
    issuedAt: 'Izdano',
    performance: 'Izvedba',
    people: 'Osoba',
    typeAdult: 'Odrasla',
    typeChild: 'Dječja',
    statusCancelled: 'poništena',
    statusScanned: 'ušlo',
    allCancelled: 'Poništeno',
    tickets: 'Ulaznice',
    downloadTickets: 'Otvori PDF',
    /** Poništi gratis: a confirmation, because the void cannot be undone. */
    cancelOrder: 'Poništi gratis',
    cancelTicket: 'Poništi ulaznicu',
    cancelling: 'Poništavam...',
    confirm: 'Potvrdi',
    cancel: 'Odustani',
    confirmOrderTitle: 'Poništiti cijeli gratis?',
    confirmOrderBody: (code: string, tickets: number) =>
      `${code}: ${tickets} ulaznica prestaje vrijediti i mjesta se vraćaju u prodaju. Poništenje se ne može vratiti.`,
    confirmTicketTitle: 'Poništiti jednu ulaznicu?',
    confirmTicketBody: (ref: string) =>
      `${ref} prestaje vrijediti i mjesto se vraća u prodaju. Poništenje se ne može vratiti.`,
    confirmScanned: 'Pažnja: ta je ulaznica već skenirana na ulazu.',
    cancelled: 'Gratis je poništen.',
    cancelFailed: 'Poništenje nije uspjelo. Pokušaj ponovno.',

    /** Gratis po članu: the season report. */
    perMemberTitle: 'Gratis po članu',
    perMemberEmpty: 'U ovoj sezoni nije izdan nijedan gratis.',
    colMember: 'Član',
    colAdults: 'Odrasle',
    colChildren: 'Dječje',
    colIssued: 'Izdano',
    colVoided: 'Poništeno',
    seasonLabel: 'Sezona',
    /** Promo codes are not on this screen and never were (#476). */
    codesNote: 'Promo kodovi se uređuju u Backofficeu.',
  },

  /** The OAuth consent screen for the MCP connector (#438, stories 56-59). */
  authorize: {
    title: 'Poveži Claude',
    /** The client is fixed and pre-registered, so its name is a constant too. */
    client: 'Claude',
    intro:
      'Claude će moći čitati raspored izvedbi i moreškante te upisivati postave i nove nejavne izvedbe. Ne može potvrditi postavu, poslati alarm, javiti dolazak ni izdati karte.',
    signedInAs: 'Prijavljen si kao',
    allow: 'Dopusti pristup',
    deny: 'Odbij',
    working: 'Povezivanje...',
    /** No session at all: the caller can fix this one themselves. */
    signInFirst: 'Prijavi se u Ceciliju pa pokušaj ponovno.',
    /** A dancer, or anyone else without `moreska` (story 58). */
    deniedTitle: 'Nemate pristup',
    deniedBody: 'Claude se može povezati samo s računom voditelja.',
    invalidRequest: 'Zahtjev za povezivanje nije ispravan. Pokušaj ponovno iz aplikacije Claude.',
    failed: 'Povezivanje nije uspjelo. Pokušaj ponovno.',
  },
} as const

/**
 * The alarm sentence, in one place (#431, glossary: *Alarm*).
 *
 * "Sokoliću" is a generic greeting, not a vocative of anyone's nickname, and
 * the numbers are always the CURRENT headcount, never the shortfall — which is
 * why they come straight from `countArmies` (`src/lib/attendance/army-count.ts`,
 * the single home of the counting rule) and are never recomputed here.
 */
export const PUSH_MESSAGES = {
  alarm: {
    title: 'Sokoliću, fali nas!',
    body: (input: { date: string; time: string; bili: number; crni: number }) =>
      `Stanje za nastup ${formatPerformanceDate(input.date)} u ${input.time}: ${input.bili} bilih, ${input.crni} crnih`,
  },
  reminder: {
    title: 'Javi dolazak',
    body: (input: { date: string; time: string }) =>
      `Nastup je ${formatPerformanceDate(input.date)} u ${input.time}. Još nisi javio dolaziš li.`,
  },

  /**
   * Type (3), the performance change (#436, stories 15 and 16).
   *
   * The sentence NAMES what changed, so a dancer standing in the harbour does
   * not have to open the app to learn whether it is the time or the pier. The
   * date and time in it are always the NEW ones: a message about a change is a
   * message about what is true now.
   *
   * A cancellation gets its own title, because it is the one change that means
   * "do not come" rather than "come differently".
   */
  change: {
    title: 'Promjena nastupa',
    cancelledTitle: 'Nastup je otkazan',
    cancelledBody: (input: { date: string; time: string }) =>
      `Nastup ${formatPerformanceDate(input.date)} u ${input.time} je otkazan.`,
    body: (input: { date: string; time: string; fields: readonly string[] }) =>
      `Nastup ${formatPerformanceDate(input.date)} u ${input.time}. Promijenjeno: ${input.fields.join(', ')}.`,
    fields: {
      date: 'datum',
      time: 'vrijeme',
      place: 'mjesto',
      cancelled: 'otkazivanje',
      note: 'poruka voditelja',
    },
    /** The way back: the row was cancelled and is not any more. */
    uncancelled: 'nastup više nije otkazan',
  },

  /** Type (4): a performance that did not exist a minute ago (story 17). */
  created: {
    title: 'Novi nastup',
    body: (input: { date: string; time: string; kind: string; place: string }) =>
      `${input.kind}, ${formatPerformanceDate(input.date)} u ${input.time}${
        input.place ? `, ${input.place}` : ''
      }. Javi dolaziš li.`,
  },

  /**
   * A whole season entered at once (#441 review).
   *
   * The bulk-create tool writes twenty-two Redovna shows in a loop; twenty-two
   * separate "novi nastup" pushes would be a phone buzzing for a minute about
   * a schedule nobody has to answer this instant. One sentence, and the tap
   * lands on the list rather than on any one evening.
   */
  createdBulk: {
    title: 'Novi nastupi',
    body: (input: { count: number; firstDate: string }) =>
      `U raspored je dodano ${input.count} ${input.count === 1 ? 'novi nastup' : 'novih nastupa'}, prvi ${formatPerformanceDate(input.firstDate)}.`,
  },

} as const

/**
 * The two kinds that are FILED and never pushed (#496).
 *
 * They are separate from `PUSH_MESSAGES` because nothing about them reaches a
 * phone: a new inquiry and a chargeback are read at a desk, and a device that
 * buzzed for every enquiry would be muted inside a week. Same shape, so the
 * inbox renders them without knowing the difference.
 */
export const INBOX_MESSAGES = {
  inquiry: {
    title: 'Novi upit',
    body: (input: { name: string; type: string }) => `${input.name} · ${input.type}`,
  },

  /**
   * A card payment the buyer disputed (#380). It names the money and the order,
   * because the one thing a secretary does next is find that order.
   */
  dispute: {
    title: 'Osporena naplata',
    body: (input: { order: string | null; amount: string; reason: string }) =>
      `${input.order ? `Narudžba ${input.order}` : 'Nije pronađena narudžba'}, ${
        input.amount
      }. Razlog: ${input.reason}.`,
  },
} as const

/** Croatian labels for the enquiry types the public forms store. */
export const ENQUIRY_TYPE_LABELS: Record<EnquiryType, string> = {
  general: 'Općenito',
  'private-moreska': 'Privatna moreška',
  'moreska-experience': 'Moreška iskustvo',
  other: 'Ostalo',
}

/** Croatian labels for the performance kinds (ADR-0024). */
export const KIND_LABELS: Record<PerformanceKind, string> = {
  redovna: 'Redovna',
  dmc: 'Adriatic DMC',
  gulliver: 'Gulliver',
  koncert: 'Koncert',
  experience: 'Moreška Experience',
  ostalo: 'Ostalo',
}

/** Croatian labels for a lineup line (dance roles + voditelj); the vocabulary itself lives in lib. */
export const ROLE_LABELS: Record<LineupRole, string> = LINEUP_ROLE_LABELS

const WEEKDAYS = [
  'nedjelja',
  'ponedjeljak',
  'utorak',
  'srijeda',
  'četvrtak',
  'petak',
  'subota',
] as const

/**
 * The weekdays as they read AFTER "u": "u petak", "u subotu", "u srijedu".
 *
 * Croatian puts the day in the accusative there, and three of the seven change
 * their ending, so Početna's "Nastup je u srijedu." cannot be built by gluing
 * the nominative onto a preposition (#564).
 */
const WEEKDAYS_AFTER_U = [
  'nedjelju',
  'ponedjeljak',
  'utorak',
  'srijedu',
  'četvrtak',
  'petak',
  'subotu',
] as const

/** "srijedu" — the weekday of a YYYY-MM-DD date, as it reads after "u". */
export function weekdayAfterU(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS_AFTER_U[d.getUTCDay()]
}

/** The genitive months, as a Croatian date reads them ("5. kolovoza"). */
export const MONTHS_GENITIVE = [
  'siječnja',
  'veljače',
  'ožujka',
  'travnja',
  'svibnja',
  'lipnja',
  'srpnja',
  'kolovoza',
  'rujna',
  'listopada',
  'studenoga',
  'prosinca',
] as const

/**
 * "srijeda, 5. kolovoza" from a YYYY-MM-DD date.
 *
 * Hand-rolled rather than `Intl`: Croatian month names decline, and the genitive
 * ("5. kolovoza") is what a date reads like in a sentence, which `Intl`'s
 * nominative ("5. kolovoz") does not give. Parsed as UTC noon so no timezone can
 * shift the calendar day.
 */
export function formatPerformanceDate(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return date
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS_GENITIVE[d.getUTCMonth()]}`
}

/** UTC noon, so no timezone can shift the calendar day out from under a label. */
function atNoon(date: string): Date | null {
  const d = new Date(`${date}T12:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * "19:40" — the hour a stored instant happened, in Zagreb (#612).
 *
 * Odustali is read against ONE evening, whose date the screen already carries,
 * so the time of day is the whole of the useful fact. Zagreb explicitly rather
 * than the server's zone: the row is stamped in UTC and the voditelj reading it
 * is standing on the pier.
 */
export function timeOfDay(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  return new Intl.DateTimeFormat('hr-HR', {
    timeZone: 'Europe/Zagreb',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms))
}

/**
 * "Četvrtak, 17. rujna" — the hero's headline (#457).
 *
 * The same sentence `formatPerformanceDate` builds, with the weekday
 * capitalised because here it opens a line rather than sitting inside one.
 */
export function formatPerformanceDateLong(date: string): string {
  const text = formatPerformanceDate(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "čet" — the weekday of the date tile in the month list. */
export function shortWeekday(date: string): string {
  const d = atNoon(date)
  return d ? APP_STRINGS.date.weekdaysShort[d.getUTCDay()] : ''
}

/** The day number of the date tile, as a string ("17"). */
export function dayOfMonth(date: string): string {
  const d = atNoon(date)
  return d ? String(d.getUTCDate()) : ''
}

/**
 * "rujna" — the month beside the hero's 80px day number (#565).
 *
 * Genitive, because "14 rujna" is how the date is spoken: the big number and
 * this word are one date split over two type sizes, not a number and a label.
 */
export function monthGenitiveOf(date: string): string {
  const d = atNoon(date)
  return d ? (MONTHS_GENITIVE[d.getUTCMonth()] ?? '') : ''
}

/** "17. rujna" — a date inside a sentence, with no weekday in front of it. */
export function dayAndMonth(date: string): string {
  const d = atNoon(date)
  return d ? `${d.getUTCDate()}. ${monthGenitiveOf(date)}` : ''
}

/** "Ponedjeljak" — the weekday that opens the hero's meta line (#565). */
export function weekdayLabel(date: string): string {
  const d = atNoon(date)
  if (!d) return ''
  const name = WEEKDAYS[d.getUTCDay()] ?? ''
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** "Rujan" from a 1-12 month number; the heading of a month section. */
export function monthLabel(month: number): string {
  return APP_STRINGS.date.months[month - 1] ?? ''
}

/** "ruj" from a 1-12 month number; the bar chart's axis. */
export function shortMonthLabel(month: number): string {
  return APP_STRINGS.date.monthsShort[month - 1] ?? ''
}
