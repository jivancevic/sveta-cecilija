import Image from 'next/image';
import Link from 'next/link';
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
            <Link href="/tickets">{t.performances}</Link>
            <Link href="/about">{t.about}</Link>
            <Link href="/about">{t.history}</Link>
            <Link href="/blog">{t.blog}</Link>
            <Link href="/#secs">{t.sections}</Link>
            <Link href="/#svcs">{t.services}</Link>
          </div>
          <div className="foot__col">
            <h3 className="foot__col-h">{t.sectionsLabel}</h3>
            <Link href="/sections/moreska">{t.moreska}</Link>
            <Link href="/sections/wind-orchestra">{t.windOrchestra}</Link>
            <Link href="/sections/klapa">{t.klapa}</Link>
            <Link href="/sections/choir">{t.choir}</Link>
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
          {t.legal} · <Link href="/privacy-policy">{t.privacyPolicy}</Link> · <Link href="/cookie-policy">{t.cookiePolicy}</Link> · <Link href="/refund-policy">{t.refundPolicy}</Link> · Developed by: <a href="https://www.linkedin.com/in/josipivancevic" target="_blank" rel="noopener noreferrer">Josip Ivančević</a>
        </div>
        <LangSwitcher locale={locale} className="foot__lang" />
      </div>
    </footer>
  );
}
