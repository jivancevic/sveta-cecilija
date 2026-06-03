import Image from 'next/image';
import type { Locale } from '@/proxy';
import type { Dictionary } from '@/lib/i18n';
import LangSwitcher from './LangSwitcher';

interface Props {
  locale: Locale;
  t: Dictionary['footer'];
}

export default function Footer({ locale, t }: Props) {
  return (
    <footer className="foot foot--atmos">
      <Image className="foot__bg" src="/moreska-wide.webp" alt="" fill sizes="100vw" />
      <div className="foot__overlay" />

      <div className="foot__inner">
        <div className="foot__brand">
          <Image className="foot__logo" src="/cecilija-logo.webp" alt="HGD Sveta Cecilija" width={144} height={180} />
          <div className="foot__tag serif">{t.tagline}</div>
        </div>

        <div className="foot__cols">
          <div className="foot__col">
            <h3 className="foot__col-h">{t.visitLabel}</h3>
            <a href="/tickets">{t.performances}</a>
            <a href="/about">{t.about}</a>
            <a href="/about">{t.history}</a>
            <a href="/blog">{t.blog}</a>
            <a href="/#secs">{t.sections}</a>
            <a href="/#svcs">{t.services}</a>
          </div>
          <div className="foot__col">
            <h3 className="foot__col-h">{t.sectionsLabel}</h3>
            <a href="/sections/moreska">{t.moreska}</a>
            <a href="/sections/wind-orchestra">{t.windOrchestra}</a>
            <a href="/sections/klapa">{t.klapa}</a>
            <a href="/sections/choir">{t.choir}</a>
          </div>
          <div className="foot__col">
            <h3 className="foot__col-h">{t.contactLabel}</h3>
            <a href="mailto:info@moreska.eu">info@moreska.eu</a>
            <a href="https://maps.app.goo.gl/u73fPrGmBGhY7e5JA" target="_blank" rel="noopener noreferrer">{t.location}</a>
            <div className="foot__social">
              <a href="https://www.facebook.com/svcecilijamoreska" target="_blank" rel="noopener noreferrer">{t.facebook}</a>
              <a href="https://www.instagram.com/hgdsvetacecilija/" target="_blank" rel="noopener noreferrer">{t.instagram}</a>
              <a href="#">{t.youtube}</a>
            </div>
          </div>
        </div>
      </div>

      <div className="foot__bottom">
        <div className="foot__legal">
          {t.legal} · <a href="/privacy-policy">{t.privacyPolicy}</a> · <a href="/cookie-policy">{t.cookiePolicy}</a> · <a href="/refund-policy">{t.refundPolicy}</a> · Developed by: <a href="https://www.linkedin.com/in/josipivancevic" target="_blank" rel="noopener noreferrer">Josip Ivančević</a>
        </div>
        <LangSwitcher locale={locale} className="foot__lang" />
      </div>
    </footer>
  );
}
