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

      <div className="hist__timeline">
        {t.vignettes.map((v, i) => {
          const meta = vignettes[i];
          return (
            <div key={meta.year} className="hist__event" data-reveal data-delay={i + 1}>
              <div className="hist__dot" />
              <div className="hist__event-year serif">{meta.year}</div>
              <div className="hist__event-place mono">{v.place}</div>
              <h3 className="hist__event-title serif">{v.title}</h3>
              <p className="hist__event-body">{v.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
