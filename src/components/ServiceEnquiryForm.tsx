'use client';

import { useState } from 'react';
import type { Dictionary } from '@/lib/i18n';

interface Props {
  t: Dictionary['contact'];
  defaultEnquiry: string;
}

export default function ServiceEnquiryForm({ t, defaultEnquiry }: Props) {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
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
      <div className="field">
        <label>{t.name}</label>
        <input type="text" placeholder={t.namePlaceholder} required />
      </div>
      <div className="field">
        <label>{t.email}</label>
        <input type="email" placeholder={t.emailPlaceholder} required />
      </div>
      <div className="field">
        <label>{t.message}</label>
        <textarea placeholder={t.messagePlaceholder} />
      </div>
      <input type="hidden" name="enquiry" value={defaultEnquiry} />
      <button className="btn btn--primary svc-form__btn" type="submit">
        {t.submit}
      </button>
    </form>
  );
}
