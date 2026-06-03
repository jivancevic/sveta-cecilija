// Generates the IN-DEPTH Croatian board PDF for the TripAdvisor review
// analysis (issue #124) — the long version for the voditelj + developer to
// work through. Same brand kit as the summary (generate-tripadvisor-report-pdf.mjs)
// and the ticket PDF: Bodoni Moda SC titles, IBM Plex Mono labels, Inter body,
// HGD logo, stone/gold palette.
//
// Single flowing Page: header + footer are absolute & fixed so they repeat on
// every auto-paginated page; footer carries a page number.
//
// Run: `node scripts/generate-tripadvisor-report-pdf-indepth.mjs`
// Output: docs/research/moreska-analiza-recenzija-detaljno.pdf
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
const OUT = path.join(ROOT, 'docs', 'research', 'moreska-analiza-recenzija-detaljno.pdf')

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
Font.registerHyphenationCallback((word) => [word])

const s = StyleSheet.create({
  page: {
    backgroundColor: BG,
    color: INK,
    fontFamily: 'Inter',
    fontSize: 10,
    lineHeight: 1.45,
    paddingTop: 92,
    paddingBottom: 56,
    paddingHorizontal: 54,
  },
  header: {
    position: 'absolute',
    top: 36,
    left: 54,
    right: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottom: `1pt solid ${GOLD}`,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 28, height: 35, marginRight: 11 },
  org: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 2, color: MUTED },
  headerRight: { fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 1, color: MUTED, textAlign: 'right' },

  title: { fontFamily: 'BodoniModaSC', fontSize: 22, letterSpacing: 1.5, lineHeight: 1.15, color: INK, marginBottom: 6 },
  subtitle: { fontFamily: 'IBMPlexMono', fontSize: 8.5, letterSpacing: 1.5, color: GOLD, marginBottom: 14 },

  h2: { fontFamily: 'BodoniModaSC', fontSize: 15, letterSpacing: 1, color: INK, marginTop: 16, marginBottom: 7 },
  h3: { fontFamily: 'IBMPlexMono', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: INK, marginTop: 11, marginBottom: 4 },

  para: { fontFamily: 'Inter', fontSize: 10, color: INK, marginBottom: 6 },
  strong: { fontFamily: 'IBMPlexMono', fontWeight: 700, color: INK },
  em: { color: MUTED },

  bulletRow: { flexDirection: 'row', marginBottom: 4, paddingRight: 4 },
  bulletMark: { fontFamily: 'IBMPlexMono', fontSize: 10, color: GOLD, width: 15 },
  bulletText: { fontFamily: 'Inter', fontSize: 10, color: INK, flex: 1 },
  numMark: { fontFamily: 'IBMPlexMono', fontSize: 10, fontWeight: 700, color: GOLD, width: 18 },

  // Quote block: gold left rule, HR gloss on top, English original + attribution muted below.
  quote: { borderLeft: `2pt solid ${GOLD}`, paddingLeft: 10, marginTop: 5, marginBottom: 7 },
  quoteHr: { fontFamily: 'Inter', fontSize: 9.5, color: INK },
  quoteSrc: { fontFamily: 'Inter', fontSize: 8.5, color: MUTED, marginTop: 1 },
  quoteAttr: { fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 0.5, color: GOLD, marginTop: 2 },

  // Theme header row: big number + title.
  themeHead: { flexDirection: 'row', alignItems: 'baseline', marginTop: 15, marginBottom: 3 },
  themeNum: { fontFamily: 'BodoniModaSC', fontSize: 17, color: GOLD, width: 26 },
  themeTitle: { fontFamily: 'BodoniModaSC', fontSize: 14, letterSpacing: 0.5, color: INK, flex: 1 },
  control: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 0.5, color: MUTED, marginTop: 2, marginBottom: 4 },

  // Table.
  tRow: { flexDirection: 'row', borderBottom: `0.5pt solid ${MUTED}`, paddingVertical: 4 },
  tRowHead: { flexDirection: 'row', borderBottom: `1pt solid ${GOLD}`, paddingBottom: 4, marginTop: 4 },
  tTheme: { width: '46%', fontFamily: 'Inter', fontSize: 9, color: INK, paddingRight: 8 },
  tCtrl: { width: '20%', fontFamily: 'IBMPlexMono', fontSize: 8.5, color: INK },
  tLever: { width: '34%', fontFamily: 'Inter', fontSize: 9, color: MUTED },
  tHeadCell: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1, color: MUTED },

  note: { fontFamily: 'Inter', fontSize: 8.5, color: MUTED, marginTop: 4 },

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

// ---- helpers ----
const para = (parts, key, style) =>
  h(
    Text,
    { style: style || s.para, key },
    Array.isArray(parts)
      ? parts.map((p, i) => (typeof p === 'string' ? p : h(Text, { style: p.em ? s.em : s.strong, key: i }, p.b || p.em)))
      : parts,
  )

const bullet = (text, key) =>
  h(View, { style: s.bulletRow, key, wrap: false }, [
    h(Text, { style: s.bulletMark, key: 'm' }, '•'),
    h(Text, { style: s.bulletText, key: 't' }, text),
  ])

const numItem = (n, parts, key) =>
  h(View, { style: s.bulletRow, key, wrap: false }, [
    h(Text, { style: s.numMark, key: 'm' }, `${n}.`),
    h(
      Text,
      { style: s.bulletText, key: 't' },
      parts.map((p, i) => (typeof p === 'string' ? p : h(Text, { style: s.strong, key: i }, p.b))),
    ),
  ])

// q: { hr, en, attr }
const quote = (q, key) =>
  h(View, { style: s.quote, key, wrap: false }, [
    h(Text, { style: s.quoteHr, key: 'hr' }, `„${q.hr}”`),
    q.en ? h(Text, { style: s.quoteSrc, key: 'en' }, `izvornik: “${q.en}”`) : null,
    h(Text, { style: s.quoteAttr, key: 'a' }, q.attr),
  ])

const themeHead = (n, title, control, key) => [
  h(View, { style: s.themeHead, key: `${key}-h`, wrap: false }, [
    h(Text, { style: s.themeNum, key: 'n' }, `${n}`),
    h(Text, { style: s.themeTitle, key: 't' }, title),
  ]),
  h(Text, { style: s.control, key: `${key}-c` }, control),
]

const Header = h(View, { style: s.header, fixed: true }, [
  h(View, { style: s.headerLeft, key: 'l' }, [
    h(Image, { style: s.logo, src: LOGO_PATH, key: 'logo' }),
    h(Text, { style: s.org, key: 'org' }, 'HGD SVETA CECILIJA'),
  ]),
  h(Text, { style: s.headerRight, key: 'r' }, 'INTERNI DOKUMENT · DETALJNA ANALIZA\nZA VODITELJA I UPRAVU\nPRIPREMIO: JOSIP IVANČEVIĆ'),
])

const Footer = h(View, { style: s.footer, fixed: true }, [
  h(Text, { style: s.footerText, key: 'l' }, 'moreska.eu · Analiza recenzija (TripAdvisor) · lipanj 2026.'),
  h(
    Text,
    {
      style: s.footerText,
      key: 'r',
      render: ({ pageNumber, totalPages }) => `str. ${pageNumber} / ${totalPages}`,
    },
    '',
  ),
])

const body = [
  Header,
  Footer,

  h(Text, { style: s.title, key: 'title' }, 'Analiza posjetiteljskih recenzija: detaljna verzija'),
  h(Text, { style: s.subtitle, key: 'sub' }, 'MOREŠKA · RADNI DOKUMENT ZA VODITELJA I RAZVOJ'),

  para(
    'Ovo je proširena, radna verzija analize namijenjena detaljnoj raspravi. Sažeta verzija (za cijelu Upravu) sadrži samo glavne zaključke; ovdje su dodani metodologija, okvirna raspodjela ocjena, sve teme s reprezentativnim citatima gostiju (izvornik na engleskom i hrvatski prijevod, uz ocjenu i godinu), tablica „pod našom kontrolom / nije” te detaljnije preporuke s procjenom truda i mjestom provedbe.',
    'lead',
  ),

  // --- Metodologija ---
  h(Text, { style: s.h2, key: 'm-h' }, 'Metodologija i opseg'),
  bullet('Izvor: službena (preuzeta) stranica moreške na portalu TripAdvisor.', 'm1'),
  bullet(
    'Prikupljanje: jednokratno čitanje javnih recenzija (lipanj 2026.). Nije postavljen nikakav automatski „scraper”, u skladu s uvjetima korištenja portala i zahtjevom zadatka.',
    'm2',
  ),
  bullet(
    'Opseg: 161 recenzija u zadanom (engleskom) prikazu, uz dodatni uzorak recenzija na njemačkom, talijanskom i francuskom (ukupno portal navodi oko 200 na svim jezicima). Recenzije na drugim jezicima potvrđuju isti poredak tema (vidi odjeljak na kraju).',
    'm3',
  ),
  bullet('Razdoblje: od kolovoza 2011. do rujna 2025. (oko 14 godina). Prosječna ocjena: 4,3 od 5.', 'm4'),
  bullet(
    'Obrada: svaka recenzija razvrstana je po temi, označena prema raspoloženju (pozitivno/negativno) te po novosti, kako bismo razlikovali kronične probleme od pojedinačnih.',
    'm5',
  ),
  para(
    [
      { b: 'Napomena o pouzdanosti: ' },
      'brojke u nastavku su okvirne (tekst je čitan kroz sažimajući alat, ne kao precizni izvoz polje-po-polje). Poredak tema je pouzdan jer se glavne teme ponavljaju kod desetaka različitih gostiju kroz više godina; apsolutne brojke shvatite kao indikativne.',
    ],
    'm-note',
  ),

  // --- Raspodjela ocjena ---
  h(Text, { style: s.h2, key: 'r-h' }, 'Gdje je signal: raspodjela ocjena'),
  para(
    'Raspodjela prati prosjek od 4,3. Velika većina recenzija je 4★ i 5★. Gotovo sav iskoristiv signal za poboljšanja nalazi se u otprilike 25–30 recenzija s ocjenom 1–3★ (oko 17%) te u zamjerkama „sakrivenima” unutar inače pozitivnih recenzija. Upravo te recenzije čine osnovu ovog izvještaja.',
    'r-p',
  ),
  para(
    [
      { em: 'Okvirna raspodjela (indikativno): 5★ ~ pola recenzija, 4★ ~ četvrtina, 3★ ~ desetina, 1–2★ ~ manji udio. Visok prosjek znači da je proizvod dobar; cilj nije „popraviti” predstavu, nego ukloniti nekoliko ponovljivih frustracija koje spuštaju dio gostiju s 5 na 3 zvjezdice.' },
    ],
    'r-p2',
  ),

  // --- Što funkcionira ---
  h(Text, { style: s.h2, key: 'k-h' }, 'Što već dobro funkcionira (zaštititi)'),
  para('Ovo se hvali iznova i čini srž doživljaja. Svaku promjenu ritma ili izvedbe treba osmisliti tako da ovo ostane netaknuto.', 'k-p'),
  bullet('Borba mačevima uživo: pravi mačevi, zveket, iskre, ponekad i prava krv. Najveći razlog oduševljenih ocjena.', 'k1'),
  bullet('Autentičnost i živa tradicija: „jedino mjesto na svijetu”, prenosi se s koljena na koljeno, izvode je mještani volonteri.', 'k2'),
  bullet('Kostimi i ambijent staroga grada navečer.', 'k3'),
  bullet('Trajanje od otprilike sat vremena većini odgovara.', 'k4'),
  quote({ hr: 'Precizni balet s mačevima!', en: 'Precision Ballet with Swords!', attr: 'OCJENA 5★' }, 'kq1'),
  quote(
    { hr: 'Iskre lete s mačeva, stvarno su se dali.', en: 'sparks flying from the swords ... they really went for it', attr: 'OCJENA 4★ · 2025.' },
    'kq2',
  ),

  // --- Teme ---
  h(Text, { style: s.h2, key: 't-h' }, 'Detaljne teme (rangirane po učestalosti)'),

  // Tema 1
  ...themeHead(1, 'Ritam: predstava „vuče”, repetitivna je i sporo počinje', 'POD NAŠOM KONTROLOM: uvod DA · sama borba DJELOMIČNO (tradicija)', 't1'),
  para(
    'Daleko najčešća zamjerka i najjače povezana s niskim ocjenama. Ima dva odvojena uzroka koja gosti sami razlikuju: (a) koreografija borbe djeluje repetitivno kad prođe prvi dojam i (b) uvodni dio (klapsko pjevanje i duga najava) jest mjesto gdje gosti gube pažnju. Ista uvodna glazba nekima je „božanstvena”, pa je riječ o polarizirajućem dijelu, ne o nečemu što je jednoznačno loše. Sigurna poluga je skraćivanje početka i postavljanje očekivanja, a ne uklanjanje tradicije.',
    't1p',
  ),
  quote({ hr: 'Ponavljali su isti ples 45 minuta.', en: 'repeated the same dance for 45 minutes', attr: 'OCJENA 1★ · 2017.' }, 't1q1'),
  quote(
    { hr: 'Sporo počinje, a onda sve isto ... potpuno razočaravajuće, kakva šteta novca.', en: 'Slow to start then very much the same ... totally deflated feeling what a waste of money', attr: 'OCJENA 2★ · 2013.' },
    't1q2',
  ),
  quote(
    { hr: 'Pjevanje prije predstave bilo je dosadno i potpuno nepotrebno.', en: 'the local singing before the event was boring and completely unnecessary', attr: 'OCJENA 3★ · 2016.' },
    't1q3',
  ),
  quote(
    { hr: 'Pomalo predugo i repetitivno; verzija od 30 minuta bila bi idealna.', en: 'a bit long and repetetive ... a 30-minute version would be ideal', attr: 'OCJENA 3★ · 2012.' },
    't1q4',
  ),

  // Tema 2
  ...themeHead(2, 'Razumijevanje radnje i najava', 'POD NAŠOM KONTROLOM: DA', 't2'),
  para(
    'Ponavlja se kroz sve razine ocjena. Duga višejezična najava istovremeno je preduga i goste koji ne razumiju jezik ostavlja zbunjenima. Ondje gdje je korišten pomoćni letak / podsjetnik, gosti su ga voljeli i razumjeli predstavu, ali se ne dijeli pouzdano.',
    't2p',
  ),
  quote({ hr: 'Duga objašnjenja na šest jezika.', en: 'lengthy descriptions in 6 languages', attr: 'OCJENA 5★ · 2023.' }, 't2q1'),
  quote({ hr: 'Nije se moglo razabrati što se govori.', en: 'unintelligible dialogue', attr: 'OCJENA 3★ · 2014.' }, 't2q2'),
  quote({ hr: 'Nitko nije ponudio ni spomenuo te knjižice.', en: 'no one offered or mentioned these', attr: 'OCJENA 5★ · 2018.' }, 't2q3'),
  quote({ hr: 'Ne dobije se čak ni letak.', en: 'not even a panflet is given', attr: 'OCJENA 3★ · 2012.' }, 't2q4'),

  // Tema 3
  ...themeHead(3, 'Sjedala, vidljivost i prevelika prodaja', 'POD NAŠOM KONTROLOM: DA (komunikacija + sustav)', 't3'),
  para(
    'Najčešći pojedinačni savjet u cijelom skupu recenzija je „kupite unaprijed i dođite ranije zbog dobrog mjesta”. To je jasan znak da posjetitelji o tome nisu dovoljno informirani pri kupnji. Njemački gosti idu i korak dalje: navode da je prodano više ulaznica nego što ima sjedala, pa publika stoji ili je „natiskana na stepenicama”.',
    't3p',
  ),
  para(
    [
      { b: 'Dobra vijest: ' },
      'novi sustav prodaje ulaznica (moreska.eu) ograničava prodaju na kapacitet dvorane, pa strukturno uklanja prekomjernu prodaju koja se događala pri prodaji na ulazu. To je konkretna prednost novog sustava nad dosadašnjim načinom.',
    ],
    't3p2',
  ),
  quote({ hr: 'Dođite ranije zbog dobrog mjesta.', en: 'arrive early for good seating', attr: 'PONAVLJA SE U DESECIMA RECENZIJA' }, 't3q1'),
  quote({ hr: 'Prodano je više ulaznica nego što ima sjedala; publika je natiskana na stepenicama.', en: 'mehr Tickets verkauft als Sitzplätze ... auf den Stufen gequetscht', attr: 'OCJENA 3★ · 2013. (njemački)' }, 't3q2'),

  // Tema 4
  ...themeHead(4, 'Sigurnost u prvom redu je iznenađenje, a ne najava', 'POD NAŠOM KONTROLOM: DA', 't4'),
  para(
    'Gosti jedni druge upozoravaju na iskre i komadiće mačeva koji odlijeću te na pravu krv; djecu to zna uplašiti. Danas se prenosi „od usta do usta”, a trebala bi to biti jasna napomena unaprijed. Može se predstaviti i kao dio uzbuđenja.',
    't4p',
  ),
  quote({ hr: 'Komadići mačeva znaju odletjeti, nemojte u prvi red.', en: 'fragments from the swords ... [avoid] the front row', attr: 'OCJENA 5★ · 2018.' }, 't4q1'),
  quote({ hr: 'Stvarno je potekla krv, bez šale!', en: 'Real blood ... no kidding!', attr: 'OCJENA 5★ · 2018.' }, 't4q2'),

  // Tema 5
  ...themeHead(5, 'Cijena i vrijednost', 'POD NAŠOM KONTROLOM: DA (neizravno, preko očekivanja)', 't5'),
  para(
    '„Preskupo” se gotovo uvijek pojavljuje zajedno s „predugo” ili „repetitivno”, rijetko samostalno. Riješi li se dojam ritma i postave li se očekivanja o trajanju, otpada većina prigovora na cijenu. Dvoje je tražilo i obiteljsku cijenu. Napomena: dječja ulaznica već iznosi 10 €, pa je riječ o vidljivosti, ne o cijeni (cijene su fiksne).',
    't5p',
  ),
  quote(
    { hr: '20 $ ... preskupo, uz raštiman bend i vrlo repetitivno.', en: '$20 ... overpriced ... out of tune [band] ... very repetitive', attr: 'OCJENA 3★ · 2014.' },
    't5q1',
  ),
  quote({ hr: 'Ništa posebno ... ne bih to platio.', en: 'Nothing special ... not something I would pay to go', attr: 'OCJENA 2★ · 2013.' }, 't5q2'),

  // Tema 6
  ...themeHead(6, 'Lokaciju je teško pronaći', 'POD NAŠOM KONTROLOM: DA', 't6'),
  para('Čista zamjerka na snalaženje i oznake, jeftino za riješiti.', 't6p'),
  quote(
    { hr: 'Nema nijednog znaka koji bi pokazao gdje se održava. Jako teško za pronaći!', en: 'not 1 sign to tell you where it is being held. Pretty hard to find!', attr: 'OCJENA 5★ · 2023.' },
    't6q1',
  ),

  // Tema 7
  ...themeHead(7, 'Buka iz obližnjih kafića', 'POD NAŠOM KONTROLOM: DJELOMIČNO', 't7'),
  para('Manje učestalo, ali stvarno kvari atmosferu večernje izvedbe na otvorenom.', 't7p'),
  quote({ hr: 'Pop glazba iz obližnjeg restorana ometa doživljaj.', en: 'pop music from a nearby restaurant does interfere', attr: 'OCJENA 5★ · 2015.' }, 't7q1'),
  quote({ hr: 'Karaoke bar tik do remetio je nastup.', en: 'the karaoke bar just outside ... intruded on the performance', attr: 'OCJENA 5★ · 2015.' }, 't7q2'),

  // Tema 8
  ...themeHead(8, '„Previše turistički / bez strasti” (manjina)', 'POD NAŠOM KONTROLOM: DJELOMIČNO', 't8'),
  para(
    'Manji broj gostiju doživio je predstavu kao „postavljenu za turiste”, „robotsku” ili „neautentičnu”; netko žali za prelaskom s besplatnih izvedbi unutar zidina na plaćenu pozornicu izvan starog grada. To se kosi s dominantnom pohvalom autentičnosti, pa je riječ o percepciji kod dijela publike, ne o sustavnom problemu. Rješava se naglašavanjem priče o autentičnosti u komunikaciji.',
    't8p',
  ),
  quote(
    { hr: 'Nedostajalo je strasti, djelovalo je kao predstava za turiste.', en: 'lacked passion and felt like a show put on for the tourists', attr: 'OCJENA 3★ · 2016.' },
    't8q1',
  ),
  quote(
    { hr: 'Šteta što se prešlo s besplatnih izvedbi unutar zidina na plaćenu pozornicu izvan starog grada.', en: 'lamented the shift from free performances within the city walls to a paid commercial stage', attr: 'OCJENA 3★ · 2019.' },
    't8q2',
  ),

  // --- Tablica ---
  h(Text, { style: s.h2, key: 'tab-h' }, 'Pod našom kontrolom ili ne'),
  h(View, { style: s.tRowHead, key: 'tab-head', wrap: false }, [
    h(Text, { style: [s.tTheme, s.tHeadCell], key: 'a' }, 'TEMA'),
    h(Text, { style: [s.tCtrl, s.tHeadCell], key: 'b' }, 'KONTROLA'),
    h(Text, { style: [s.tLever, s.tHeadCell], key: 'c' }, 'POLUGA'),
  ]),
  ...[
    ['Spor/repetitivan uvod (1)', 'DA', 'Skratiti uvod; postaviti očekivanja'],
    ['Repetitivna borba (1)', 'Djelomično', 'Upravljati očekivanjima; ne dirati srž'],
    ['Razumijevanje radnje (2)', 'DA', 'QR program, titlovi, redovito dijeliti letak'],
    ['Sjedala / „dođite ranije” (3)', 'DA', 'Komunicirati pri kupnji i u potvrdi'],
    ['Sigurnost u prvom redu (4)', 'DA', 'Napomena pri kupnji i oznaka na licu mjesta'],
    ['Percepcija cijene (5)', 'Neizravno', 'Postaviti očekivanja; istaknuti dječju cijenu'],
    ['Teško pronaći lokaciju (6)', 'DA', 'Karta/upute u potvrdi + oznake'],
    ['Buka susjednih lokala (7)', 'Djelomično', 'Uskladiti vrijeme sa susjedima'],
    ['Percepcija „turistički” (8)', 'Djelomično', 'Naglasiti priču o autentičnosti'],
    ['Vrućina / otvoreni prostor', 'Uglavnom ne', 'Sitnice: voda, vrijeme početka'],
    ['Osobni ukus (ples/pjevanje)', 'NE', 'Inherentno'],
  ].map((r, i) =>
    h(View, { style: s.tRow, key: `tr${i}`, wrap: false }, [
      h(Text, { style: s.tTheme, key: 'a' }, r[0]),
      h(Text, { style: s.tCtrl, key: 'b' }, r[1]),
      h(Text, { style: s.tLever, key: 'c' }, r[2]),
    ]),
  ),

  // --- Preporuke ---
  h(Text, { style: s.h2, key: 'rec-h' }, 'Preporučene radnje (detaljno)'),
  para(
    'Poredano po učestalosti problema, mogućnosti utjecaja i trošku. Prve tri su jeftine, uglavnom komunikacijske, i nova stranica (moreska.eu) ih može provesti prije sezone. Uz svaku je naznačeno koji problem rješava, gdje se provodi i okvirni trud.',
    'rec-p',
  ),

  h(Text, { style: s.h3, key: 'rec1-h' }, '1 · Postaviti očekivanja pri kupnji i na stranici s ulaznicama'),
  para('Navesti trajanje (~1 h), strukturu (zbor i orkestar → najava → borba mačevima) i poruku „dođite ranije za bolje mjesto”.', 'rec1a'),
  bullet('Rješava: teme 1, 3 i 5 odjednom (duljina, sjedala, cijena dolaze iz neusklađenih očekivanja).', 'rec1b'),
  bullet('Gdje: stranica /tickets i stranica potvrde kupnje (checkout/confirmation).', 'rec1c'),
  bullet('Trud: nizak (tekst + nekoliko redaka u sučelju). Vlasnik: razvoj.', 'rec1d'),

  h(Text, { style: s.h3, key: 'rec2-h' }, '2 · Višejezični digitalni program iza QR koda'),
  para('Radnja (crveni i crni kralj, princeza), kratak vodič po dijelovima i povijest, na više jezika; QR na ulaznici i na oznakama.', 'rec2a'),
  bullet('Rješava: temu 2 (razumijevanje) i pomaže temi 1: kad detalji žive u programu, uvodna najava može se skratiti.', 'rec2b'),
  bullet('Gdje: iskoristiti postojeću QR/scan infrastrukturu; nova stranica s programom.', 'rec2c'),
  bullet('Trud: srednji (sadržaj + prijevodi + jednostavna stranica). Vlasnik: razvoj + sadržaj društva.', 'rec2d'),

  h(Text, { style: s.h3, key: 'rec3-h' }, '3 · Blok „kako do nas i što očekivati”'),
  para('U potvrdu kupnje i na stranicu dodati kartu, upute za dolazak od poznatih točaka u starom gradu, vrijeme početka i ljubaznu napomenu o prvom redu.', 'rec3a'),
  bullet('Rješava: teme 4 (sigurnost) i 6 (pronalazak lokacije).', 'rec3b'),
  bullet('Gdje: e-mail potvrde + stranica s ulaznicama/lokacijom.', 'rec3c'),
  bullet('Trud: nizak. Vlasnik: razvoj.', 'rec3d'),

  h(Text, { style: s.h3, key: 'rec4-h' }, '4 · Skratiti uvod, ne borbu'),
  para('Operativno (na strani društva): skratiti pjevačko-najavni dio ili ga jasno predstaviti kao zaseban uvodni nastup, da energija ne padne prije mačeva. Borbu zaštititi, to gosti najviše vole.', 'rec4a'),
  bullet('Rješava: srž teme 1. Vlasnik: voditelj / umjetničko vodstvo, ne razvoj.', 'rec4b'),

  h(Text, { style: s.h3, key: 'rec5-h' }, '5 · Istaknuti dječju cijenu (10 €)'),
  para('Svuda gdje se spominje obitelj ili cijena, kako bi se upiti o obiteljskim cijenama riješili boljom vidljivošću (cijene ostaju fiksne).', 'rec5a'),

  // --- Kvantifikacija ---
  h(Text, { style: s.h2, key: 'quant-h' }, 'Kvantifikacija tema'),
  para(
    [
      { em: 'Poredano po učestalosti. Brojke su okvirne (kodirano iz sažetaka recenzija, ne preciznim izvozom), pa ih shvatite kao donju granicu. Osnova: 161 recenzija na engleskom; recenzije na drugim jezicima dodaju još (navedeno na kraju). Pouzdan je poredak i to gdje se ocjene grupiraju, ne točan broj.' },
    ],
    'quant-note',
  ),
  h(View, { style: s.tRowHead, key: 'q-head', wrap: false }, [
    h(Text, { style: [{ width: '44%' }, s.tHeadCell], key: 'a' }, 'TEMA'),
    h(Text, { style: [{ width: '14%' }, s.tHeadCell], key: 'b' }, '≈ BROJ'),
    h(Text, { style: [{ width: '14%' }, s.tHeadCell], key: 'c' }, 'UDIO'),
    h(Text, { style: [{ width: '28%' }, s.tHeadCell], key: 'd' }, 'GDJE SU OCJENE'),
  ]),
  ...[
    ['Ritam (repetitivno / sporo / dosadno)', '~22', '~14%', 'gotovo sve 1–3★'],
    ['Sjedala / „dođite ranije” / prevelika prodaja', '~17', '~11%', 'uglavnom 4–5★ (savjet)'],
    ['Razumijevanje radnje', '~12', '~7%', 'miješano'],
    ['Sigurnost u prvom redu', '~11', '~7%', 'uglavnom 4–5★'],
    ['Cijena / „preskupo”', '~11', '~7%', 'ljutnja u 2–3★'],
    ['„Turistički / bez strasti”', '~8', '~5%', '2–4★'],
    ['Teško pronaći lokaciju', '~5', '~3%', 'sve ocjene'],
    ['Buka iz susjednih lokala', '~3', '~2%', '5★ (svejedno smetalo)'],
  ].map((r, i) =>
    h(View, { style: s.tRow, key: `qr${i}`, wrap: false }, [
      h(Text, { style: [s.tTheme, { width: '44%' }], key: 'a' }, r[0]),
      h(Text, { style: [s.tCtrl, { width: '14%' }], key: 'b' }, r[1]),
      h(Text, { style: [s.tCtrl, { width: '14%' }], key: 'c' }, r[2]),
      h(Text, { style: [s.tLever, { width: '28%' }], key: 'd' }, r[3]),
    ]),
  ),
  para(
    [
      { b: 'Najvažniji broj: ' },
      'ritam se pojavljuje u gotovo svakoj slabo ocijenjenoj recenziji, pa je to glavna poluga na razliku od 0,7 zvjezdice. Sjedala/prevelika prodaja su najaktualniji i najjeftiniji za riješiti (u velikoj mjeri rješava ih već novi sustav prodaje).',
    ],
    'quant-takeaway',
  ),

  // --- Dublja analiza (provedeno) ---
  h(Text, { style: s.h2, key: 'next-h' }, 'Dublja analiza (provedeno)'),
  h(Text, { style: s.h3, key: 'da1-h' }, 'Recenzije na drugim jezicima'),
  para(
    'Uzorak na njemačkom, talijanskom i francuskom potvrđuje isti poredak tema. Dodatno: njemački gosti ističu prekomjernu prodaju i vrućinu (umor plesača na ~30°C), Talijani izričito traže najavu na engleskom (a ne samo „višejezično”), a Francuzi su topli uz povremenu zamjerku da je teško pronaći lokaciju. Nije potrebno mijenjati poredak.',
    'da1p',
  ),
  h(Text, { style: s.h3, key: 'da2-h' }, 'Google recenzije'),
  para(
    'Automatski dohvat Google recenzija nije moguć (Google blokira čitanje i prikazuje sadržaj tek u pregledniku). Put naprijed: izvoz iz nadzorne ploče Google profila (vlasnik, info@moreska.eu) za potpun popis, ili Google Places API za ocjenu i uzorak (najviše 5 recenzija). Oprez: u Korčuli postoje dvije moreške, a jedan Google profil vezan je uz lokaciju izvedbe, pa recenzije mogu miješati obje skupine. Prije korištenja treba potvrditi koji je profil preuzet za HGD.',
    'da2p',
  ),
  h(Text, { style: s.h3, key: 'da3-h' }, 'Praćenje nakon promjena (sljedeći korak)'),
  para(
    'Nakon uvođenja poboljšanja i kartica za poticanje recenzija pratiti mjesečno: broj novih recenzija, prosječnu ocjenu i udio novih recenzija koje spominju glavne teme (ritam, razumijevanje, sjedala). Taj udio je pravo mjerilo uspjeha: broj recenzija može rasti i dok stopa pritužbi pada.',
    'da3p',
  ),

  h(
    Text,
    { style: s.note, key: 'final-note' },
    'Sažeta verzija ovog dokumenta (za cijelu Upravu) nalazi se u datoteci moreska-analiza-recenzija.pdf. Citati su navedeni u izvorniku (engleski) uz hrvatski prijevod radi vjernosti; ocjene i godine preuzete su iz samih recenzija.',
  ),
]

const doc = h(
  Document,
  {
    title: 'Analiza recenzija moreške: detaljna verzija',
    author: 'HGD Sveta Cecilija',
    subject: 'Detaljna analiza posjetiteljskih recenzija za voditelja i Upravu',
  },
  h(Page, { size: 'A4', style: s.page }, body),
)

await renderToFile(doc, OUT)
console.log(`PDF written: ${OUT}`)
