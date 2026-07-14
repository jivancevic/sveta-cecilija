'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Dictionary } from '@/lib/i18n';

interface Props {
  t: Dictionary['hero'];
}

export default function Hero({ t }: Props) {
  const [videoSrc, setVideoSrc] = useState('/hero-horizontal.webm');
  const [soundOn, setSoundOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const srcRef = useRef('/hero-horizontal.webm');

  useEffect(() => {
    const update = () => {
      const next = window.innerWidth < 768 ? '/hero-vertical.webm' : '/hero-horizontal.webm';
      if (next === srcRef.current) return;
      srcRef.current = next;
      setVideoSrc(next);
      // The new src remounts the <video> (via key), restarting it muted — so
      // reset the toggle; sound never turns on without a fresh user gesture.
      setSoundOn(false);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const poster = videoSrc === '/hero-vertical.webm'
    ? '/hero-vertical-poster.webp'
    : '/hero-horizontal-poster.webp';

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !soundOn;
    video.muted = !next;
    if (next) {
      // Some browsers pause on a programmatic mute change; keep it playing.
      void video.play().catch(() => {});
    }
    setSoundOn(next);
  };

  return (
    <section className="hero">
      <video
        key={videoSrc}
        ref={videoRef}
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
        <Image src="/cecilija-logo.webp" alt="" width={240} height={300} priority />
        <div className="name serif">HGD Sveta Cecilija</div>
        <div className="est">Korčula · since 1883</div>
      </div>

      <div className="hero__ctas">
        <Link className="btn btn--primary btn--hero-cta" href="/tickets">{t.buyTickets}</Link>
      </div>

      <button
        type="button"
        className="hero__sound"
        onClick={toggleSound}
        aria-pressed={soundOn}
        aria-label={soundOn ? t.soundOff : t.soundOn}
        title={soundOn ? t.soundOff : t.soundOn}
      >
        {soundOn ? (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
            <path
              d="M16.5 8.5a4 4 0 010 7M18.8 6.2a7 7 0 010 11.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
            <path
              d="M17 9.5l4 5M21 9.5l-4 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>

      <div className="hero__scroll">{t.scroll}</div>
    </section>
  );
}
