import Image from 'next/image';
import type { Dictionary } from '@/lib/i18n';
import type { HistoryVignetteMeta } from '@/lib/data';

interface Props {
  t: Dictionary['history'];
  vignettes: HistoryVignetteMeta[];
}

export default function History({ t, vignettes }: Props) {
  return (
    <section id="history" className="hist">
      <div className="hist__head">
        <div className="hist__eyebrow" data-reveal>{t.eyebrow}</div>
        <h2 className="hist__h serif" data-reveal data-delay="1">{t.headline}</h2>
        <p className="hist__sub serif" data-reveal data-delay="2">{t.subline}</p>
      </div>

      {/* Desktop: images above timeline line, text below */}
      <div className="hist__desktop">
        <div className="hist__img-row">
          {vignettes.map((meta) => (
            <div key={meta.year} className="hist__img-cell">
              <Image src={meta.image} alt="" className={meta.imageContain ? 'contain' : ''} fill sizes="(min-width: 1024px) 25vw, 33vw" />
            </div>
          ))}
        </div>
        <div className="hist__node-row">
          {vignettes.map((meta) => (
            <div key={meta.year} className="hist__node">
              <span className="hist__dot" />
            </div>
          ))}
        </div>
        <div className="hist__text-row">
          {t.vignettes.map((v, i) => {
            const meta = vignettes[i];
            return (
              <div key={meta.year} className="hist__text-cell" data-reveal data-delay={i + 1}>
                <div className="hist__event-year serif">{meta.year}</div>
                <div className="hist__event-place mono">{v.place}</div>
                <h3 className="hist__event-title serif">{v.title}</h3>
                <p className="hist__event-body">{v.body}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: alternating — odd: text|spine|image, even: image|spine|text */}
      <div className="hist__mobile">
        {t.vignettes.map((v, i) => {
          const meta = vignettes[i];
          return (
            <div
              key={meta.year}
              className={`hist__mobile-event${i % 2 === 1 ? ' hist__mobile-event--flip' : ''}`}
            >
              <div className="hist__mobile-text" data-reveal>
                <div className="hist__event-year serif">{meta.year}</div>
                <div className="hist__event-place mono">{v.place}</div>
                <h3 className="hist__event-title serif">{v.title}</h3>
                <p className="hist__event-body">{v.body}</p>
              </div>
              <div className="hist__mobile-spine">
                <span className="hist__dot" />
              </div>
              <div className="hist__mobile-img">
                <Image src={meta.image} alt="" className={meta.imageContain ? 'contain' : ''} fill sizes="50vw" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
