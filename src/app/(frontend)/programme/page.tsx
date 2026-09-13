import Link from 'next/link';
import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { buildMetadata } from '@/lib/seo';

// The digital programme (#544): what a guest reads on their phone in the ten
// minutes between sitting down and the lights going out. Public, no login, no
// ticket data. The order of the sections is the design: the cast and the
// one-line-per-part guide first, for the guest with five minutes; the story,
// the seven kolapi and the history below, for whoever wants more. The page is
// dark by choice, the only public page that is, because a white screen in a
// dark open-air theatre glares at the guest and at everyone around them.
//
// The text is assembled from the sources #544 names (the moreška section page,
// docs/sveta-cecilija.md); the story paragraph is the section page's own, read
// from the same dictionary key so the two can never drift apart.

export async function generateMetadata() {
  const dict = await getDictionary('en');
  return buildMetadata({
    title: dict.programmePage.metaTitle,
    description: dict.programmePage.metaDescription,
    path: '/programme',
  });
}

export default async function ProgrammePage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.programmePage;
  const story = dict.sectionPages.moreska.storyBody;

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />

      <main className="programme">
        <header className="programme__head">
          <p className="programme__eyebrow">{t.eyebrow}</p>
          <h1 className="programme__h serif">{t.headline}</h1>
          <p className="programme__lead">{t.lead}</p>
        </header>

        <section className="programme__section" aria-labelledby="programme-cast">
          <h2 id="programme-cast" className="programme__h2">{t.castHeading}</h2>
          <dl className="programme__cast">
            {t.cast.map((c) => (
              <div key={c.name} className="programme__cast-row">
                <dt>{c.name}</dt>
                <dd>{c.line}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="programme__section" aria-labelledby="programme-evening">
          <h2 id="programme-evening" className="programme__h2">{t.eveningHeading}</h2>
          <ol className="programme__parts">
            {t.parts.map((p, i) => (
              <li key={p.title} className="programme__part">
                <span className="programme__part-n serif" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3 className="programme__part-title">{p.title}</h3>
                  <p className="programme__part-line">{p.line}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="programme__front-row">{t.frontRow}</p>
        </section>

        <section className="programme__section" aria-labelledby="programme-story">
          <h2 id="programme-story" className="programme__h2">{t.storyHeading}</h2>
          <p className="programme__body">{story}</p>
        </section>

        <section className="programme__section" aria-labelledby="programme-kolapi">
          <h2 id="programme-kolapi" className="programme__h2">{t.kolapiHeading}</h2>
          <p className="programme__body">{t.kolapiIntro}</p>
          <ol className="programme__kolapi">
            {t.kolapi.map((k, i) => (
              <li key={k.name} className="programme__kolap">
                <span className="programme__kolap-n" aria-hidden="true">{i + 1}</span>
                <div>
                  <span className="programme__kolap-name">{k.name}</span>
                  <span className="programme__kolap-line">{k.line}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="programme__section" aria-labelledby="programme-history">
          <h2 id="programme-history" className="programme__h2">{t.historyHeading}</h2>
          <p className="programme__body">{t.historyBody}</p>
          <Link href="/tickets" className="programme__tickets">{t.ticketsLink}</Link>
        </section>
      </main>

      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}
