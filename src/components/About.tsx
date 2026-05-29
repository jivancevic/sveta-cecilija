import Image from 'next/image';
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
          <Image src="/swords.webp" className="about__eyebrow-swords" alt="" width={45} height={57} />
          <span className="about__eyebrow-rule" />
        </div>
        <h2 className="about__h serif" data-reveal data-delay="1">{t.headline}</h2>
        <p className="about__body" data-reveal data-delay="2">{t.body}</p>
        <a href="/about" className="about__cta" data-reveal data-delay="3">{t.cta}</a>
      </div>

      <div className="about__collage">
        <div className="about__photo about__photo--tall" data-reveal>
          <Image src="/sword-clash.webp" alt="Moreška performers in costume" fill sizes="(min-width: 768px) 50vw, 100vw" />
        </div>
        <div className="about__photo about__photo--top" data-reveal data-delay="1">
          <Image src="/black-king-closeup.webp" alt="Black King" fill sizes="(min-width: 768px) 25vw, 50vw" />
        </div>
        <div className="about__photo about__photo--mid" data-reveal data-delay="2">
          <Image src="/wave.webp" alt="Bula and king" fill sizes="(min-width: 768px) 25vw, 50vw" />
        </div>
        <div className="about__photo about__photo--bot" data-reveal data-delay="3">
          <Image src="/torches.webp" alt="Torches" fill sizes="(min-width: 768px) 25vw, 50vw" />
        </div>
      </div>
    </section>
  );
}
