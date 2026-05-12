import type { Dictionary } from '@/lib/i18n';
import type { Performance } from '@/lib/data';
import type { Locale } from '@/proxy';

interface Props {
  t: Dictionary['schedule'];
  performances: Performance[];
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

export default function Schedule({ t, performances, locale }: Props) {
  return (
    <section id="sched" className="opera">
      <div className="opera__head">
        <div className="opera__eyebrow" data-reveal>{t.eyebrow}</div>
        <h2 className="opera__h serif" data-reveal data-delay="1">{t.headline}</h2>
      </div>

      <div className="opera__grid">
        {performances.map((p, i) => {
          const { day, month, year, weekday } = formatDate(p.date, locale);
          const soldOut = p.capacity - p.sold <= 0;
          const isNext = i === 0;

          const pillClass = soldOut ? '' : isNext ? ' amber' : ' green';
          const pillText = soldOut ? t.soldOut : isNext ? t.fewLeft : t.available;

          return (
            <a key={p.date} href="#sched" className="opera__card" data-reveal data-delay={i + 1}>
              <div className="opera__photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" />
                <div className="opera__photo-overlay" />
                <div className="opera__tag mono">{p.tag}</div>
              </div>
              <div className="opera__body">
                <div className="opera__date">
                  <span className="opera__day mono">{day}</span>
                  <span className="opera__mo mono">{month} {year}</span>
                </div>
                <div className="opera__divider" />
                <h3 className="opera__title serif">Moreška</h3>
                <div className="opera__meta">
                  <span>{weekday} · 21:00</span>
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
        <a href={`/${locale}/performances`} className="opera__viewall">{t.viewAll}</a>
        <span className="opera__price-note">{t.priceNote}</span>
      </div>
    </section>
  );
}
