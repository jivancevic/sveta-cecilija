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
        <div className="hist__eyebrow">{t.eyebrow}</div>
        <h2 className="hist__h serif">{t.headline}</h2>
        <p className="hist__sub serif">{t.subline}</p>
      </div>

      <div className="hist__grid">
        {t.vignettes.map((v, i) => {
          const meta = vignettes[i];
          return (
            <article key={meta.year} className="vignette">
              <div className={`vignette__photo${meta.imageContain ? ' contain' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meta.image} alt="" />
              </div>
              <div className="vignette__body">
                <div className="vignette__year serif">{meta.year}</div>
                <div className="vignette__place mono">{v.place}</div>
                <h3 className="vignette__title serif">{v.title}</h3>
                <p className="vignette__text">{v.body}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
