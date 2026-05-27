import Image from 'next/image';
import type { Dictionary } from '@/lib/i18n';
import type { SectionCardMeta } from '@/lib/data';

const KEY_TO_SLUG: Record<string, string> = {
  moreska: 'moreska',
  band: 'wind-orchestra',
  klapa: 'klapa',
  choir: 'choir',
};

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
        <a className="card card--feature" href={`/sections/${KEY_TO_SLUG[featureMeta.key]}`} data-reveal data-delay="1">
          <Image src={featureMeta.image} alt="" fill sizes="(min-width: 768px) 60vw, 100vw" />
          <div className="overlay" />
          <div className="card__body">
            <h3 className="card__name serif">{featureCard.name}</h3>
            <p className="card__blurb">{featureCard.blurb}</p>
            <span className="card__cta">{t.discover}</span>
          </div>
        </a>

        <div className="secs__col-right">
          {otherCards.map(({ meta, text }, i) => (
            <a key={meta.key} className="card" href={`/sections/${KEY_TO_SLUG[meta.key]}`} data-reveal data-delay={i + 2}>
              <Image src={meta.image} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" />
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
