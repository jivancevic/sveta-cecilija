import type { Dictionary } from '@/lib/i18n';

interface Props {
  t: Dictionary['about'];
}

export default function About({ t }: Props) {
  return (
    <section id="about" className="about">
      <div className="about__copy">
        <div className="about__eyebrow" data-reveal>
          <span className="about__eyebrow-rule" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/swords.webp" className="about__eyebrow-swords" alt="" />
          <span className="about__eyebrow-rule" />
        </div>
        <h2 className="about__h serif" data-reveal data-delay="1">{t.headline}</h2>
        <p className="about__body" data-reveal data-delay="2">{t.body}</p>
        <a href="/about" className="about__cta" data-reveal data-delay="3">{t.cta}</a>
      </div>

      <div className="about__collage">
        <div className="about__photo about__photo--tall" data-reveal>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/top-3-kolap.jpg" alt="Moreška performers in costume" />
        </div>
        <div className="about__photo about__photo--top" data-reveal data-delay="1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/black-king-closeup.webp" alt="Black King" />
        </div>
        <div className="about__photo about__photo--mid" data-reveal data-delay="2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wave.jpg" alt="Bula and king" />
        </div>
        <div className="about__photo about__photo--bot" data-reveal data-delay="3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/torches.webp" alt="Torches" />
        </div>
      </div>
    </section>
  );
}
