'use client';

import { useEffect, useState, useRef } from 'react';
import type { Dictionary } from '@/lib/i18n';

interface Props {
  t: Dictionary['hero'];
  locale: string;
}

export default function Hero({ t, locale }: Props) {
  const [videoSrc, setVideoSrc] = useState('/hero-horizontal.webm');
  const [videoReady, setVideoReady] = useState(false);
  const [minTimeDone, setMinTimeDone] = useState(false);
  const loaded = videoReady && minTimeDone;
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      setVideoSrc(window.innerWidth < 768 ? '/hero-vertical.webm' : '/hero-horizontal.webm');
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loaded || !loaderRef.current) return;
    const el = loaderRef.current;
    el.style.opacity = '0';
    const onEnd = () => { el.style.display = 'none'; };
    el.addEventListener('transitionend', onEnd, { once: true });
  }, [loaded]);

  return (
    <section className="hero">
      {/* Loading overlay */}
      <div ref={loaderRef} className="hero__loader">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cecilija-logo.png" className="hero__loader-logo" alt="" />
      </div>

      <video
        key={videoSrc}
        className="hero__video"
        src={videoSrc}
        autoPlay
        muted
        loop
        playsInline
        onCanPlayThrough={() => setVideoReady(true)}
        onLoadedData={() => setVideoReady(true)}
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
