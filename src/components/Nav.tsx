'use client';

import { useState, useEffect, useRef } from 'react';
import type { Locale } from '@/proxy';
import type { Dictionary } from '@/lib/i18n';

interface Props {
  locale: Locale;
  t: Dictionary['nav'];
  variant?: 'homepage' | 'inner';
}

export default function Nav({ locale, t, variant = 'homepage' }: Props) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileVisible, setMobileVisible] = useState(true);
  const lastScrollY = useRef(0);
  const otherLocale = locale === 'en' ? 'hr' : 'en';

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // Laptop: transparent → dark
      setScrolled(y > 60);
      // Mobile: show on scroll-up, hide on scroll-down
      if (y < 60) {
        setMobileVisible(true);
      } else if (y > lastScrollY.current + 4) {
        setMobileVisible(false);
      } else if (y < lastScrollY.current - 4) {
        setMobileVisible(true);
      }
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const close = () => setOpen(false);

  const navClass = [
    'nav',
    variant === 'inner' ? 'nav--inner' : '',
    variant === 'homepage' && scrolled ? 'nav--scrolled' : '',
    variant === 'homepage' && !mobileVisible ? 'nav--mobile-hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <nav className={navClass}>
        <a href={`/${locale}`} className="nav__logo" aria-label="HGD Sveta Cecilija">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cecilija-logo.png" alt="" />
          <span className="nav__wordmark">
            <span className="top">{t.wordmarkTop}</span>
            <span className="bot">{t.wordmarkBot}</span>
          </span>
        </a>

        <div className="nav__links">
          <a href={`/${locale}/performances`}>{t.performances}</a>
          <a href={`/${locale}#about`}>{t.about}</a>
          <a href={`/${locale}#history`}>{t.history}</a>
          <a href={`/${locale}#secs`}>{t.sections}</a>
          <a href={`/${locale}#svcs`}>{t.services}</a>
          <a href={`/${locale}#contact`}>{t.contact}</a>
          <span className="nav__lang">
            <a href={`/${locale}`} className="active">{locale.toUpperCase()}</a>
            {' · '}
            <a href={`/${otherLocale}`}>{otherLocale.toUpperCase()}</a>
          </span>
          <a className="btn btn--primary btn--small nav__cta" href={`/${locale}#sched`}>
            {t.buyTickets}
          </a>
        </div>

        {/* Mobile: lang toggle + hamburger */}
        <div className="nav__mobile-right">
          <span className="nav__lang-mobile">
            <a href={`/${locale}`} className="active">{locale.toUpperCase()}</a>
            {' · '}
            <a href={`/${otherLocale}`}>{otherLocale.toUpperCase()}</a>
          </span>
          <button
            className="nav__hamburger"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      {open && (
        <div className="nav__overlay">
          <button className="nav__overlay-close" onClick={close} aria-label="Close menu">✕</button>

          <a href={`/${locale}`} className="nav__overlay-logo" onClick={close}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cecilija-logo.png" alt="HGD Sveta Cecilija" />
          </a>

          <div className="nav__overlay-links">
            <a href={`/${locale}/performances`} onClick={close}>{t.performances}</a>
            <a href={`/${locale}#about`} onClick={close}>{t.about}</a>
            <a href={`/${locale}#history`} onClick={close}>{t.history}</a>
            <a href={`/${locale}#secs`} onClick={close}>{t.sections}</a>
            <a href={`/${locale}#svcs`} onClick={close}>{t.services}</a>
            <a href={`/${locale}#contact`} onClick={close}>{t.contact}</a>
          </div>

          <a className="btn btn--primary" href={`/${locale}#sched`} onClick={close}>
            {t.buyTickets}
          </a>

          <div className="nav__overlay-lang">
            <a href={`/${locale}`} className="active" onClick={close}>{locale.toUpperCase()}</a>
            {' · '}
            <a href={`/${otherLocale}`} onClick={close}>{otherLocale.toUpperCase()}</a>
          </div>
        </div>
      )}
    </>
  );
}
