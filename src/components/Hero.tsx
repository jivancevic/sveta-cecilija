'use client';

import { useEffect, useState } from 'react';
import type { Dictionary } from '@/lib/i18n';

interface Props {
  t: Dictionary['hero'];
  locale: string;
}

export default function Hero({ t, locale }: Props) {
  const [videoSrc, setVideoSrc] = useState('/hero-horizontal.webm');

  useEffect(() => {
    const update = () => {
      setVideoSrc(window.innerWidth < 768 ? '/hero-vertical.webm' : '/hero-horizontal.webm');
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const poster = videoSrc === '/hero-vertical.webm'
    ? '/hero-vertical-poster.webp'
    : '/hero-horizontal-poster.webp';

  return (
    <section className="hero">
      <video
        key={videoSrc}
        className="hero__video"
        src={videoSrc}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="hero__darken" />
      <div className="hero__grey" />

      <div className="hero__logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cecilija-logo.png" alt="" />
        <div className="name serif">HGD Sveta Cecilija</div>
        <div className="est">Korčula · since 1883</div>
      </div>

      <div className="hero__ctas">
        <a className="btn btn--primary btn--hero-cta" href={`/${locale}/tickets`}>{t.buyTickets}</a>
      </div>

      <div className="hero__scroll">{t.scroll}</div>
    </section>
  );
}
