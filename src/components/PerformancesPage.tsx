'use client';

import { useState, useEffect, useRef } from 'react';
import type { Performance } from '@/lib/data';
import type { Dictionary } from '@/lib/i18n';
import type { Locale } from '@/proxy';

interface Props {
  t: Dictionary['performancesPage'];
  tSchedule: Dictionary['schedule'];
  performances: Performance[];
  locale: Locale;
  initialDate?: string;
}

function formatDate(isoDate: string, locale: Locale) {
  const date = new Date(isoDate + 'T00:00:00');
  const day = date.getDate().toString();
  const month = date
    .toLocaleDateString(locale === 'hr' ? 'hr-HR' : 'en-GB', { month: 'short' })
    .toUpperCase();
  const year = date.getFullYear().toString();
  const weekday = date.toLocaleDateString(locale === 'hr' ? 'hr-HR' : 'en-GB', { weekday: 'long' });
  return { day, month, year, weekday };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function PerformancesPage({ t, tSchedule, performances, locale, initialDate }: Props) {
  const [activeDate, setActiveDate] = useState<string | null>(initialDate ?? null);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);

  const upcoming = performances.filter((p) => p.date >= todayStr());

  useEffect(() => {
    if (initialDate && targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [initialDate]);

  function openBooking(date: string) {
    if (activeDate === date) {
      setActiveDate(null);
    } else {
      setActiveDate(date);
      setAdults(2);
      setChildren(0);
    }
  }

  function confirm(date: string) {
    setConfirmed(date);
    setActiveDate(null);
  }

  const totalTickets = adults + children;
  const hasAdult = adults > 0;
  const discount = Math.floor(totalTickets / 5) * (hasAdult ? 20 : 10);
  const total = adults * 20 + children * 10 - discount;

  const showNudge = totalTickets > 0 && totalTickets % 5 === 4;
  const showCelebrate = discount > 0;

  return (
    <section className="perfs-page">
      <div className="perfs-header">
        <div className="perfs-eyebrow">{t.eyebrow}</div>
        <h1 className="perfs-h serif">{t.headline}</h1>
        <p className="perfs-sub">{t.subline}</p>
      </div>

      {/* Venue info block */}
      <div className="perfs-venue">
        <a
          className="perfs-venue__item perfs-venue__location"
          href={t.venueMapUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="perfs-venue__icon">📍</span>
          <span>{t.venue}</span>
        </a>
        <div className="perfs-venue__item">
          <span className="perfs-venue__icon">⏱</span>
          <span>{t.duration}</span>
        </div>
        <div className="perfs-venue__item">
          <span className="perfs-venue__icon">🎭</span>
          <span>{t.programme}</span>
        </div>
      </div>

      <div className="perfs-grid">
        {upcoming.map((p, i) => {
          const { day, month, year, weekday } = formatDate(p.date, locale);
          const soldOut = p.capacity - p.sold <= 0;
          const isActive = activeDate === p.date;
          const isConfirmed = confirmed === p.date;
          const fewLeft = !soldOut && p.capacity - p.sold <= 50 && i < 3;

          const pillClass = soldOut ? '' : fewLeft ? ' amber' : ' green';
          const pillText = soldOut
            ? t.soldOutLabel
            : fewLeft
            ? tSchedule.fewLeft
            : tSchedule.available;

          return (
            <div
              key={p.date}
              ref={p.date === initialDate ? targetRef : null}
              className={`perf-card${isActive ? ' perf-card--active' : ''}`}
            >
              <div className="perf-card__photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" />
                <div className="perf-card__photo-overlay" />
              </div>

              <div className="perf-card__body">
                <div className="perf-card__date">
                  <span className="perf-card__day mono">{day}</span>
                  <span className="perf-card__mo mono">{month} {year}</span>
                </div>
                <div className="perf-card__divider" />
                <div className="perf-card__meta">
                  <span>{weekday} · 21:00</span>
                  <span className={`perf-card__pill${pillClass}`}>
                    <span className="dot" />
                    {pillText}
                  </span>
                </div>
                <div className="perf-card__cta">
                  <button
                    className="perf-card__book"
                    onClick={() => openBooking(p.date)}
                    disabled={soldOut || isConfirmed}
                  >
                    {isConfirmed ? '✓' : soldOut ? t.soldOutLabel : t.book}
                  </button>
                </div>
              </div>

              {/* Booking expansion */}
              <div className={`perf-booking${isActive ? ' perf-booking--open' : ''}`}>
                <div className="perf-booking__row">
                  <span className="perf-booking__label">
                    {t.adults}
                    <span className="perf-booking__price">{t.adultPrice}</span>
                  </span>
                  <div className="qty-picker">
                    <button className="qty-btn" onClick={() => setAdults(Math.max(0, adults - 1))}>−</button>
                    <span className="qty-val">{adults}</span>
                    <button className="qty-btn" onClick={() => setAdults(adults + 1)}>+</button>
                  </div>
                </div>
                <div className="perf-booking__row">
                  <span className="perf-booking__label">
                    {t.children}
                    <span className="perf-booking__price">{t.childPrice}</span>
                  </span>
                  <div className="qty-picker">
                    <button className="qty-btn" onClick={() => setChildren(Math.max(0, children - 1))}>−</button>
                    <span className="qty-val">{children}</span>
                    <button className="qty-btn" onClick={() => setChildren(children + 1)}>+</button>
                  </div>
                </div>

                {showNudge && !showCelebrate && (
                  <div className="perf-booking__nudge">{t.freeTicketNudge}</div>
                )}
                {showCelebrate && (
                  <div className="perf-booking__celebrate">
                    {t.freeTicketUnlocked} <span className="perf-booking__discount">−€{discount}</span>
                  </div>
                )}

                <div className="perf-booking__total">
                  <span>{t.total}</span>
                  <span className="perf-booking__total-amount">€{total}</span>
                </div>
                <button
                  className="perf-booking__confirm"
                  onClick={() => confirm(p.date)}
                  disabled={adults + children === 0}
                >
                  {t.confirm}
                </button>
              </div>

              {/* Success state */}
              {isConfirmed && (
                <div className="perf-success">
                  <p className="perf-success__title">{t.successTitle}</p>
                  <p className="perf-success__body">{t.successBody}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
