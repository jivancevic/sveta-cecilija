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
  '/moreska01.jpg',
  '/black-king-moreska.jpg',
  '/moreska-wide.jpg',
  '/torches.jpg',
  '/bula-kralj.jpg',
  '/klapa.jpg',
  '/moreska02.jpg',
  '/band01.jpg',
];

export const SCHEDULE_ALL: Performance[] = [
  { date: '2026-05-04',  capacity: 312, sold: 312, image: '/torches.jpg',           tag: 'Season Opener' },
  { date: '2026-05-11',  capacity: 312, sold: 268, image: '/kraljevi-krupni.jpg',    tag: 'May' },
  { date: '2026-05-18',  capacity: 312, sold: 192, image: '/black-king-moreska.jpg', tag: 'May' },
  { date: '2026-05-25',  capacity: 312, sold: 118, image: '/moreska-wide.jpg',       tag: 'May' },
  { date: '2026-06-08',  capacity: 312, sold: 54,  image: '/torches.jpg',           tag: 'June' },
  { date: '2026-06-10',  capacity: 312, sold: 24,  image: images[6],                tag: 'June' },
  { date: '2026-06-22',  capacity: 312, sold: 0,   image: images[4],                tag: 'June' },
  { date: '2026-06-24',  capacity: 312, sold: 0,   image: images[0],                tag: 'June' },
  { date: '2026-07-06',  capacity: 312, sold: 0,   image: images[1],                tag: 'July' },
  { date: '2026-07-08',  capacity: 312, sold: 0,   image: images[2],                tag: 'July' },
  { date: '2026-07-20',  capacity: 312, sold: 0,   image: images[3],                tag: 'July' },
  { date: '2026-07-22',  capacity: 312, sold: 0,   image: images[5],                tag: 'July' },
  { date: '2026-08-03',  capacity: 312, sold: 0,   image: images[6],                tag: 'August' },
  { date: '2026-08-06',  capacity: 312, sold: 0,   image: images[7],                tag: 'August' },
  { date: '2026-08-17',  capacity: 312, sold: 0,   image: images[0],                tag: 'August' },
  { date: '2026-08-20',  capacity: 312, sold: 0,   image: images[1],                tag: 'August' },
  { date: '2026-08-31',  capacity: 312, sold: 0,   image: images[2],                tag: 'August' },
  { date: '2026-09-02',  capacity: 312, sold: 0,   image: images[3],                tag: 'September' },
  { date: '2026-09-14',  capacity: 312, sold: 0,   image: images[4],                tag: 'September' },
  { date: '2026-09-16',  capacity: 312, sold: 0,   image: images[5],                tag: 'September' },
  { date: '2026-09-28',  capacity: 312, sold: 0,   image: images[6],                tag: 'September' },
  { date: '2026-09-30',  capacity: 312, sold: 0,   image: images[7],                tag: 'October' },
  { date: '2026-10-12',  capacity: 312, sold: 0,   image: images[0],                tag: 'October' },
  { date: '2026-10-14',  capacity: 312, sold: 0,   image: images[1],                tag: 'October' },
];

export function getUpcomingPerformances(count = 4): Performance[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return SCHEDULE_ALL.filter((p) => new Date(p.date) >= today).slice(0, count);
}

// All 8 vignettes — used on the About page
export const HISTORY_VIGNETTES_META: HistoryVignetteMeta[] = [
  { year: '1150', image: '/lerida.png' },
  { year: '1420', image: '/moreska-wide.jpg' },
  { year: '1666', image: '/1666.png' },
  { year: '1883', image: '/cecilija-old-logo.png', imageContain: true },
  { year: '1937', image: '/glazba.webp' },
  { year: '1944', image: '/crni-kralj.webp' },
  { year: '1991', image: '/bula-kralj.jpg' },
  { year: '∞',    image: '/moreska01.jpg' },
];

// 4 curated vignettes for the homepage history section
export const HISTORY_VIGNETTES_HOME: HistoryVignetteMeta[] = [
  HISTORY_VIGNETTES_META[0], // 1150
  HISTORY_VIGNETTES_META[2], // 1666
  HISTORY_VIGNETTES_META[3], // 1883
  HISTORY_VIGNETTES_META[6], // 1991
];

export const SECTION_CARDS_META: SectionCardMeta[] = [
  { key: 'moreska', image: '/kraljevi-krupni.jpg', feature: true },
  { key: 'band',    image: '/band01.jpg' },
  { key: 'klapa',   image: '/klapa.jpg' },
  { key: 'choir',   image: '/choir.jpeg' },
];

export const SERVICE_CARDS_META: ServiceCardMeta[] = [
  { key: 'private',    image: '/black-king-closeup.jpg' },
  { key: 'experience', image: '/moreska-experience.jpg' },
];

export const SECTION_PAGE_META: Record<string, { image: string; sectionKey: string }> = {
  'moreska':         { image: '/todor-2-vojske.webp',  sectionKey: 'moreska' },
  'wind-orchestra':  { image: '/glazba.webp',           sectionKey: 'band' },
  'klapa':           { image: '/klapa-todor.webp',      sectionKey: 'klapa' },
  'choir':           { image: '/choir.jpeg',            sectionKey: 'choir' },
};
