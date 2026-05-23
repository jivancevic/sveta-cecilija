import type { Dictionary } from '@/lib/i18n';
import type { Show } from '@/lib/shows';
import type { Locale } from '@/proxy';

const SHOW_IMAGES = [
  '/torches.webp',
  '/moreska01.webp',
  '/black-king-moreska.webp',
  '/moreska-wide.webp',
  '/bula-kralj.webp',
  '/bula-krupni.webp',
  '/moreska02.webp',
  '/crni-kralj.webp',
  '/kraljevi-krupni.webp',
];

interface Props {
  t: Dictionary['schedule'];
  shows: Show[];
  locale: Locale;
}

function formatDate(isoDate: string, locale: Locale) {
  const date = new Date(isoDate + 'T00:00:00');
  const day = date.getDate().toString();
  const month = date
    .toLocaleDateString(locale === 'hr' ? 'hr-HR' : 'en-GB', { month: 'short' })
    .toUpperCase();
  const year = date.getFullYear().toString();
  const weekday = date.toLocaleDateString(locale === 'hr' ? 'hr-HR' : 'en-GB', { weekday: 'long' });
  return { day, month, year, weekday };
}

export default function Schedule({ t, shows, locale }: Props) {
  return (
    <section id="sched" className="opera">
      <div className="opera__head">
        <div className="opera__eyebrow" data-reveal>{t.eyebrow}</div>
        <h2 className="opera__h serif" data-reveal data-delay="1">{t.headline}</h2>
      </div>

      <div className="opera__grid">
        {shows.map((show, i) => {
          const { day, month, year, weekday } = formatDate(show.date, locale);
          const soldOut = show.remaining <= 0;
          const isNext = i === 0;
          const image = SHOW_IMAGES[i % SHOW_IMAGES.length];

          const pillClass = soldOut ? '' : isNext ? ' amber' : ' green';
          const pillText = soldOut ? t.soldOut : isNext ? t.fewLeft : t.available;

          return (
            <a key={show.id} href={`/tickets?date=${show.date}`} className="opera__card" data-reveal data-delay={i + 1}>
              <div className="opera__photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" />
                <div className="opera__photo-overlay" />
              </div>
              <div className="opera__body">
                <div className="opera__date">
                  <span className="opera__day mono">{day}</span>
                  <span className="opera__mo mono">{month} {year}</span>
                </div>
                <div className="opera__divider" />
                <h3 className="opera__title serif">Moreška</h3>
                <div className="opera__meta">
                  <span>{weekday} · {show.time}</span>
                  <span className={`opera__pill${pillClass}`}>
                    <span className="dot" />
                    {pillText}
                  </span>
                </div>
                <div className="opera__cta">
                  <span className="opera__buy">{t.buyTickets}</span>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <div className="opera__foot" data-reveal>
        <a href="/tickets" className="opera__viewall">{t.viewAll}</a>
        <span className="opera__price-note">{t.priceNote}</span>
      </div>
    </section>
  );
}
