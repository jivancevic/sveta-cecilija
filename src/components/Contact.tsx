'use client';

import { useState } from 'react';
import type { Dictionary } from '@/lib/i18n';

interface Props {
  t: Dictionary['contact'];
}

export default function Contact({ t }: Props) {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <section id="contact" className="contact contact--dark">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="contact__bg" src="/klapa-todor.webp" alt="" />
      <div className="contact__overlay" />
      <div className="contact__inner">
        <div className="contact__head">
          <div className="contact__eyebrow">{t.eyebrow}</div>
          <h2 className="contact__h serif">{t.headline}</h2>
          <p className="contact__sub">
            {t.subline}{' '}
            <a href={`mailto:${t.emailAddress}`}>{t.emailAddress}</a>
          </p>
        </div>

        {submitted ? (
          <div className="contact__success">
            <h3 className="serif">{t.successTitle}</h3>
            <p>{t.successBody}</p>
          </div>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            <div className="form__row">
              <div className="field">
                <label>{t.name}</label>
                <input type="text" placeholder={t.namePlaceholder} required />
              </div>
              <div className="field">
                <label>{t.email}</label>
                <input type="email" placeholder={t.emailPlaceholder} required />
              </div>
            </div>
            <div className="form__row">
              <div className="field">
                <label>{t.enquiry}</label>
                <select defaultValue="">
                  <option value="" disabled>{t.enquirySelect}</option>
                  {t.enquiryOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>&nbsp;</label>
                <button className="btn btn--primary form__submit" type="submit">
                  {t.submit}
                </button>
              </div>
            </div>
            <div className="field">
              <label>{t.message}</label>
              <textarea placeholder={t.messagePlaceholder} />
            </div>
            <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>{t.responseTime}</p>
          </form>
        )}
      </div>
    </section>
  );
}
