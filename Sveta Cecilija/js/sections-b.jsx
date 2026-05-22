/* History vignettes (gallery cards), Sections, Services, Contact, Footer (atmospheric) */

// ---------- HISTORY VIGNETTES ----------
function History() {
  return (
    <section id="history" className="hist">
      <div className="hist__head">
        <div className="hist__eyebrow">Four Centuries</div>
        <h2 className="hist__h serif">A Curated History</h2>
        <p className="hist__sub">Four moments that brought a Spanish ritual of mock combat to a Korčulan stone courtyard — and kept it there.</p>
      </div>
      <div className="hist__grid">
        {window.HISTORY_VIGNETTES.map((v, i) => (
          <article key={i} className="vignette">
            <div className={`vignette__photo ${v.imageContain ? 'contain' : ''}`}>
              <img src={v.image} alt="" />
            </div>
            <div className="vignette__body">
              <div className="vignette__year serif">{v.year}</div>
              <div className="vignette__place">{v.place}</div>
              <h3 className="vignette__title serif">{v.title}</h3>
              <p className="vignette__text">{v.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------- SECTIONS BLOCK (dark) ----------
function SectionsBlock() {
  const cards = window.SECTIONS_CARDS;
  const feature = cards.find(c => c.feature);
  const others  = cards.filter(c => !c.feature);
  return (
    <section id="secs" className="secs">
      <div className="secs__eyebrow">Four ensembles, one society</div>
      <h2 className="secs__h serif">Our Sections</h2>
      <div className="secs__grid">
        <Card data={feature} feature />
        <div className="secs__col-right">
          {others.map(c => <Card key={c.key} data={c} />)}
        </div>
      </div>
    </section>
  );
}

function Card({ data, feature }) {
  return (
    <a className={`card ${feature ? 'card--feature' : ''}`} href="#">
      <img src={data.image} alt="" />
      <div className="overlay" />
      <div className="card__body">
        <h3 className="card__name serif">{data.name}</h3>
        <p className="card__blurb">{data.blurb}</p>
        <span className="card__cta">Discover →</span>
      </div>
    </a>
  );
}

// ---------- SERVICES ----------
function Services() {
  const detailsByKey = {
    private: {
      tagline: 'For your group, for one night only',
      bullets: [
        'Full Moreška performance with all seven kolapi',
        'Live brass orchestra & Klapa a cappella opening',
        'Summer Cinema (open-air) or Centar za kulturu (indoor)',
        'Up to 600 guests · Bookings for cruises, retreats, weddings',
      ],
      meta: 'Pricing on enquiry · 90 minutes',
      ctaLabel: 'Request a Quote',
    },
    experience: {
      tagline: 'A close encounter with the tradition',
      bullets: [
        'Heritage & regalia — costumes and iron swords up close',
        'Origins of the Moreška, from Lérida to Korčula',
        'Highlights of the dramatic dialogues, in archaic Korčulan',
        'Excerpts of the chivalrous sword dance, performed live',
      ],
      meta: 'Min. 5 people · By appointment · 60 minutes',
      ctaLabel: 'Enquire Now',
    },
  };

  return (
    <section id="svcs" className="svcs">
      <div className="svcs__eyebrow">Bring Moreška to your group</div>
      <h2 className="svcs__h serif">Private Experiences</h2>
      <p className="svcs__lede">Two ways to bring Korčula's living heritage closer — a full private staging, or an intimate behind-the-scenes encounter.</p>
      <div className="svcs__grid">
        {window.SERVICES_CARDS.map((s, i) => {
          const d = detailsByKey[s.key];
          return (
            <article key={s.key} className="svc">
              <div className="svc__photo">
                <img src={s.image} alt="" />
                <div className="svc__photo-overlay" />
                <span className="svc__num mono">0{i + 1} / 02</span>
              </div>
              <div className="svc__body">
                <div className="svc__tagline">{d.tagline}</div>
                <h3 className="svc__title serif">{s.name}</h3>
                <p className="svc__blurb">{s.blurb}</p>
                <ul className="svc__bullets">
                  {d.bullets.map((b, j) => (
                    <li key={j}><span className="svc__bullet-mark">✦</span>{b}</li>
                  ))}
                </ul>
                <div className="svc__foot">
                  <span className="svc__meta mono">{d.meta}</span>
                  <a className="btn btn--primary btn--small" href="#contact">{d.ctaLabel} →</a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ---------- CONTACT (compact, dark with greyed image) ----------
function Contact() {
  return (
    <section id="contact" className="contact contact--dark">
      <img className="contact__bg" src="assets/klapa-todor.webp" alt="" />
      <div className="contact__overlay" />
      <div className="contact__inner">
        <div className="contact__head">
          <div className="contact__eyebrow">We'd love to hear from you</div>
          <h2 className="contact__h serif">Get in Touch</h2>
          <p className="contact__sub">General enquiries, private bookings, press — write to us at <a href="mailto:info@moreska.eu">info@moreska.eu</a> or use the form. We respond within 2 business days.</p>
        </div>
        <form className="form" onSubmit={e => e.preventDefault()}>
          <div className="form__row">
            <div className="field">
              <label>Name</label>
              <input type="text" placeholder="Your name" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" placeholder="you@email.com" />
            </div>
          </div>
          <div className="form__row">
            <div className="field">
              <label>Enquiry type</label>
              <select defaultValue="">
                <option value="" disabled>Select…</option>
                <option>General</option>
                <option>Private Moreška</option>
                <option>Moreška Experience</option>
                <option>Press</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button className="btn btn--primary form__submit" type="submit">Send Message →</button>
            </div>
          </div>
          <div className="field">
            <label>Message</label>
            <textarea placeholder="Tell us about your enquiry…"></textarea>
          </div>
        </form>
      </div>
    </section>
  );
}

// ---------- FOOTER (atmospheric) ----------
function Footer() {
  return (
    <footer className="foot foot--atmos">
      <img className="foot__bg" src="assets/moreska-wide.jpg" alt="" />
      <div className="foot__overlay" />
      <div className="foot__inner">
        <div className="foot__brand">
          <img className="foot__logo" src="assets/cecilija-logo.png" alt="" />
          <div className="foot__tag serif">Guardians of the Steel Dance<br/>since 1883.</div>
        </div>
        <div className="foot__cols">
          <div className="foot__col">
            <h5 className="foot__col-h">Visit</h5>
            <a href="#sched">Performances</a>
            <a href="#about">About</a>
            <a href="#history">History</a>
            <a href="#secs">Sections</a>
            <a href="#svcs">Services</a>
          </div>
          <div className="foot__col">
            <h5 className="foot__col-h">Sections</h5>
            <a href="#">Moreška</a>
            <a href="#">Wind Orchestra</a>
            <a href="#">Klapa</a>
            <a href="#">Choir</a>
          </div>
          <div className="foot__col">
            <h5 className="foot__col-h">Contact</h5>
            <a href="mailto:info@moreska.eu">info@moreska.eu</a>
            <a href="#">Korčula, Croatia</a>
            <div className="foot__social">
              <a href="#">Facebook</a>
              <a href="#">Instagram</a>
              <a href="#">YouTube</a>
            </div>
          </div>
        </div>
      </div>
      <div className="foot__bottom">
        <div className="foot__legal">© 2026 HGD Sveta Cecilija · Privacy Policy · Cookie Policy</div>
        <div className="foot__lang"><span className="active">EN</span> · HR</div>
      </div>
    </footer>
  );
}

// ---------- HOMEPAGE ROOT ----------
function Homepage() {
  return (
    <div className="hp t-stone" data-screen-label="Homepage — Korčula Stone">
      <Nav />
      <Hero />
      <GoldDivider />
      <About />
      <Schedule />
      <History />
      <SectionsBlock />
      <Services />
      <Contact />
      <Footer />
    </div>
  );
}

Object.assign(window, { History, SectionsBlock, Services, Contact, Footer, Homepage });
