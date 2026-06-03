# Postignuća na projektu moreska.eu

Popis svega što je napravljeno u sklopu pokretanja novog web sjedišta i sustava prodaje ulaznica za HGD Sveta Cecilija. Razvrstano po cjelinama radi lakšeg pregleda i upravljanja.

---

## 1. Pravna i administrativna priprema

- Prikupljeni svi registracijski podaci HGD-a (OIB, MB, sjedište, zastupnik) za korištenje na trećim platformama (Stripe, Meta, Google).
- Identificirano da je u sudskom registru još uvijek upisana stara adresa weba (`korcula-moreska.com`), predviđena izmjena nakon DNS prebacivanja.
- Utvrđen pristup staroj WordPress stranici (Totohost, cPanel) za potrebe migracije.
- Pronađen kontakt prethodnog webmastera (info.nero3d@gmail.com) za pristupe Search Consoleu i Analyticsu stare domene.

## 2. Domena, DNS i infrastruktura

- Registrirana domena `moreska.eu`.
- Zatraženo prebacivanje DNS-a sa starog registrara (Totohost) na Hetzner DNS.
- Postavljeni SPF, DKIM i DMARC zapisi za slanje pošte s `info@moreska.eu`.
- Postavljen MX (ImprovMX) za primanje pošte na `info@moreska.eu` (preusmjeravanje na osobni inbox, bez sandučića za održavanje).
- Iznajmljen server u Hetzner Cloudu (Nürnberg) i instaliran Coolify za upravljanje deploymentom.
- Konfiguriran automatski SSL preko Traefika (Let's Encrypt).
- Postavljen build pipeline (Nixpacks) s pinom Node verzije i provjerom build-a u Linux kontejneru prije pushanja.

## 3. Vanjski servisi

- **Stripe:** otvoren i verificiran račun za HGD; integriran Payment Element (kartice + Google Pay + Apple Pay); postavljen webhook s verifikacijom potpisa; pripremljen prijelaz sa starog endpointa na novi (dual-webhook tijekom DNS rezanja).
- **Brevo (e-mail):** otvoren račun; verificirana domena; postavljeno slanje s `info@moreska.eu` na besplatnom planu (300 dnevno / 9.000 mjesečno).
- **ImprovMX:** postavljeno preusmjeravanje dolazne pošte.
- **Google Analytics 4 + Google Ads tag:** postavljeno mjerenje na novoj domeni, jedan zajednički GT-tag za GA4 i Ads, purchase event na potvrdi narudžbe.
- **Meta Business Manager + Meta Pixel:** otvoren i verificiran (issue #38 zatvoren).
- **Google Search Console:** verificirano vlasništvo nove domene; izvezena baseline povijest sa stare domene (`docs/migrations/`).

## 4. Sigurnost i zaštita podataka (GDPR)

- Stranica Politike privatnosti (HR + EN), pet sekcija, sukladno GDPR-u.
- Stranica Politike kolačića (HR + EN).
- Cookie banner s lokalnim spremanjem pristanka; mjerni kodovi se učitavaju tek nakon prihvaćanja.
- Pristupi po ulogama u admin sustavu (admin vs. door-staff), door-staff ne vidi kupce ni narudžbe, samo brojke.
- Field-level zaštita uloge korisnika protiv samodizanja prava.
- Refund ruta dvostruko provjerava admin ulogu i u handleru (ne oslanja se samo na collection access).
- Sigurnosni HTTP headeri (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- Fail-fast na nedostatak `PAYLOAD_SECRET` (sprječava generiranje krivotvorivih JWT tokena).

## 5. Web stranica, javni dio

### Početna stranica
- Hero video (verzija za desktop i vertikalna za mobitel, s posterom za brzo prvo bojanje).
- Sekcije: O nama, Moreška, Raspored / Ulaznice, Povijest (4 vinjete), Sekcije društva, Usluge, Kontakt, Footer.
- Animacijska sekvenca hero-a (logo → ime → godina osnutka).

### Statičke stranice
- `/about`, povijest HGD-a, 8 povijesnih vinjeta, kartice sekcija, CTA.
- `/sections/[slug]`, Moreška, Puhački orkestar, Klapa, Zbor.
- `/services/[slug]`, Privatna Moreška, Moreška iskustvo (s upitnim obrascem).
- `/tickets`, javni raspored predstava iz baze; sakriva otkazane i rasprodane.
- `/privacy-policy`, `/cookie-policy`.

### Dvojezičnost (hrvatski + engleski)
- Detekcija jezika preko kolačića i `Accept-Language` headera, bez prefiksa u URL-u.
- Sve poruke u `src/messages/{en,hr}.json`.
- Pripremljena podloga za dodavanje njemačkog jezika (samo nova datoteka i unos u proxy).

### Dizajn
- Tipografija: Bodoni Moda SC (naslovi), IBM Plex Mono (oznake), Inter (tekst).
- Tematski tokeni i responsive breakpointi (1280 / 1024 / 768 / 480).
- Mobilni layout posebno optimiziran za sekciju predstava i kartica sekcija.

## 6. Sustav prodaje ulaznica (Stripe checkout)

- `/checkout/[showId]`, quantity picker (odrasli / djeca), forma kupca, Stripe Payment Element.
- Cijena: €20 odrasli / €10 djeca, fiksno.
- Kapacitet po dvorani fiksan (Ljetno kino 320, Centar za kulturu 250); preostala mjesta računaju se iz baze u realnom vremenu.
- Webhook `POST /api/stripe/webhook`: na uspješno plaćanje stvara Order i jedan QRToken po ulaznici.
- Potvrdna stranica `/checkout/[showId]/confirmation` s retry-om (5×400 ms) zbog race-a s webhookom.
- E-mail s ulaznicama (QR kodovi inline u poruci) preko Brevo-a.
- Atomic update prodaje (`UPDATE shows SET online_sold = online_sold + ...`), siguran pod paralelnim zahtjevima.

## 7. QR ulaznice i skeniranje na ulazu

- Svaka ulaznica = jedan unikatan QR (token u URL-u), generira se kod plaćanja.
- `/scan/[token]` stranica je svjesna prijave:
  - **Neprijavljeni** (kupac koji skenira iz e-maila): prikazuje pregled ulaznice i upozorenje "ne skenirajte ponovno", bez upisa u bazu.
  - **Prijavljeni** (admin ili door-staff): atomic mark-and-read s tri ishoda, VALID / VEĆ SKENIRANO / NEVAŽEĆE.
- Race-safe (provjereno: 20 paralelnih skenova istog tokena → točno jedan VALID).
- "Undo scan" link unutar 2 minute za slučaj greške na ulazu.
- Mobilno optimizirano (skeniranje s bilo kojeg telefona).

## 8. Admin sučelje (Payload CMS)

- Integriran Payload CMS v3 unutar Next.js aplikacije, dostupan na `/admin`.
- Kolekcije: Shows (predstave), Orders (narudžbe), QRTokens, ContactSubmissions, Users.
- **Pregled predstava:**
  - Pojedinačna izrada predstave.
  - Bulk kreiranje po rasponu datuma.
  - Otkazivanje predstave.
  - Unos broja prodanih ulaznica na ulazu (in-person sales).
- **Pregled narudžbi:**
  - Lista narudžbi po predstavi.
  - Pojedinačni povrat novca preko Stripea (idempotentno, sprječava dvostruki refund).
- **Statistika:**
  - `/admin/stats`, agregat sezone (prodano, skenirano, prihod, po dvorani) + tablica predstava (nadolazeće + danas + zadnjih 7 dana).
  - `/admin/stats/[showId]`, drill-down po predstavi, ovisno o ulozi (door-staff vidi samo brojke, admin i listu kupaca).

## 9. Uloge i pristupi

- Dvije uloge: `admin` i `door-staff`.
- Door-staff dijeli zajednički račun, korisničko ime **`tehnika`** (bez emaila, ADR-0011; lozinka u password manageru, nije u repou).
- Door-staff vidi: predstave, statistiku, vlastiti korisnički zapis. Ne vidi: kupce, narudžbe, kontakt forme.
- Admin: puni pristup.

## 10. SEO i pronalaženje na webu

- `generateMetadata`, sitemap, robots.txt, Organization schema (JSON-LD), brand-layer naslovi.
- Event schema (JSON-LD) na `/tickets` i `/checkout/[showId]` za svaku nadolazeću predstavu.
- Provjera da Googlebot (bez kolačića) dobije engleski sadržaj.
- Blog infrastruktura: `/blog` index + `/blog/[slug]` + BlogPosting schema (sadržaj se piše naknadno).

## 11. Razvojni procesi

- Postavljena testna suita (unit testovi za ključnu logiku: kapacitet, cijene, scan token, refund, statistika).
- Bootstrap baze (`scripts/bootstrap-db.mjs`), idempotentni SQL u `db/schema/*.sql` koji se izvršava prije pokretanja aplikacije.
- Dokumentirani deploy "gotchas" (Coolify/Nixpacks, lockfile, esbuild override).
- Multi-context dokumentacija (`CONTEXT-MAP.md` + per-context `CONTEXT.md`).
- ADR sustav za odluke koje se teško vraćaju.

---

## Što ostaje napraviti

### Prije prelaska (cutover)
- **Cutover (issue #11):** end-to-end smoke test u produkciji + prebacivanje DNS-a sa stare WordPress stranice.
- Praćenje prvih 2 tjedna nakon cutovera (issue #79).

### Marketing i kanali prodaje (vode drugi članovi HGD-a, ne developer)
- Google Business Profile (#36).
- TripAdvisor listing (#35).
- Listanje na Viator i GetYourGuide (#39).
- Onboarding voditelja oglasnih kampanja (#73): pristupi GA4, Google Ads, Meta Business Manager.
- Pokretanje Google Ads kampanje (~€300/mj) (#46).
- Pokretanje Meta retargeting kampanje (~€150/mj) (#45).
- Konsolidacija društvenih mreža pod kontrolom HGD-a (Facebook, Instagram, TikTok, YouTube) (#67).

### B2B i operativno
- Workflow rezervacija za agencije i hotele (#86).
- Stranica politike povrata + workflow obavijesti kupcima pri promjeni dvorane na zimsku (#94).
- Bulk slanje e-maila kupcima nakon predstave (zahvala + zamolba za recenziju) (#57).
- Dizajn i tisak 500 QR kartica za prikupljanje recenzija + obuka osoblja na ulazu (#43).
- Bilten subdomena `bilten.moreska.eu` za marketinški mail (#56).
- Nadogradnja Brevo plana na Starter (~€9/mj) kad bulk mailovi krenu (#54).

### Sadržaj
- Pisanje prvih 6 dugih blog postova (jedan mjesečno) (#47).
- Stvaranje HGD-kontroliranog Google računa preko `info@moreska.eu` (#65).
- Postavljanje e-mail aliasa (tickets@, pr@, bookings@, press@) (#53).
- Door-staff login u produkciji koristi korisničko ime `tehnika` (bez emaila, ADR-0011).

### Nakon sezone (odgođeno)
- Upravljanje sadržajem preko Payload CMS-a (O nama, stranice sekcija, Privacy Policy).
- Bulk refund pri otkazivanju cijele predstave.
- CSV izvoz e-mailova kupaca.
- Bulk e-mail svim kupcima konkretne predstave.
- Migracija slika na `next/image`.
- SEO metadata na svim podstranicama.
- Njemački jezik.
