import type { Dictionary } from '@/lib/i18n';
import type { ServiceCardMeta } from '@/lib/data';

interface Props {
  t: Dictionary['services'];
  cards: ServiceCardMeta[];
}

export default function Services({ t, cards }: Props) {
  return (
    <section id="svcs" className="svcs">
      <div className="svcs__eyebrow" data-reveal>{t.eyebrow}</div>
      <h2 className="svcs__h serif" data-reveal data-delay="1">{t.headline}</h2>
      <p className="svcs__lede serif" data-reveal data-delay="2">{t.lede}</p>

      <div className="svcs__grid">
        {t.cards.map((card, i) => {
          const meta = cards[i];
          return (
            <article key={i} className="svc" data-reveal data-delay={i + 1}>
              <div className="svc__photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meta.image} alt="" />
                <div className="svc__photo-overlay" />
              </div>
              <div className="svc__body">
                <div className="svc__tagline serif">{card.tagline}</div>
                <h3 className="svc__title serif">{card.name}</h3>
                <p className="svc__blurb">{card.blurb}</p>
                <ul className="svc__bullets">
                  {card.bullets.map((b, j) => (
                    <li key={j}>
                      <span className="svc__bullet-mark">✦</span>
                      {b}
                    </li>
                  ))}
                </ul>
                <div className="svc__foot">
                  <span className="svc__meta mono">{card.meta}</span>
                  <a className="btn btn--primary btn--small" href="#contact">
                    {card.cta}
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
