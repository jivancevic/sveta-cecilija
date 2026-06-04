'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Dictionary } from '@/lib/i18n';
import { submitContactEnquiry } from '@/app/actions/contact';

interface Props {
  t: Dictionary['contact'];
}

export default function Contact({ t }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    const fd = new FormData(e.currentTarget);
    setSending(true);
    setError(false);
    try {
      const res = await submitContactEnquiry({
        name: String(fd.get('name') ?? ''),
        email: String(fd.get('email') ?? ''),
        message: String(fd.get('message') ?? ''),
        enquiry: String(fd.get('enquiry') ?? ''),
      });
      if (res.ok) setSubmitted(true);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="contact" className="contact contact--dark">
      <Image className="contact__bg" src="/klapa-todor.webp" alt="" fill sizes="100vw" />
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
            {error && (
              <p className="form__error" role="alert">
                {t.errorBody}
              </p>
            )}
            <div className="form__row">
              <div className="field">
                <label htmlFor="contact-name">{t.name}</label>
                <input id="contact-name" name="name" type="text" placeholder={t.namePlaceholder} required />
              </div>
              <div className="field">
                <label htmlFor="contact-email">{t.email}</label>
                <input id="contact-email" name="email" type="email" placeholder={t.emailPlaceholder} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="contact-enquiry">{t.enquiry}</label>
              <select id="contact-enquiry" name="enquiry" defaultValue="">
                <option value="" disabled>{t.enquirySelect}</option>
                {t.enquiryOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="contact-message">{t.message}</label>
              <textarea id="contact-message" name="message" placeholder={t.messagePlaceholder} required />
            </div>
            <div className="form__actions">
              <button className="btn btn--primary form__submit" type="submit" disabled={sending}>
                {sending ? t.sending : t.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
