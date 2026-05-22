// Shared data — refined: 4 curated history vignettes, 4 next performances.
// Today is 8 May 2026 — next performances start from 11 May 2026.

window.SCHEDULE_UPCOMING = [
  { date: '11 May 2026', day: 'Monday',    time: '21:00', soldOf: 312, sold: 268, image: 'assets/kraljevi-krupni.jpg', tag: 'Season Opener' },
  { date: '18 May 2026', day: 'Monday',    time: '21:00', soldOf: 312, sold: 192, image: 'assets/black-king-moreska.jpg', tag: 'May' },
  { date: '25 May 2026', day: 'Monday',    time: '21:00', soldOf: 312, sold: 118, image: 'assets/moreska-wide.jpg', tag: 'May' },
  { date: '08 Jun 2026', day: 'Monday',    time: '21:00', soldOf: 312, sold: 54,  image: 'assets/torches.jpg', tag: 'June' },
];

window.SCHEDULE_TOTAL = 24;

// Curated historical vignettes (was: linear timeline)
window.HISTORY_VIGNETTES = [
  {
    year: '1150',
    place: 'Lérida, Spain',
    title: 'The Dance Is Born',
    body: 'The earliest recorded Moreška-style performance takes place in Lérida, commemorating the Christian capture of Aragon. A ritual of mock combat between two armies — one that will travel the Mediterranean for centuries before finding its final home.',
    image: 'assets/lerida.png',
  },
  {
    year: '1666',
    place: 'Korčula, 7 March',
    title: 'First Record in Korčula',
    body: 'A town journal entry dated 7 March 1666 records a Moreška performance during carnival. The dance has already taken root. While similar traditions fade across Dalmatia, Korčula holds on — and never lets go.',
    image: 'assets/1666.png',
  },
  {
    year: '1883',
    place: 'Croatian National Revival',
    title: 'HGD Sveta Cecilija Is Founded',
    body: 'Local citizens establish the Korčula Singing Society St. Cecily. Its founding statutes declare a mission to "ennoble the hearts of local youth" and defend Croatian language, song, and identity. The institutional home of Moreška is born.',
    image: 'assets/cecilija-old-logo.png',
    imageContain: true,
  },
  {
    year: '1991',
    place: 'A free Croatia',
    title: 'A New Era',
    body: 'Following Croatia\u2019s declaration of independence, HGD Sveta Cecilija is officially re-established under its original name and mission. The society returns to its roots: preserving the Moreška and cultivating every dimension of Korčulan cultural life.',
    image: 'assets/bula-kralj.jpg',
  },
];

window.SECTIONS_CARDS = [
  {
    key: 'moreska',
    name: 'Moreška',
    blurb: 'Europe\u2019s last authentic war dance, performed since 1666.',
    image: 'assets/kraljevi-krupni.jpg',
    feature: true,
  },
  {
    key: 'band',
    name: 'Wind Orchestra',
    blurb: 'The brass backbone of every performance since 1937.',
    image: 'assets/band01.jpg',
  },
  {
    key: 'klapa',
    name: 'Klapa Sveta Cecilija',
    blurb: 'The voice before the sword — Dalmatian a cappella, UNESCO heritage.',
    image: 'assets/klapa.jpg',
  },
  {
    key: 'choir',
    name: 'Choir',
    blurb: 'Reborn in 2023. Choral repertoire spanning folk, sacred, contemporary.',
    image: 'assets/choir.jpeg',
  },
];

window.SERVICES_CARDS = [
  {
    key: 'private',
    name: 'Private Moreška',
    blurb: 'A full private performance for groups, at the Summer Cinema or Centar za kulturu Korčula.',
    image: 'assets/black-king-closeup.jpg',
  },
  {
    key: 'experience',
    name: 'The Moreška Experience',
    blurb: 'An intimate educational encounter with the costumes, swords, and dialogue. Min. 5 people.',
    image: 'assets/moreska-experience.jpg',
  },
];
