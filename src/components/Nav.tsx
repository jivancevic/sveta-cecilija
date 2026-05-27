'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import type { Locale } from '@/proxy';
import type { Dictionary } from '@/lib/i18n';
import LangSwitcher from './LangSwitcher';

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

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 60);
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
        <a href="/" className="nav__logo">
          <Image src="/cecilija-logo.webp" alt="" width={80} height={100} priority />
          <span className="nav__wordmark">
            <span className="top">{t.wordmarkTop}</span>
            <span className="bot">{t.wordmarkBot}</span>
          </span>
        </a>

        <div className="nav__links">
          <a href="/tickets">{t.performances}</a>
          <a href="/#about">{t.about}</a>
          <a href="/#history">{t.history}</a>
          <a href="/#secs">{t.sections}</a>
          <a href="/#svcs">{t.services}</a>
          <a href="/#contact">{t.contact}</a>
          <LangSwitcher locale={locale} className="nav__lang" />
          <a className="btn btn--primary btn--small nav__cta" href="/tickets">
            {t.buyTickets}
          </a>
        </div>

        <div className="nav__mobile-right">
          <LangSwitcher locale={locale} className="nav__lang-mobile" />
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

          <a href="/" className="nav__overlay-logo" onClick={close}>
            <Image src="/cecilija-logo.webp" alt="HGD Sveta Cecilija" width={160} height={200} />
          </a>

          <div className="nav__overlay-links">
            <a href="/tickets" onClick={close}>{t.performances}</a>
            <a href="/#about" onClick={close}>{t.about}</a>
            <a href="/#history" onClick={close}>{t.history}</a>
            <a href="/#secs" onClick={close}>{t.sections}</a>
            <a href="/#svcs" onClick={close}>{t.services}</a>
            <a href="/#contact" onClick={close}>{t.contact}</a>
          </div>

          <a className="btn btn--primary" href="/tickets" onClick={close}>
            {t.buyTickets}
          </a>

          <div className="nav__overlay-lang">
            <LangSwitcher locale={locale} className="nav__overlay-lang-switcher" />
          </div>
        </div>
      )}
    </>
  );
}
