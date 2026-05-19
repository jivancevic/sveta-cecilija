import Nav from '@/components/Nav';
import PageHero from '@/components/PageHero';
import Footer from '@/components/Footer';
import type { Dictionary } from '@/lib/i18n';
import type { Locale } from '@/proxy';

interface Props {
  locale: Locale;
  dict: Dictionary;
  page: Dictionary['privacyPage'] | Dictionary['cookiePage'];
  heroImage: string;
}

export default function LegalPage({ locale, dict, page, heroImage }: Props) {
  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />

      <PageHero
        headline={page.heroHeadline}
        subtitle={page.heroSubtitle}
        image={heroImage}
      />

      <section className="legal-page__content">
        <div className="legal-page__inner">
          <p className="legal-page__updated mono">{page.lastUpdated}</p>

          {page.sections.map((s, i) => (
            <div key={i} className="legal-page__section">
              <h2 className="legal-page__h serif">{s.heading}</h2>
              {s.body.split('\n\n').map((para, j) => (
                <p key={j} className="legal-page__p">{para}</p>
              ))}
            </div>
          ))}
        </div>
      </section>

      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}
