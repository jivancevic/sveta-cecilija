// Every word `/app` says, in one place (#421).
//
// Cecilija is Croatian-only by decision (ADR-0024, story 33): it is a
// tool for the society's own dancers, not a second face of the ticket shop, so
// it carries no i18n layer, no locale cookie and no `src/messages` dictionary.
// One frozen map, imported by the pages and by the route handlers that answer
// with a message.
//
// Copy rules (CONTEXT.md): "moreška" lowercase in Croatian, a dancer is a
// "moreškant" and never a "moreškar", the event noun is "izvedba" (never
// "nastup" or "predstava"), and no em-dashes in anything a person reads.

import type { PerformanceKind } from '@/lib/show-performance'
import type { DanceRole } from '@/lib/moreskant-profile'
import { DANCE_ROLE_LABELS } from '@/lib/moreskant-profile'

export const APP_STRINGS = {
  /** The product name: the manifest, the header and the browser tab all use it. */
  name: 'Cecilija',
  tagline: 'HGD Sveta Cecilija',

  header: {
    logout: 'Odjava',
    /** Shown next to the nickname when the account has no dance roles yet. */
    noRoles: 'bez uloge',
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
   * Signing in from a link (#463): what `/app/prijava` says while it works and
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

  denied: {
    title: 'Nemate pristup',
    body: 'Ova aplikacija je za moreškante i voditelje. Ako trebaš uredski dio, otvori administraciju.',
    adminLink: 'Otvori administraciju',
    logout: 'Odjavi se',
  },

  /** The three tabs of the bottom bar (#457): three real pages, not a toggle. */
  tabs: {
    performances: 'Izvedbe',
    mine: 'Moje',
    more: 'Više',
  },

  list: {
    season: 'Sezona',
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
    lineupConfirmed: 'Postava potvrđena',
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

  /** The "Moje" tab: one dancer's own season (#457). */
  mySeason: {
    title: 'Moje',
    /** The two panels, which are also what `?dio=` means on this tab. */
    segments: {
      moja: 'Moja sezona',
      ljestvica: 'Ljestvica',
    },
    season: 'Sezona',
    mine: 'u postavi',
    /** Pluralised by the count on the tile: "1 izvedba u sezoni", "22 izvedbi u sezoni". */
    total: { one: 'izvedba u sezoni', few: 'izvedbe u sezoni', many: 'izvedbi u sezoni' },
    crni: 'Crna vojska',
    bili: 'Bila vojska',
    byMonth: 'Po mjesecu',
    chartLabel: 'Izvedbe po mjesecu',
    legend: 'Zlatno: u potvrđenoj postavi. Sivo: sve potvrđene izvedbe sezone.',
    roles: 'Uloge',
    times: (count: number) => `${count}×`,
    emptyTitle: 'Još nisi plesao ove sezone',
    emptyBody: 'Prva potvrđena postava pojavit će se ovdje.',
    emptyLink: 'Odgovori na sljedeću izvedbu',
    /**
     * A voditelj without a Member row is not a dancer who has not danced yet
     * (#457 review): the season below is the SOCIETY's, so the line says what
     * is missing and the tiles say whose numbers those are.
     */
    noMember: 'Nemaš povezan profil moreškanta.',
    noMemberBody: 'Ispod su brojke cijele sezone.',
    seasonTotal: 'potvrđenih izvedbi',
    seasonMonths: 'mjeseci s izvedbom',
  },

  /**
   * The Ljestvica, the second panel of the Moje tab (#457, glossary:
   * *Ljestvica*).
   *
   * Every counted noun here is handed to `pluralize` rather than written with a
   * fixed ending: "1 izvedbi do 2. mjesta" would be the kind of sentence that
   * tells a dancer the app was written by somebody who does not speak to them.
   */
  board: {
    /** The small caption under the big "#3": out of how many moreškanata. */
    outOf: (total: number) => `od ${total}`,
    leading: 'Vodiš ljestvicu.',
    toNextPlace: (count: string, place: number) => `Još ${count} do ${place}. mjesta.`,
    nextMilestone: (count: string) => `Sljedeća prekretnica: ${count}`,
    /** The chip on the row of a dancer who danced the whole season. */
    fullSeason: 'puna sezona',
    /** The chip that says which row is the reader's own. */
    you: 'ti',
    /** The caption under a podium tile, so the rank reads as a place and not as a second count. */
    place: (rank: number) => `${rank}. mjesto`,
    confirmedCount: {
      one: 'potvrđena izvedba',
      few: 'potvrđene izvedbe',
      many: 'potvrđenih izvedbi',
    },
    footer: (confirmed: string) =>
      `Broji se samo potvrđena postava. ${confirmed} u sezoni.`,
    empty: 'Ljestvica počinje s prvom potvrđenom postavom.',
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
    admin: 'Administracija',
    members: 'Moreškanti',
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
   */
  answer: {
    coming: 'Dolazim',
    notComing: 'Ne dolazim',
    clear: 'Poništi',
    locked: 'Izvedba je počela, odgovori se više ne mijenjaju.',
    cancelled: 'Izvedba je otkazana.',
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
    moveTo: (army: string) => `Prebaci u ${army}`,
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

    /** The voditelj's half, on `/app/pozivnice`. */
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
     * the same `InstallSteps` component as the banner and `/app/instalacija`,
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
    /** The full-screen guide at `/app/instalacija`, also the QR target. */
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
  },

  /** The voditelj's "Pošalji alarm" control on `/app/izvedba/[id]` (#431). */
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
    failed: 'Postava nije spremljena. Pokušaj ponovno.',
  },

  /** The season scoreboard (#437, glossary: *Dancer statistics*). */
  stats: {
    title: 'Statistika',
    season: 'Sezona',
    dancer: 'Moreškant',
    performances: 'Izvedbi',
    crniKralj: 'Crni kralj',
    biliKralj: 'Bili kralj',
    otmanovic: 'Otmanović',
    bula: 'Bula',
    byKind: 'Po vrsti izvedbe',
    empty: 'U ovoj sezoni još nema potvrđenih postava.',
    noRoster: 'Nema aktivnih moreškanata.',
    hint: 'Broje se samo potvrđene postave. Dodirni redak za razradu po vrsti izvedbe.',
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

  /** The shared calendar subscription (#433, glossary: *Calendar feed*). */
  calendar: {
    body: 'Dodaj ovu poveznicu u Google, Apple ili Outlook kalendar i sve izvedbe su ti u telefonu.',
    copy: 'Kopiraj poveznicu',
    copied: 'Poveznica je kopirana.',
    copyFailed: 'Kopiranje nije uspjelo, označi poveznicu i kopiraj ručno.',
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
      `Izvedba je ${formatPerformanceDate(input.date)} u ${input.time}. Još nisi javio dolaziš li.`,
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
    title: 'Promjena izvedbe',
    cancelledTitle: 'Izvedba je otkazana',
    cancelledBody: (input: { date: string; time: string }) =>
      `Izvedba ${formatPerformanceDate(input.date)} u ${input.time} je otkazana.`,
    body: (input: { date: string; time: string; fields: readonly string[] }) =>
      `Izvedba ${formatPerformanceDate(input.date)} u ${input.time}. Promijenjeno: ${input.fields.join(', ')}.`,
    fields: {
      date: 'datum',
      time: 'vrijeme',
      place: 'mjesto',
      cancelled: 'otkazivanje',
      note: 'poruka voditelja',
    },
    /** The way back: the row was cancelled and is not any more. */
    uncancelled: 'izvedba više nije otkazana',
  },

  /** Type (4): a performance that did not exist a minute ago (story 17). */
  created: {
    title: 'Nova izvedba',
    body: (input: { date: string; time: string; kind: string; place: string }) =>
      `${input.kind}, ${formatPerformanceDate(input.date)} u ${input.time}${
        input.place ? `, ${input.place}` : ''
      }. Javi dolaziš li.`,
  },

  /**
   * A whole season entered at once (#441 review).
   *
   * The bulk-create tool writes twenty-two Redovna shows in a loop; twenty-two
   * separate "nova izvedba" pushes would be a phone buzzing for a minute about
   * a schedule nobody has to answer this instant. One sentence, and the tap
   * lands on the list rather than on any one evening.
   */
  createdBulk: {
    title: 'Nove izvedbe',
    body: (input: { count: number; firstDate: string }) =>
      `U raspored je dodano ${input.count} ${input.count === 1 ? 'nova izvedba' : 'novih izvedbi'}, prva ${formatPerformanceDate(input.firstDate)}.`,
  },

  /** Type (5), to the voditelji only: a "dolazim" withdrawn (story 18). */
  withdrawal: {
    title: 'Netko je odustao',
    someone: 'Moreškant',
    body: (input: { who: string; date: string; time: string }) =>
      `${input.who} više ne dolazi na izvedbu ${formatPerformanceDate(input.date)} u ${input.time}.`,
  },
} as const

/** Croatian labels for the performance kinds (ADR-0024). */
export const KIND_LABELS: Record<PerformanceKind, string> = {
  redovna: 'Redovna',
  dmc: 'Adriatic DMC',
  gulliver: 'Gulliver',
  koncert: 'Koncert',
  ostalo: 'Ostalo',
}

/** Croatian labels for the dance roles; the vocabulary itself lives in lib. */
export const ROLE_LABELS: Record<DanceRole, string> = DANCE_ROLE_LABELS

const WEEKDAYS = [
  'nedjelja',
  'ponedjeljak',
  'utorak',
  'srijeda',
  'četvrtak',
  'petak',
  'subota',
] as const

const MONTHS = [
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
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`
}

/** UTC noon, so no timezone can shift the calendar day out from under a label. */
function atNoon(date: string): Date | null {
  const d = new Date(`${date}T12:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
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

/** "Rujan" from a 1-12 month number; the heading of a month section. */
export function monthLabel(month: number): string {
  return APP_STRINGS.date.months[month - 1] ?? ''
}

/** "ruj" from a 1-12 month number; the bar chart's axis. */
export function shortMonthLabel(month: number): string {
  return APP_STRINGS.date.monthsShort[month - 1] ?? ''
}
