import type { Locale } from '@/proxy';
import type { Dictionary } from '@/lib/i18n';

interface Props {
  t: Dictionary['about'];
  locale: Locale;
}

export default function About({ t, locale }: Props) {
  return (
    <section id="about" className="about">
      <div className="about__copy">
        <div className="about__eyebrow">{t.eyebrow}</div>
        <h2 className="about__h serif">{t.headline}</h2>
        <p className="about__body">{t.body}</p>
        <a href={`/${locale}/about`} className="about__cta">{t.cta}</a>
      </div>

      <div className="about__collage">
        <div className="about__photo about__photo--tall">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/moreska02.jpg" alt="Moreška performers in costume" />
        </div>
        <div className="about__photo about__photo--top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/black-king-closeup.jpg" alt="Black King" />
        </div>
        <div className="about__photo about__photo--mid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bula-kralj.jpg" alt="Bula and king" />
        </div>
        <div className="about__photo about__photo--bot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/torches.jpg" alt="Torches" />
        </div>
      </div>
    </section>
  );
}
