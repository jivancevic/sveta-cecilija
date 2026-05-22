/* Hero, Schedule (Currently at the Opera-style), History vignettes — Korčula Stone refined */

const Fragment = React.Fragment;

// ---------- NAV ----------
function Nav({ theme }) {
  return (
    <nav className="nav">
      <a href="#" className="nav__logo" aria-label="HGD Sveta Cecilija">
        <img src="assets/cecilija-logo.png" alt="" />
        <span className="nav__wordmark">
          <span className="top">Sveta Cecilija</span>
          <span className="bot">Korčula · est. 1883</span>
        </span>
      </a>
      <div className="nav__links">
        <a href="#sched">Performances</a>
        <a href="#about">About</a>
        <a href="#history">History</a>
        <a href="#secs">Sections ▾</a>
        <a href="#svcs">Services ▾</a>
        <a href="#contact">Contact</a>
        <span className="nav__lang"><span className="active">EN</span> · HR</span>
        <a className="btn btn--primary btn--small nav__cta" href="#sched">Buy Tickets</a>
      </div>
    </nav>
  );
}

// ---------- HERO ----------
function Hero({ theme }) {
  return (
    <section className="hero">
      <video
        className="hero__video"
        src="assets/hero-horizontal.webm"
        autoPlay muted loop playsInline
      />
      <div className="hero__darken" />

      <div className="hero__seq">
        <div className="hero__word hero__word--1 serif">MOREŠKA</div>
        <div className="hero__word hero__word--2 serif">KORČULA</div>
        <div className="hero__word hero__word--3 serif">HGD SVETA CECILIJA</div>
      </div>

      <div className="hero__grey" />

      <div className="hero__logo hero__logo--big">
        <img src="assets/cecilija-logo.png" alt="" />
        <div className="name serif">HGD Sveta Cecilija</div>
        <div className="est">Korčula · since 1883</div>
      </div>

      <div className="hero__ctas">
        <a className="btn btn--primary" href="#sched">Buy Tickets</a>
        <a className="btn btn--ghost" href="#about">Discover</a>
      </div>
      <div className="hero__scroll">scroll ↓</div>
    </section>
  );
}

// ---------- DIVIDER (Stone style only) ----------
function GoldDivider() {
  return (
    <div className="divider">
      <span className="divider__rule" />
      <span className="divider__star">✦</span>
      <span className="divider__rule" style={{ width: '32%' }} />
    </div>
  );
}

// ---------- ABOUT ----------
function About() {
  return (
    <section id="about" className="about">
      <div className="about__copy">
        <div className="about__eyebrow">Since 1883</div>
        <h2 className="about__h serif">A Tale of Sword<br/>and Dance</h2>
        <p className="about__body">
          HGD Sveta Cecilija has stood as the guardian of Korčula's most treasured
          ritual. The Moreška — Europe's last authentic war dance — is performed here,
          on this island, by the sons of Korčula. Iron swords, archaic verse, and
          seven battles that have not changed in centuries. Come witness it.
        </p>
        <a href="#about" className="about__cta">Discover Our Story →</a>
      </div>
      <div className="about__collage">
        <div className="about__photo about__photo--tall">
          <img src="assets/moreska02.jpg" alt="Moreška performers in costume" />
        </div>
        <div className="about__photo about__photo--top">
          <img src="assets/black-king-closeup.jpg" alt="Black King" />
        </div>
        <div className="about__photo about__photo--mid">
          <img src="assets/bula-kralj.jpg" alt="Bula and king" />
        </div>
        <div className="about__photo about__photo--bot">
          <img src="assets/torches.jpg" alt="Torches" />
        </div>
      </div>
    </section>
  );
}

// ---------- SCHEDULE — Currently-at-the-Opera grid ----------
function Schedule() {
  return (
    <section id="sched" className="opera">
      <div className="opera__head">
        <div className="opera__eyebrow">Currently at the Summer Cinema</div>
        <h2 className="opera__h serif">2026 Season</h2>
        <div className="opera__sub">
          Twenty-four performances at the{' '}
          <a href="https://maps.app.goo.gl/jbkEs9o7L9oa3S2F9" target="_blank" rel="noreferrer">Summer Cinema, Korčula</a>
          {' '}· May through October · Showtime 21:00.
        </div>
      </div>

      <div className="opera__grid">
        {window.SCHEDULE_UPCOMING.map((p, i) => {
          const remaining = p.soldOf - p.sold;
          const tight = remaining < 100;
          const [d, mo, yr] = p.date.split(' ');
          return (
            <a key={i} href="#" className="opera__card">
              <div className="opera__photo">
                <img src={p.image} alt="" />
                <div className="opera__photo-overlay" />
                <div className="opera__tag">{p.tag}</div>
              </div>
              <div className="opera__body">
                <div className="opera__date">
                  <span className="opera__day mono">{d}</span>
                  <span className="opera__mo mono">{mo} {yr}</span>
                </div>
                <div className="opera__divider" />
                <h3 className="opera__title serif">Moreška</h3>
                <div className="opera__meta">
                  <span>{p.day} · {p.time}</span>
                  <span className={`opera__pill ${tight ? 'amber' : ''}`}>
                    <span className="dot" />
                    {tight ? `${remaining} left` : 'Available'}
                  </span>
                </div>
                <div className="opera__cta">
                  <span className="opera__price mono">€20 · €10 (under 14)</span>
                  <span className="opera__buy">Buy Tickets →</span>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <div className="opera__foot">
        <a href="#" className="opera__viewall">View All {window.SCHEDULE_TOTAL} Performances →</a>
        <div className="opera__price-note">Groups: every 5th ticket free (free ticket is always an adult ticket).</div>
      </div>
    </section>
  );
}

// expose
Object.assign(window, { Nav, Hero, GoldDivider, About, Schedule });
