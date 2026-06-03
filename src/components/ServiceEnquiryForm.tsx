'use client';

import { useState } from 'react';
import type { Dictionary } from '@/lib/i18n';
import { submitContactEnquiry } from '@/app/actions/contact';

interface Props {
  t: Dictionary['contact'];
  // Stable enquiry slug for this service (e.g. "private-moreska"); maps directly
  // onto the ContactSubmissions enquiryType enum.
  defaultEnquiry: string;
}

export default function ServiceEnquiryForm({ t, defaultEnquiry }: Props) {
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

  if (submitted) {
    return (
      <div className="svc-form__success">
        <h3 className="serif">{t.successTitle}</h3>
        <p>{t.successBody}</p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error && (
        <p className="form__error" role="alert">
          {t.errorBody}
        </p>
      )}
      <div className="field">
        <label>{t.name}</label>
        <input name="name" type="text" placeholder={t.namePlaceholder} required />
      </div>
      <div className="field">
        <label>{t.email}</label>
        <input name="email" type="email" placeholder={t.emailPlaceholder} required />
      </div>
      <div className="field">
        <label>{t.message}</label>
        <textarea name="message" placeholder={t.messagePlaceholder} required />
      </div>
      <input type="hidden" name="enquiry" value={defaultEnquiry} />
      <button className="btn btn--primary svc-form__btn" type="submit" disabled={sending}>
        {sending ? t.sending : t.submit}
      </button>
    </form>
  );
}
