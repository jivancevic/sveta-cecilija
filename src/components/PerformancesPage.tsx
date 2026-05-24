'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Show } from '@/lib/shows';
import type { Dictionary } from '@/lib/i18n';
import type { Locale } from '@/proxy';
import { calculateOrderTotal } from '@/lib/pricing';

interface Props {
  t: Dictionary['performancesPage'];
  tSchedule: Dictionary['schedule'];
  shows: Show[];
  locale: Locale;
  initialDate?: string;
  images: string[];
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

export default function PerformancesPage({ t, tSchedule, shows, locale, initialDate, images }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialDate && targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [initialDate]);

  function openBooking(id: string) {
    if (activeId === id) {
      setActiveId(null);
    } else {
      setActiveId(id);
      setAdults(2);
      setChildren(0);
    }
  }

  const totals = calculateOrderTotal({ adults, children });
  const totalTickets = adults + children;
  const showNudge = totalTickets > 0 && totalTickets % 5 === 4;
  const showCelebrate = totals.discountEur > 0;

  return (
    <section className="perfs-page">
      <div className="perfs-header">
        <div className="perfs-eyebrow">{t.eyebrow}</div>
        <h1 className="perfs-h serif">{t.headline}</h1>
        <p className="perfs-sub">{t.subline}</p>
      </div>

      {/* Venue panel: primary venue (hero) + rain-plan callout below */}
      <div className="perfs-venue">
        <div className="perfs-venue__primary">
          <div className="perfs-venue__label">{t.venueLabel}</div>
          <div className="perfs-venue__row">
            <div className="perfs-venue__name">{t.venuePrimary}</div>
            <a
              className="perfs-venue__map"
              href={t.venuePrimaryMapUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.venueViewMap}
            </a>
          </div>
          <div className="perfs-venue__divider" />
          <div className="perfs-venue__details">
            <span className="perfs-venue__details-label">{t.venueDetailsLabel}</span>
            <span className="perfs-venue__details-text">{t.venueDetails}</span>
          </div>
        </div>
        <div className="perfs-venue__rain">
          <span className="perfs-venue__rain-label">{t.rainPlanLabel}</span>
          <span className="perfs-venue__rain-text">
            {t.rainPlanIntro}{' '}
            <a
              className="perfs-venue__rain-link"
              href={t.rainPlanMapUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.rainPlanVenue}
            </a>
          </span>
        </div>
      </div>

      {shows.length === 0 ? (
        <div className="perfs-empty">{t.noShows}</div>
      ) : (
        <div className="perfs-grid">
          {shows.map((show, i) => {
            const { day, month, year, weekday } = formatDate(show.date, locale);
            const soldOut = show.remaining <= 0;
            const isActive = activeId === show.id;
            const fewLeft = !soldOut && show.remaining <= 50 && i < 3;
            const image = images[i % images.length];
            const venueName = show.venue === 'zimsko-kino' ? t.venueZimsko : t.venueLjetno;

            const pillClass = soldOut ? '' : fewLeft ? ' amber' : ' green';
            const pillText = soldOut
              ? t.soldOutLabel
              : fewLeft
              ? tSchedule.fewLeft
              : tSchedule.available;

            return (
              <div
                key={show.id}
                ref={show.date === initialDate ? targetRef : null}
                className={`perf-card${isActive ? ' perf-card--active' : ''}`}
              >
                <div className="perf-card__photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="" />
                  <div className="perf-card__photo-overlay" />
                </div>

                <div className="perf-card__body">
                  <div className="perf-card__date">
                    <span className="perf-card__day mono">{day}</span>
                    <span className="perf-card__mo mono">{month} {year}</span>
                  </div>
                  <div className="perf-card__divider" />
                  <div className="perf-card__meta">
                    <span>{weekday} · {show.time} · {venueName}</span>
                    <span className={`perf-card__pill${pillClass}`}>
                      <span className="dot" />
                      {pillText}
                    </span>
                  </div>
                  <div className="perf-card__cta">
                    <button
                      className="perf-card__book"
                      onClick={() => openBooking(show.id)}
                      disabled={soldOut}
                    >
                      {soldOut ? t.soldOutLabel : t.book}
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
                      {t.freeTicketUnlocked} <span className="perf-booking__discount">−€{totals.discountEur}</span>
                    </div>
                  )}

                  <div className="perf-booking__total">
                    <span>{t.total}</span>
                    <span className="perf-booking__total-amount">€{totals.totalEur}</span>
                  </div>
                  {soldOut || totalTickets === 0 ? (
                    <button className="perf-booking__confirm" disabled>
                      {t.confirm}
                    </button>
                  ) : (
                    <Link
                      href={`/checkout/${show.id}?adults=${adults}&children=${children}`}
                      className="perf-booking__confirm"
                    >
                      {t.confirm}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
