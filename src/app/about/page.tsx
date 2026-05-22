import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import Nav from '@/components/Nav';
import PageHero from '@/components/PageHero';
import Footer from '@/components/Footer';

const BLOCK_IMAGES = [
  '/bula-kralj.webp',
  '/moreska-wide.webp',
  '/glazba.webp',
  '/todor-2-vojske.webp',
];

export default async function AboutPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.aboutPage;

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />

      <PageHero
        headline={t.heroHeadline}
        subtitle={t.heroSubtitle}
        image="/moreska01.webp"
      />

      <div className="ab-article">
        {(t.intro as string[]).map((para, i) => (
          <div key={i} className="ab-block">
            <div className="ab-block__text">
              <p className="ab-block__para">{para}</p>
            </div>
            <div className="ab-block__image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BLOCK_IMAGES[i]} alt="" />
            </div>
          </div>
        ))}
      </div>

      <div className="ip-cta">
        <h2 className="ip-cta__h serif">{t.ctaHeadline}</h2>
        <p className="ip-cta__body">{t.ctaBody}</p>
        <a href="/tickets" className="btn btn--primary">{t.ctaButton}</a>
      </div>

      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}
