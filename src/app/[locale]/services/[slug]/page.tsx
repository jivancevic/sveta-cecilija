import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/proxy';
import { getDictionary } from '@/lib/i18n';
import { SERVICE_PAGE_META } from '@/lib/data';
import Nav from '@/components/Nav';
import PageHero from '@/components/PageHero';
import Footer from '@/components/Footer';
import ServiceEnquiryForm from '@/components/ServiceEnquiryForm';

const SLUGS = Object.keys(SERVICE_PAGE_META);

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    SLUGS.map((slug) => ({ locale, slug }))
  );
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: rawLocale, slug } = await params;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : 'en') as Locale;

  const meta = SERVICE_PAGE_META[slug];
  if (!meta) notFound();

  const dict = await getDictionary(locale);
  const card = dict.services.cards[meta.cardIndex];
  const t = dict.servicePages;

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />

      <PageHero
        headline={card.name}
        subtitle={card.tagline}
        image={meta.image}
      />

      <section className="svc-page__content">
        <div className="svc-page__inner">
          <a href={`/${locale}/#svcs`} className="sp-back">{t.backLink}</a>

          <div className="svc-page__body">
            <div className="svc-page__info">
              <p className="svc-page__blurb">{card.blurb}</p>
              <ul className="svc-page__bullets">
                {card.bullets.map((b, i) => (
                  <li key={i}>
                    <span className="svc__bullet-mark">✦</span>
                    {b}
                  </li>
                ))}
              </ul>
              <p className="svc-page__meta mono">{card.meta}</p>
            </div>

            <div className="svc-page__form-wrap">
              <h2 className="svc-page__form-title serif">{t.formTitle}</h2>
              <p className="svc-page__form-body">{t.formBody}</p>
              <ServiceEnquiryForm t={dict.contact} defaultEnquiry={card.name} />
            </div>
          </div>
        </div>
      </section>

      <div className="ip-cta">
        <h2 className="ip-cta__h serif">{t.ctaHeadline}</h2>
        <p className="ip-cta__body">{t.ctaBody}</p>
        <a href={`/${locale}/tickets`} className="btn btn--primary">{t.ctaButton}</a>
      </div>

      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}
