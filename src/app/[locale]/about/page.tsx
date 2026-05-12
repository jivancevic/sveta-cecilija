import { locales, type Locale } from '@/proxy';
import { getDictionary } from '@/lib/i18n';
import { HISTORY_VIGNETTES_META, SECTION_CARDS_META } from '@/lib/data';
import Nav from '@/components/Nav';
import PageHero from '@/components/PageHero';
import Footer from '@/components/Footer';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : 'en') as Locale;
  const dict = await getDictionary(locale);
  const t = dict.aboutPage;

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />

      <PageHero
        headline={t.heroHeadline}
        subtitle={t.heroSubtitle}
        image="/moreska01.jpg"
      />

      {/* Intro */}
      <section className="ip-section" style={{ background: 'var(--light)' }}>
        <div className="ip-intro">
          {t.intro.map((para: string, i: number) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </section>

      {/* History */}
      <section style={{ background: 'var(--light)', padding: 'var(--pad) var(--sectionPadX)' }}>
        <div style={{ maxWidth: 'var(--maxW)', margin: '0 auto' }}>
          <div className="ip-eyebrow">{t.historyHeadline}</div>
          <div className="ip-hist-grid ip-hist-grid--8">
            {HISTORY_VIGNETTES_META.map((meta, i) => {
              const v = t.allVignettes[i];
              return (
                <div className="vignette" key={meta.year}>
                  <div className={`vignette__photo${meta.imageContain ? ' contain' : ''}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={meta.image} alt={v.title} />
                  </div>
                  <div className="vignette__body">
                    <div className="vignette__year">{meta.year}</div>
                    <div className="vignette__place">{v.place}</div>
                    <h3 className="vignette__title">{v.title}</h3>
                    <p className="vignette__text">{v.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Ensembles */}
      <section style={{ background: 'var(--light)', padding: '0 var(--sectionPadX) var(--pad)' }}>
        <div style={{ maxWidth: 'var(--maxW)', margin: '0 auto' }}>
          <div className="ip-eyebrow">{t.ensemblesHeadline}</div>
          <p className="ip-ens-intro">{t.ensemblesIntro}</p>
          <div className="ip-ens-grid">
            {SECTION_CARDS_META.map((meta) => {
              const card = dict.sections.cards.find((c: { key: string }) => c.key === meta.key);
              const slug = meta.key === 'band' ? 'wind-orchestra' : meta.key;
              return (
                <a href={`/${locale}/sections/${slug}`} className="ip-ens-card" key={meta.key}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={meta.image} alt={card?.name ?? ''} />
                  <div className="ip-ens-card__body">
                    <div className="ip-ens-card__name serif">{card?.name}</div>
                    <p className="ip-ens-card__blurb">{card?.blurb}</p>
                    <span className="ip-ens-card__link">{dict.sections.discover}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="ip-cta">
        <h2 className="ip-cta__h serif">{t.ctaHeadline}</h2>
        <p className="ip-cta__body">{t.ctaBody}</p>
        <a href={`/${locale}#sched`} className="btn btn--primary">{t.ctaButton}</a>
      </div>

      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}
