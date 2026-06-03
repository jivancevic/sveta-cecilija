// Generates the Croatian board-facing PDF summary of the TripAdvisor review
// analysis (issue #124), using the same brand kit as the ticket PDF
// (src/lib/email/render-tickets-pdf.tsx): Bodoni Moda SC titles, IBM Plex Mono
// labels, Inter body, stone background, gold rule, the HGD logo.
//
// Run from the repo (or this worktree): `node scripts/generate-tripadvisor-report-pdf.mjs`
// Output: docs/research/moreska-analiza-recenzija.pdf
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToFile,
} from '@react-pdf/renderer'

const h = React.createElement
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FONT_DIR = path.join(ROOT, 'assets', 'fonts', 'email')
const LOGO_PATH = path.join(ROOT, 'assets', 'images', 'cecilija-logo.png')
const OUT = path.join(ROOT, 'docs', 'research', 'moreska-analiza-recenzija.pdf')

// Brand tokens — mirror render-tickets-pdf.tsx.
const BG = '#F5F2EC'
const INK = '#1A140C'
const GOLD = '#B8881A'
const MUTED = '#6B5E45'

Font.register({ family: 'BodoniModaSC', src: path.join(FONT_DIR, 'BodoniModaSC-Regular.ttf') })
Font.register({
  family: 'IBMPlexMono',
  fonts: [
    { src: path.join(FONT_DIR, 'IBMPlexMono-Regular.ttf') },
    { src: path.join(FONT_DIR, 'IBMPlexMono-Bold.ttf'), fontWeight: 700 },
  ],
})
Font.register({ family: 'Inter', src: path.join(FONT_DIR, 'Inter-Regular.ttf') })
// Keep "moreška", proper names and short labels intact.
Font.registerHyphenationCallback((word) => [word])

const s = StyleSheet.create({
  page: {
    backgroundColor: BG,
    color: INK,
    fontFamily: 'Inter',
    fontSize: 10.5,
    lineHeight: 1.45,
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 54,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottom: `1pt solid ${GOLD}`,
    marginBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 30, height: 38, marginRight: 12 },
  org: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 2, color: MUTED },
  headerRight: { fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 1, color: MUTED, textAlign: 'right' },
  title: { fontFamily: 'BodoniModaSC', fontSize: 21, letterSpacing: 1.5, lineHeight: 1.15, color: INK, marginBottom: 7 },
  subtitle: { fontFamily: 'IBMPlexMono', fontSize: 8.5, letterSpacing: 1.5, color: GOLD, marginBottom: 13 },
  lead: { fontFamily: 'Inter', fontSize: 10.5, color: INK, marginBottom: 7 },
  sectionTitle: {
    fontFamily: 'BodoniModaSC',
    fontSize: 14,
    letterSpacing: 1,
    color: INK,
    marginTop: 9,
    marginBottom: 5,
  },
  para: { fontFamily: 'Inter', fontSize: 10.5, color: INK, marginBottom: 5 },
  bulletRow: { flexDirection: 'row', marginBottom: 4, paddingRight: 6 },
  bulletMark: { fontFamily: 'IBMPlexMono', fontSize: 10.5, color: GOLD, width: 16 },
  bulletText: { fontFamily: 'Inter', fontSize: 10.5, color: INK, flex: 1 },
  numRow: { flexDirection: 'row', marginBottom: 6, paddingRight: 6 },
  numMark: { fontFamily: 'IBMPlexMono', fontSize: 10.5, fontWeight: 700, color: GOLD, width: 18 },
  strong: { fontFamily: 'IBMPlexMono', fontWeight: 700, color: INK },
  note: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    color: MUTED,
    marginTop: 16,
    paddingTop: 10,
    borderTop: `0.5pt solid ${MUTED}`,
  },
  footer: {
    position: 'absolute',
    bottom: 26,
    left: 54,
    right: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5pt solid ${GOLD}`,
    paddingTop: 6,
  },
  footerText: { fontFamily: 'IBMPlexMono', fontSize: 7, letterSpacing: 1, color: MUTED },
})

const bullet = (text, key) =>
  h(View, { style: s.bulletRow, key, wrap: false }, [
    h(Text, { style: s.bulletMark, key: 'm' }, '•'),
    h(Text, { style: s.bulletText, key: 't' }, text),
  ])

// `parts` is an array of strings / {b: '...'} bold spans for inline emphasis.
const numItem = (n, parts, key) =>
  h(View, { style: s.numRow, key, wrap: false }, [
    h(Text, { style: s.numMark, key: 'm' }, `${n}.`),
    h(
      Text,
      { style: s.bulletText, key: 't' },
      parts.map((p, i) =>
        typeof p === 'string' ? p : h(Text, { style: s.strong, key: i }, p.b),
      ),
    ),
  ])

const Header = (key) =>
  h(View, { style: s.header, key, fixed: true }, [
    h(View, { style: s.headerLeft, key: 'l' }, [
      h(Image, { style: s.logo, src: LOGO_PATH, key: 'logo' }),
      h(Text, { style: s.org, key: 'org' }, 'HGD SVETA CECILIJA'),
    ]),
    h(Text, { style: s.headerRight, key: 'r' }, 'INTERNI DOKUMENT\nZA UPRAVU'),
  ])

const Footer = () =>
  h(View, { style: s.footer, fixed: true }, [
    h(Text, { style: s.footerText, key: 'l' }, 'moreska.eu'),
    h(Text, { style: s.footerText, key: 'r' }, 'Analiza recenzija · TripAdvisor · lipanj 2026.'),
  ])

const doc = h(
  Document,
  {
    title: 'Analiza recenzija moreške (TripAdvisor)',
    author: 'HGD Sveta Cecilija',
    subject: 'Sažetak posjetiteljskih recenzija za Upravu',
  },
  h(Page, { size: 'A4', style: s.page }, [
    Header('hdr'),

    h(Text, { style: s.title, key: 'title' }, 'Analiza posjetiteljskih recenzija'),
    h(Text, { style: s.subtitle, key: 'sub' }, 'MOREŠKA · SAŽETAK ZA UPRAVU HGD-a SVETA CECILIJA'),

    h(
      Text,
      { style: s.lead, key: 'lead' },
      'Ovaj dokument sažima sve javne recenzije moreške objavljene na turističkom portalu TripAdvisoru: ukupno 161 recenziju iz razdoblja od 2011. do 2025. godine, uz prosječnu ocjenu 4,3 od 5. Recenzije smo sustavno pročitali i grupirali po temama kako bismo vidjeli što posjetitelji najviše cijene, a što ih najčešće smeta. To je najbogatiji izvor iskrenih povratnih informacija o samom doživljaju predstave koji imamo, a do sada nije sustavno analiziran. Cilj je te informacije pretvoriti u konkretna, provediva poboljšanja uoči sezone 2026.',
    ),

    h(Text, { style: s.sectionTitle, key: 'keep-t' }, 'Što već dobro funkcionira (zadržati)'),
    h(
      Text,
      { style: s.para, key: 'keep-p' },
      'Ovo se u recenzijama hvali iznova i čini srž doživljaja. Svaku promjenu ritma ili izvedbe treba osmisliti tako da ovo ne ugrozi.',
    ),
    bullet(
      'Borba mačevima uživo: pravi mačevi, zveket, iskre, ponekad i prava krv. To je vrhunac predstave i najveći razlog oduševljenih ocjena.',
      'k1',
    ),
    bullet(
      'Autentičnost i živa tradicija: "jedino mjesto na svijetu", prenosi se s koljena na koljeno, izvode je mještani volonteri. Gostima je važno što je stvarna, a ne turistička rekonstrukcija.',
      'k2',
    ),
    bullet('Kostimi i ambijent staroga grada u večernjim satima.', 'k3'),
    bullet('Trajanje od otprilike sat vremena većini odgovara.', 'k4'),

    h(Text, { style: s.sectionTitle, key: 'prob-t' }, 'Glavni problemi (rangirani po učestalosti)'),
    numItem(
      1,
      [
        { b: 'Ritam predstave' },
        ' je daleko najčešća zamjerka i najviše povezana s niskim ocjenama. Predstava "vuče" i djeluje repetitivno, a posebno se uvodni dio (klapsko pjevanje i duga najava) doživljava kao spor, do te mjere da neki gledatelji zadrijemaju prije početka borbe. Važno: sama borba mačevima nije problem, problem je početak.',
      ],
      'p1',
    ),
    numItem(
      2,
      [
        { b: 'Razumijevanje radnje.' },
        ' Duga višejezična najava istovremeno je preduga i gledatelje koji ne razumiju jezik ostavlja zbunjenima ("nisam znao što se događa"). Pomoćni letak s opisom radnje pomaže onima koji ga dobiju, ali se ne dijeli redovito.',
      ],
      'p2',
    ),
    numItem(
      3,
      [
        { b: 'Sjedala i vidljivost.' },
        ' Najčešći savjet u cijelom skupu recenzija je "kupite unaprijed i dođite ranije zbog dobrog mjesta". To je znak da posjetitelji o tome nisu dovoljno informirani pri kupnji ulaznice.',
      ],
      'p3',
    ),
    numItem(
      4,
      [
        { b: 'Sigurnost u prvom redu.' },
        ' Gledatelji jedni druge upozoravaju na iskre i komadiće mačeva koji znaju odletjeti te na pravu krv. Danas se to prenosi "od usta do usta"; trebala bi to biti jasna napomena unaprijed (može se predstaviti i kao dio uzbuđenja).',
      ],
      'p4',
    ),
    numItem(
      5,
      [
        { b: 'Cijena i vrijednost.' },
        ' "Preskupo" se gotovo uvijek pojavljuje zajedno s "predugo" ili "repetitivno", rijetko samostalno. Riječ je prije svega o očekivanjima, ne o samoj cijeni. Nekolicina je tražila i obiteljsku cijenu (dječja ulaznica već iznosi 10 €, što treba bolje istaknuti).',
      ],
      'p5',
    ),
    h(
      Text,
      { style: s.para, key: 'prob-rest' },
      'Rjeđe, ali stvarne zamjerke: lokaciju je teško pronaći (nema oznaka), buka iz obližnjih kafića remeti atmosferu, a manjina predstavu doživljava kao "previše turističku".',
    ),

    Footer(),
  ]),

  h(Page, { size: 'A4', style: s.page }, [
    Header('hdr2'),

    h(Text, { style: s.sectionTitle, key: 'act-t' }, 'Preporučene radnje (rangirane)'),
    h(
      Text,
      { style: s.para, key: 'act-p' },
      'Poredano po učestalosti problema, mogućnosti da na njega utječemo i trošku. Prve tri su jeftine i odnose se uglavnom na komunikaciju s gostima, a nova internetska stranica i sustav prodaje ulaznica (moreska.eu) već ih mogu provesti prije glavne sezone.',
    ),
    numItem(
      1,
      [
        { b: 'Postaviti očekivanja pri kupnji i na stranici s ulaznicama.' },
        ' Navesti trajanje (oko sat vremena), strukturu (zbor i orkestar, zatim najava, zatim borba mačevima) te poruku "dođite ranije za bolje mjesto". Ovo jednim potezom ublažava probleme 1, 3 i 5: većina prigovora na duljinu, cijenu i sjedala dolazi iz neusklađenih očekivanja, a ne iz same predstave.',
      ],
      'a1',
    ),
    numItem(
      2,
      [
        { b: 'Riješiti razumijevanje radnje višejezičnim digitalnim programom.' },
        ' Iza QR koda (na ulaznici ili na oznakama) staviti radnju (crveni i crni kralj, princeza), kratak vodič po dijelovima i povijest, na više jezika. Time se uvodna najava može i skratiti, jer detalji žive u programu, što pomaže i problemu ritma.',
      ],
      'a2',
    ),
    numItem(
      3,
      [
        { b: 'Dodati blok "kako do nas i što očekivati".' },
        ' U potvrdu kupnje i na stranicu staviti kartu, upute za dolazak od poznatih točaka u starom gradu, vrijeme početka i ljubaznu napomenu o prvom redu. Time se uz gotovo nikakav trošak rješavaju problemi sigurnosti i pronalaska lokacije.',
      ],
      'a3',
    ),
    numItem(
      4,
      [
        { b: 'Skratiti uvod, ne borbu.' },
        ' Operativno, na strani društva: skratiti pjevačko-najavni dio prije plesa ili ga jasno predstaviti kao zaseban uvodni nastup, da energija ne padne prije mačeva. Borbu mačevima treba zaštititi, jer je upravo ona ono što gosti najviše vole.',
      ],
      'a4',
    ),
    numItem(
      5,
      [
        { b: 'Istaknuti da dječja ulaznica košta 10 €' },
        ' svuda gdje se spominje obitelj ili cijena, kako bi se upiti o obiteljskim cijenama riješili boljom vidljivošću.',
      ],
      'a5',
    ),

    h(
      Text,
      { style: s.note, key: 'note' },
      'O izvoru: jednokratno čitanje javnih recenzija s portala TripAdvisor (bez automatiziranog prikupljanja), zadana lista na engleskom jeziku obuhvaća 161 od ukupno oko 200 recenzija na svim jezicima. Brojke su okvirne, ali poredak tema je pouzdan jer se glavne teme ponavljaju kod desetaka različitih gostiju kroz više godina. Detaljna verzija s citatima dostupna je razvojnom timu (interni dokument).',
    ),

    Footer(),
  ]),
)

await renderToFile(doc, OUT)
console.log(`PDF written: ${OUT}`)
