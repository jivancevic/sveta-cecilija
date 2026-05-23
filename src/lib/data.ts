export interface Performance {
  date: string; // YYYY-MM-DD
  capacity: number;
  sold: number;
  image: string;
  tag: string;
}

export interface HistoryVignetteMeta {
  year: string;
  image: string;
  imageContain?: boolean;
}

export interface SectionCardMeta {
  key: string;
  image: string;
  feature?: boolean;
}

export interface ServiceCardMeta {
  key: string;
  image: string;
}

const images = [
  '/fila.jpg',             // 0
  '/kraljevi-krupni.webp', // 1
  '/kraljevi.webp',        // 2
  '/moreska-wide.webp',    // 3
  '/moreska01.webp',       // 4
  '/moreska02.webp',       // 5
  '/torches.webp',         // 6
  '/black-bula.jpg',       // 7
  '/sfida-wide.jpg',       // 8
  '/sword-clash.jpg',      // 9
  '/top-7-kolap.jpg',      // 10
  '/wave.jpg',             // 11
];

export const SCHEDULE_ALL: Performance[] = [
  { date: '2026-05-04',  capacity: 312, sold: 312, image: images[0],  tag: 'Season Opener' },
  { date: '2026-05-11',  capacity: 312, sold: 268, image: images[1],  tag: 'May' },
  { date: '2026-05-18',  capacity: 312, sold: 192, image: images[2],  tag: 'May' },
  { date: '2026-05-25',  capacity: 312, sold: 118, image: images[3],  tag: 'May' },
  { date: '2026-06-08',  capacity: 312, sold: 54,  image: images[4],  tag: 'June' },
  { date: '2026-06-10',  capacity: 312, sold: 24,  image: images[5],  tag: 'June' },
  { date: '2026-06-22',  capacity: 312, sold: 0,   image: images[6],  tag: 'June' },
  { date: '2026-06-24',  capacity: 312, sold: 0,   image: images[7],  tag: 'June' },
  { date: '2026-07-06',  capacity: 312, sold: 0,   image: images[8],  tag: 'July' },
  { date: '2026-07-08',  capacity: 312, sold: 0,   image: images[9],  tag: 'July' },
  { date: '2026-07-20',  capacity: 312, sold: 0,   image: images[10], tag: 'July' },
  { date: '2026-07-22',  capacity: 312, sold: 0,   image: images[11], tag: 'July' },
  { date: '2026-08-03',  capacity: 312, sold: 0,   image: images[0],  tag: 'August' },
  { date: '2026-08-06',  capacity: 312, sold: 0,   image: images[1],  tag: 'August' },
  { date: '2026-08-17',  capacity: 312, sold: 0,   image: images[2],  tag: 'August' },
  { date: '2026-08-20',  capacity: 312, sold: 0,   image: images[3],  tag: 'August' },
  { date: '2026-08-31',  capacity: 312, sold: 0,   image: images[4],  tag: 'August' },
  { date: '2026-09-02',  capacity: 312, sold: 0,   image: images[5],  tag: 'September' },
  { date: '2026-09-14',  capacity: 312, sold: 0,   image: images[6],  tag: 'September' },
  { date: '2026-09-16',  capacity: 312, sold: 0,   image: images[7],  tag: 'September' },
  { date: '2026-09-28',  capacity: 312, sold: 0,   image: images[8],  tag: 'September' },
  { date: '2026-09-30',  capacity: 312, sold: 0,   image: images[9],  tag: 'October' },
  { date: '2026-10-12',  capacity: 312, sold: 0,   image: images[10], tag: 'October' },
  { date: '2026-10-14',  capacity: 312, sold: 0,   image: images[11], tag: 'October' },
];

export function getUpcomingPerformances(count = 4): Performance[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return SCHEDULE_ALL.filter((p) => new Date(p.date) >= today).slice(0, count);
}

// All 8 vignettes — used on the About page
export const HISTORY_VIGNETTES_META: HistoryVignetteMeta[] = [
  { year: '1150', image: '/moreska-nobilo.jpg' },
  { year: '1420', image: '/moreska-wide.webp' },
  { year: '1666', image: '/1666.webp' },
  { year: '1883', image: '/cecilija-old-logo.webp', imageContain: true },
  { year: '1937', image: '/glazba.webp' },
  { year: '1944', image: '/crni-kralj.webp' },
  { year: '1991', image: '/bula.jpg' },
  { year: '∞',    image: '/moreska01.webp' },
];

// 4 curated vignettes for the homepage history section
export const HISTORY_VIGNETTES_HOME: HistoryVignetteMeta[] = [
  HISTORY_VIGNETTES_META[0], // 1150
  HISTORY_VIGNETTES_META[2], // 1666
  HISTORY_VIGNETTES_META[3], // 1883
  HISTORY_VIGNETTES_META[6], // 1991
];

export const SECTION_CARDS_META: SectionCardMeta[] = [
  { key: 'moreska', image: '/kraljevi-krupni.webp', feature: true },
  { key: 'band',    image: '/band01.webp' },
  { key: 'klapa',   image: '/klapa.webp' },
  { key: 'choir',   image: '/choir.webp' },
];

export const SERVICE_CARDS_META: ServiceCardMeta[] = [
  { key: 'private',    image: '/kraljevi.webp' },
  { key: 'experience', image: '/moreska-experience.webp' },
];

export const SECTION_PAGE_META: Record<string, { image: string; sectionKey: string }> = {
  'moreska':         { image: '/todor-2-vojske.webp',  sectionKey: 'moreska' },
  'wind-orchestra':  { image: '/glazba.webp',           sectionKey: 'band' },
  'klapa':           { image: '/klapa-todor.webp',      sectionKey: 'klapa' },
  'choir':           { image: '/choir.webp',            sectionKey: 'choir' },
};

export const SERVICE_PAGE_META: Record<string, { image: string; cardIndex: number }> = {
  'private-moreska':    { image: '/kraljevi.webp', cardIndex: 0 },
  'moreska-experience': { image: '/moreska-experience.webp', cardIndex: 1 },
};
