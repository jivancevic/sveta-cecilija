# Moreškant /app redizajn: Mobbin reference

Datum: 2026-09-12. Izvor: Mobbin MCP (`search_screens`, `search_flows`), iOS osim gdje piše web.
Napomena o pokrivenosti: Spond, Heja, TeamSnap, Deputy, When I Work, Sling i 7shifts **nisu u Mobbinovoj bazi**.
Najbliže zamjene za "tim/RSVP" su GroupMe, Apple Invites, LINE, Luma, Meetup; za "sljedeća smjena" Zocdoc, Jobber, Meetup.
Cijeli dokument je ulaz za `/prototype`; ništa ovdje ne mijenja kod.

Zajednički kontekst za sve poteze: `.app` scope u `app.css`, kamen/zlato tokeni, Labrada, hrvatski, bez em-crtica,
"moreška" malim slovom, plesač je moreškant, PWA bez native appa i bez cachea.

---

## 1. Tab bar s tri kartice: Izvedbe / Moje / Više

| Ref | App | URL | Zašto |
|---|---|---|---|
| 1a | Pocket | https://mobbin.com/screens/214b56b4-2e07-414f-b961-a7f61a62be77 | Točno tri kartice (Home / Saves / Settings) s ikonom + labelom, bez FAB-a; najčišći uzorak "sadržaj / moje / ostalo" i ista podjela kao Izvedbe / Moje / Više. |
| 1b | Commons | https://mobbin.com/screens/94e41053-dcdc-498c-9556-81fe3ab891d8 | Tri kartice (Home / Search / Progress) gdje treća nosi osobnu statistiku; pokazuje da "Moje" može biti bar chart tab, ne profil. |
| 1c | Saturn Calendar | https://mobbin.com/screens/a885aa72-f8e7-4752-8584-3f2fdac06b01 | Tri kartice (Now / Friends / Directory) na tamnoj podlozi s aktivnim stanjem samo bojom + podcrtom; blizu naše tamne kamen palete. |
| 1d | Partiful | https://mobbin.com/screens/fb703a16-de4f-42c9-b8df-d7c135d0e5ff | Tri ikone bez labela u plutajućem baru; protuprimjer, za nas labeli ostaju jer su korisnici stariji članovi. |

Zaključak za prototip: ikona + labela, tri kartice, aktivna kartica zlatom, bar uvijek vidljiv (nije plutajući), safe-area padding za iOS PWA.

---

## 2. Početni ekran: "sljedeća izvedba" hero + kompaktan popis po mjesecu

| Ref | App | URL | Zašto |
|---|---|---|---|
| 2a | Zocdoc | https://mobbin.com/screens/20a3461b-b970-489a-a6fe-09109272e261 | Sekcija "Up next" kao jedna velika kartica s datumom, vremenom, lokacijom i redom ikona (poziv, kalendar, karta) ispod; direktan predložak za hero "Sljedeća izvedba". |
| 2b | Jobber | https://mobbin.com/screens/c3fc8f9e-52c4-465b-a55c-b7ac5eeec9a8 | Pozdrav + datum u zaglavlju, prva sljedeća obveza kao kartica s vertikalnom bojom-statusom, ispod "This week" popis; struktura hero + lista. |
| 2c | Meetup | https://mobbin.com/screens/662f6722-eca0-4ca7-9a3e-ba589067884b | "Incoming" kartica s odbrojavanjem ("In 2m") i inline akcijom "Check in"; pokazuje kako hero nosi primarnu akciju bez otvaranja detalja. |
| 2d | GroupMe (Calendar) | https://mobbin.com/screens/9e3a8431-a646-40dc-98ee-ec4f9f4149ff | Popis grupiran po mjesecu (naslov "November"), datum kao pločica, a RSVP kao dva velika gumba "I'm in" / "Can't go" odmah u retku; ovo je naš "Dolazim / Ne dolazim" po izvedbi. |
| 2e | Apple Invites | https://mobbin.com/screens/5a5a0fdb-b99a-4352-bd57-80680ca6862d | Tri RSVP opcije u jednom širokom segmentu (Going / Not Going / Maybe) preko hero slike; referenca za hero s odgovorom, mi koristimo dvije opcije. |
| 2f | LINE | https://mobbin.com/screens/523b13e4-9262-4a93-88ad-83d96d8aa1bb | Attend / Decline / Maybe kao pill gumbi s ikonom, odabrano stanje ispunjeno bojom; jasan "odabrani" vizual koji nam treba nakon odgovora. |
| 2g | Luma | https://mobbin.com/screens/13f4d7f4-65eb-4650-9c43-b04cdf505ac8 | "Your Events" popis s badge-om statusa na thumbnailu (Going / Invited / Hosting); badge stanja na kartici izvedbe (Dolazim / Ne dolazim / Bez odgovora). |

Zaključak za prototip: hero = sljedeća izvedba (datum, sat, mjesto, vojska ako je već dodijeljena) + dva velika gumba Dolazim / Ne dolazim; ispod naslovi po mjesecu (Rujan, Listopad) i kompaktni redovi s badge-om odgovora.

---

## 3. Detalj izvedbe sa segment kontrolom: Dolaze / Postava / Ulaznice

| Ref | App | URL | Zašto |
|---|---|---|---|
| 3a | GroupMe (event) | https://mobbin.com/screens/b699aec3-92c9-4579-af4e-820156a72176 | Detalj događaja: naslov, datum, "Add to calendar", pa segment Going (1) / Not Going (0) / Pending (1) s brojačima i lista ljudi; plus sticky RSVP gumbi na dnu. Najbliže našem Dolaze tabu. |
| 3b | GroupMe (prazan segment) | https://mobbin.com/screens/c4539c46-dec3-4f16-873b-e335308fe41c | Isti ekran s praznim segmentom i jednom rečenicom ("No one has said they aren't going yet"); uzorak za prazan Ne dolaze / Bez odgovora. |
| 3c | Luma (Guest List) | https://mobbin.com/screens/bf0994ca-cd25-48d0-9af0-ee31324ca47a | Segment Going / Invited / Not Going / Checked In + tap na osobu otvara bottom sheet s akcijom "Check In"; uzorak za voditeljev tap na moreškanta (poziv, promjena vojske). |
| 3d | Granola | https://mobbin.com/screens/b77f0087-25d0-4e08-b7f7-7661518faf0c | Popis kontakata gdje svaki red ima okrugli gumb za poziv desno; ovo je "attendee list s pozivom na broj". |
| 3e | Premier League | https://mobbin.com/screens/b168f108-8d22-45ad-b6e1-2e2e7a19b981 | Line-ups grupirani po poziciji (Goalkeeper, Defenders) s brojem, imenom i chevronom; naša Postava po ulogama (Moro, Bula, Osman, vojnici) bez terena. |
| 3f | MLS | https://mobbin.com/screens/e3953932-f34f-4571-9097-af00fe982fc2 | Roster tab u detalju kluba, grupe po poziciji s karticama; alternativa 3e ako želimo veće avatare. |
| 3g | Letterboxd | https://mobbin.com/screens/4502da16-aa96-434f-906e-e6cb56090ef5 | Kompaktan pet-segmentni kontrol na tamnoj podlozi ispod naslova; vizual segmenta koji stane u 375 px i ne izgleda kao iOS default. |

Zaključak za prototip: zaglavlje (naslov, datum, mjesto, moj odgovor) + segment Dolaze / Postava / Ulaznice; Dolaze grupira Crni / Bili / Bez odgovora s brojačima i gumbom za poziv; Postava po ulogama, sa "nije potvrđena" stanjem; Ulaznice = moje comp ulaznice (max 4). Voditeljski alati (potvrdi postavu, alarm) kao zasebna sekcija ili sheet vidljiva samo `moreska` dozvoli.

---

## 4. Onboarding u 3 koraka nakon prve prijave

Koraci: dodaj na početni zaslon (iOS PWA, ručno preko Share), uključi obavijesti, pretplati kalendar.

| Ref | App | URL | Zašto |
|---|---|---|---|
| 4a | HelloFresh (flow) | https://mobbin.com/flows/b8c24066-cf86-473e-b353-519ffa22782f | Permission priming: lažni primjer notifikacije + naslov "Why should I allow notifications now?" + Continue prije sistemskog dijaloga; točno ono što trebamo prije `Notification.requestPermission()`. |
| 4b | Roku (flow) | https://mobbin.com/flows/f559500e-a354-42d6-936b-882a1cdc63fd | Priming ekran s Next / Skip parom, sistemski dijalog preko njega; pokazuje Skip kao sekundarni gumb, ne link. |
| 4c | lululemon (flow) | https://mobbin.com/flows/68559489-94dd-47cd-b157-c17687bef70f | "Stay in the Know" s tri konkretne koristi (ikona + naslov + rečenica) i "Not Now"; uzorak za objašnjenje zašto obavijesti (poziv na izvedbu, promjena postave, alarm). |
| 4d | Linktree (flow) | https://mobbin.com/flows/e8a1aab9-185f-4c4c-a414-6b7c46a400ce | Setup checklist 5/6 s progress barom, precrtanim gotovim koracima, "Skip" po koraku i završnim "You're all set"; uzorak za ponovljivi checklist koji ostaje dostupan u Više. |
| 4e | Numo (flow) | https://mobbin.com/flows/8050d78c-3f1b-435e-a0c5-1d0137137aaf | Segmentirani step indicator na vrhu + "Skip onboarding" gore desno; čist vizual za 3 koraka. |
| 4f | Matter (web) | https://mobbin.com/screens/ac2e780d-158a-4c3e-a96d-e9bb29b2d86f | Jedini web primjer "napravi nešto izvan appa": ilustracija gdje kliknuti + "I've pinned it" potvrda + Skip; analog za iOS "Podijeli > Dodaj na početni zaslon" jer beforeinstallprompt ne postoji. |
| 4g | Fixtured (Export Calendar Feed) | https://mobbin.com/screens/116bc4df-0cd2-476f-932f-c17976b2d8cc | "Sync to calendar" + "Link copied" + ikone Apple/Google kalendara; uzorak za pretplatu na .ics feed izvedbi. |
| 4h | Tripsy (Calendar Sync) | https://mobbin.com/screens/09fe4e43-fbbf-4ec6-91f0-72bfd165fed2 | "Subscribe to Tripsy Calendar" + "Share Calendar URL" u jednoj kartici; minimalna verzija 4g. |

Napomena: Mobbin nema pravi iOS Safari "Add to Home Screen" hint (pretraga vraća samo Matter i Wix). Za taj korak prototip crta vlastitu ilustraciju: ikona Share (kvadrat sa strelicom) > "Dodaj na početni zaslon", s detekcijom `navigator.standalone` da se korak preskoči kad je već instalirano.

Zaključak za prototip: tri ekrana, step indicator gore, "Preskoči" gore desno, jedan primarni gumb po koraku; checklist ostaje dohvatljiv u Više dok sva tri nisu obavljena.

---

## 5. Kartica Moje: moje izvedbe ove sezone, uloge, bar po mjesecima, empty state

| Ref | App | URL | Zašto |
|---|---|---|---|
| 5a | AllTrails (Progress) | https://mobbin.com/screens/b1ec81de-e8ff-4800-8308-efa22e4cd428 | Segment Month / Year / All + jednostavan bar chart bez mreže + 2x2 brojčane pločice ispod; ovo je cijeli Moje ekran u jednoj slici (izvedbe po mjesecu, ukupno, uloge). |
| 5b | Garmin Connect (Stats) | https://mobbin.com/screens/91f4bdb5-de2e-4789-9ec8-127a12e9d08c | Tamni bar chart po mjesecima s praznim stupcima + "Personal Records" tablica; pokazuje kako izgledaju mjeseci bez izvedbe. |
| 5c | Strava (You / Progress) | https://mobbin.com/screens/d54eb1e6-1e9d-463e-9450-3e77f2b04136 | Mjesečni kalendar s označenim danima aktivnosti + brojač; alternativa baru: mreža dana s točkama na izvedbama. |
| 5d | Coursera | https://mobbin.com/screens/7e5f69c8-bf8b-4a66-99dc-c811a1aeded7 | Empty state: ikona, naslov, jedna rečenica, jedan gumb; točan omjer koji tražimo ("Još nemaš izvedbi ove sezone" + "Pogledaj izvedbe"). |
| 5e | Ubank | https://mobbin.com/screens/0f38d793-9dc5-4c87-b22f-c4c0290797fa | Empty state s brojačem u podnaslovu ("Total of 0 bills tracked") i pill CTA; varijanta koja zadržava zaglavlje statistike. |
| 5f | timespent | https://mobbin.com/screens/2110919d-e927-4187-af30-c24230f55bff | Empty state s primarnim gumbom + sekundarnim "See Demo"; ako želimo "Pogledaj prošlu sezonu" kao sekundarnu akciju. |

Zaključak za prototip: gore brojčane pločice (Izvedbe / Kao Moro / Kao Bula / Ostalo), bar po mjesecima sezone (lipanj do rujan), popis mojih izvedbi s ulogom; empty state po 5d.

---

## Tri uzorka koje /prototype preuzima doslovno

1. **GroupMe event detail** (3a + 2d): segment s brojačima Going / Not Going / Pending, lista ispod, dva velika RSVP gumba sticky na dnu. Postaje naš detalj izvedbe i naš redak u popisu.
2. **Zocdoc "Up next" kartica** (2a): jedna hero kartica s datumom, satom, mjestom i redom ikona ispod. Postaje hero "Sljedeća izvedba" na početnom ekranu.
3. **AllTrails Progress** (5a): segment razdoblja + bar chart + 2x2 pločice. Postaje kartica Moje.

Sekundarno (ako stane): HelloFresh priming (4a) za korak obavijesti i Coursera empty state (5d).

---

## Predloženi /prototype prompt

```
/prototype Moreškant /app redizajn, tri ekrana, mobilni PWA (375 px), hrvatski, bez em-crtica,
"moreška" malim slovom, plesač je moreškant. Stil: .app scope, kamen/zlato tokeni iz app.css,
Labrada. Statični HTML prototip s lažnim podacima, bez backenda, bez promjena u src/.
Reference: ~/Desktop/moreskant-mobbin-refs.md (uzorci 1, 2, 3 na kraju dokumenta).

Ekran A, Početni s tab barom (Izvedbe / Moje / Više, ikona + labela, aktivno zlatom, safe-area):
- hero kartica "Sljedeća izvedba" po uzoru na Zocdoc "Up next": datum, sat, Ljetno kino, moja vojska
  ako je dodijeljena, ispod dva velika gumba Dolazim / Ne dolazim (odabrano stanje ispunjeno zlatom,
  po uzoru na LINE Attend/Decline)
- ispod naslovi po mjesecu (Rujan, Listopad) i kompaktni redovi: datum pločica, sat, mjesto,
  badge odgovora (Dolazim / Ne dolazim / Bez odgovora), po uzoru na GroupMe Calendar
- pokaži i varijantu bez sljedeće izvedbe (kraj sezone)

Ekran B, Detalj izvedbe sa segmentima (Dolaze / Postava / Ulaznice), po uzoru na GroupMe event detail:
- zaglavlje: naslov, datum, sat, mjesto, moj odgovor kao chip
- segment s brojačima; Dolaze grupira Crni (n) / Bili (n) / Bez odgovora (n), svaki red ima
  ime, nadimak i okrugli gumb za poziv (Granola); Postava po ulogama (Moro, Bula, Osman, Otmanović,
  Vojnici) s praznim stanjem "Postava još nije potvrđena"; Ulaznice = moje comp ulaznice, brojač x/4
- sticky Dolazim / Ne dolazim na dnu iznad tab bara
- sekcija "Alati za voditelja" (potvrdi postavu, pošalji alarm) vidljiva samo u varijanti moreska

Ekran C, Onboarding u 3 koraka nakon prve prijave, segmentirani step indicator gore i "Preskoči"
gore desno (Numo), jedan primarni gumb po koraku:
1. Dodaj na početni zaslon: vlastita ilustracija iOS Share ikone + "Dodaj na početni zaslon",
   gumb "Dodao sam" (Matter uzorak); korak preskočen ako je već standalone
2. Uključi obavijesti: priming po HelloFreshu, lažni primjer obavijesti "Postava za subotu je
   potvrđena", tri koristi u redu ikona (lululemon), gumb "Uključi obavijesti", link "Ne sada"
3. Pretplati kalendar: kartica s "Pretplati se na kalendar izvedbi" + "Kopiraj link" (Tripsy/Fixtured)
Završni ekran "Spremno" s jednim gumbom "Na izvedbe".

Isporuči kao jedan HTML fajl s tri ekrana jedan do drugog i toggle za varijante (moreska / moreškant,
prazno / puno). Nakon prototipa navedi 3 pitanja o modelu stanja koja su ispala nejasna.
```
