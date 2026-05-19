import type { Locale } from '@/proxy';
import type { Dictionary } from '@/lib/i18n';

interface Props {
  locale: Locale;
  t: Dictionary['footer'];
}

export default function Footer({ locale, t }: Props) {
  const otherLocale = locale === 'en' ? 'hr' : 'en';

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
            <a href="#sched">{t.performances}</a>
            <a href="#about">{t.about}</a>
            <a href="#history">{t.history}</a>
            <a href="#secs">{t.sections}</a>
            <a href="#svcs">{t.services}</a>
          </div>
          <div className="foot__col">
            <h5 className="foot__col-h">{t.sectionsLabel}</h5>
            <a href="#secs">{t.moreska}</a>
            <a href="#secs">{t.windOrchestra}</a>
            <a href="#secs">{t.klapa}</a>
            <a href="#secs">{t.choir}</a>
          </div>
          <div className="foot__col">
            <h5 className="foot__col-h">{t.contactLabel}</h5>
            <a href={`mailto:${t.location === 'Korčula, Croatia' ? 'info@moreska.eu' : 'info@moreska.eu'}`}>
              info@moreska.eu
            </a>
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
          {t.legal} · <a href={`/${locale}/privacy-policy`}>{t.privacyPolicy}</a> · <a href={`/${locale}/cookie-policy`}>{t.cookiePolicy}</a>
        </div>
        <div className="foot__lang">
          <a href={`/${locale}`} className="active">{locale.toUpperCase()}</a>
          {' · '}
          <a href={`/${otherLocale}`}>{otherLocale.toUpperCase()}</a>
        </div>
      </div>
    </footer>
  );
}
