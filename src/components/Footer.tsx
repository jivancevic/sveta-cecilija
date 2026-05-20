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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="foot__bg" src="/moreska-wide.jpg" alt="" />
      <div className="foot__overlay" />

      <div className="foot__inner">
        <div className="foot__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="foot__logo" src="/cecilija-logo.png" alt="HGD Sveta Cecilija" />
          <div className="foot__tag serif">{t.tagline}</div>
        </div>

        <div className="foot__cols">
          <div className="foot__col">
            <h5 className="foot__col-h">{t.visitLabel}</h5>
            <a href="/tickets">{t.performances}</a>
            <a href="/about">{t.about}</a>
            <a href="/about">{t.history}</a>
            <a href="/#secs">{t.sections}</a>
            <a href="/#svcs">{t.services}</a>
          </div>
          <div className="foot__col">
            <h5 className="foot__col-h">{t.sectionsLabel}</h5>
            <a href="/sections/moreska">{t.moreska}</a>
            <a href="/sections/wind-orchestra">{t.windOrchestra}</a>
            <a href="/sections/klapa">{t.klapa}</a>
            <a href="/sections/choir">{t.choir}</a>
          </div>
          <div className="foot__col">
            <h5 className="foot__col-h">{t.contactLabel}</h5>
            <a href="mailto:info@moreska.eu">info@moreska.eu</a>
            <a href="#">{t.location}</a>
            <div className="foot__social">
              <a href="#">{t.facebook}</a>
              <a href="#">{t.instagram}</a>
              <a href="#">{t.youtube}</a>
            </div>
          </div>
        </div>
      </div>

      <div className="foot__bottom">
        <div className="foot__legal">
          {t.legal} · <a href="/privacy-policy">{t.privacyPolicy}</a> · <a href="/cookie-policy">{t.cookiePolicy}</a> · Developed by: <a href="https://www.linkedin.com/in/josipivancevic" target="_blank" rel="noopener noreferrer">Josip Ivančević</a>
        </div>
        <LangSwitcher locale={locale} className="foot__lang" />
      </div>
    </footer>
  );
}
