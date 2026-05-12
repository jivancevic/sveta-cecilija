import type { Dictionary } from '@/lib/i18n';
import type { SectionCardMeta } from '@/lib/data';

interface Props {
  t: Dictionary['sections'];
  cards: SectionCardMeta[];
}

export default function Sections({ t, cards }: Props) {
  const featureMeta = cards.find((c) => c.feature)!;
  const featureCard = t.cards.find((c) => c.key === featureMeta.key)!;
  const otherCards = cards.filter((c) => !c.feature).map((meta) => ({
    meta,
    text: t.cards.find((c) => c.key === meta.key)!,
  }));

  return (
    <section id="secs" className="secs">
      <div className="secs__eyebrow" data-reveal>{t.eyebrow}</div>
      <h2 className="secs__h serif" data-reveal data-delay="1">{t.headline}</h2>

      <div className="secs__grid">
        <a className="card card--feature" href="#" data-reveal data-delay="1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={featureMeta.image} alt="" />
          <div className="overlay" />
          <div className="card__body">
            <h3 className="card__name serif">{featureCard.name}</h3>
            <p className="card__blurb">{featureCard.blurb}</p>
            <span className="card__cta">{t.discover}</span>
          </div>
        </a>

        <div className="secs__col-right">
          {otherCards.map(({ meta, text }, i) => (
            <a key={meta.key} className="card" href="#" data-reveal data-delay={i + 2}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={meta.image} alt="" />
              <div className="overlay" />
              <div className="card__body">
                <h3 className="card__name serif">{text.name}</h3>
                <p className="card__blurb">{text.blurb}</p>
                <span className="card__cta">{t.discover}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
