# Pitanja za raspravu s upravom HGD-a

Otvorene odluke koje nadilaze tehničku implementaciju i zahtijevaju stav uprave (predsjednika i odbora). Za svaku temu naveden je kontekst, opcije i moja preporuka s obrazloženjem. Cilj je da uprava donese odluku, ne tražim potvrdu već donesenih odluka.

---

## 1. Naziv usluge "Moreška iskustvo"

**Kontekst:** Stranica `/services/moreska-experience` trenutno se prevodi kao "Moreška iskustvo" (HR) i "Moreška Experience" (EN). Naziv je radni i mora biti pamtljiv jer ide u oglase, na TripAdvisor, Viator i GetYourGuide.

**Opcije:**
1. **Moreška Experience** (zadržati radni naziv), već se koristi u kodu i marketinškim listanjima.
2. **Iza kulisa Moreške** / "Behind the Moreška", naglasak na ekskluzivnosti.
3. **Vlastiti brand bez riječi "iskustvo"**, npr. "Moreška Privé", "Moreška Insider".

**Moja preporuka:** Opcija 1 (zadržati "Moreška Experience" za EN, "Moreška iskustvo" za HR). Razlog: turistički kupci traže točno tu sintagmu ("experience"), Viator i GetYourGuide kategoriziraju proizvode po riječi "experience", i SEO trag se već gradi pod tim nazivom. Ako uprava želi snažniji brand, opcija 2 je dobar plan B.

---

## 2. Popusti za grupe

**Kontekst:** Trenutno postoje samo dvije fiksne cijene, €20 odrasli, €10 djeca. Hoteli, agencije, škole i grupe redovito traže popuste, a sustav to ne podržava.

**Pitanja koja treba odgovoriti:**
- Od koliko ljudi nadalje grupa dobiva popust?
- Koliki je popust (postotak ili fiksna cijena po osobi)?
- Vrijedi li popust za online kupnju, samo na ulazu, ili samo preko agencijskog kanala?
- Razlikuje li se popust za škole / udruge / komercijalne agencije?

**Moja preporuka:** Tri razine:
- **10+ osoba:** 10% popusta, dostupno i online (automatski).
- **Škole i neprofitne organizacije:** 30% popusta, samo preko obrasca / e-maila (ručna obrada).
- **Agencije i hoteli:** poseban B2B cjenik (otvoreno issue #86), nije javan.

Razlog: javni automatski popust za male grupe smanjuje "tarifni" osjećaj na kasi; veće popuste treba kontrolirati ručno da se izbjegnu zlouporabe.

---

## 3. Politika povrata novca

**Kontekst:** Trenutno nema javno objavljene politike povrata. Stripe podržava povrate, ali nigdje na webu ne piše pod kojim uvjetima ih kupci mogu očekivati. Trenutno svaki povrat odobrava admin ručno.

**Pitanja:**
- Vraćamo li novac ako kupac odustane, i do kada (npr. 24 h prije predstave)?
- Što ako se predstava preseli iz Ljetnog u Centar za kulturu zbog kiše, ima li kupac pravo na povrat ako mu nova dvorana ne odgovara?
- Što ako se predstava otkaže u potpunosti, automatski povrat ili pisani zahtjev?

**Moja preporuka:**
- **Otkaz predstave (s naše strane):** automatski puni povrat svima u roku od 7 dana, bez zahtjeva.
- **Promjena dvorane (Ljetno → Centar za kulturu zbog kiše):** kupac ima pravo na puni povrat ako zatraži u roku od 24 h nakon obavijesti.
- **Kupac odustaje:** bez povrata (osim u izuzetnim slučajevima, na diskreciju admina).

Razlog: ugostiteljski standard za takve manifestacije; jasna pravila smanjuju spor i prigovore.

---

## 4. Privatne predstave i posebni paketi

**Kontekst:** Postoji stranica `/services/private-moreska` s upitnim obrascem. Nije definirana cijena niti minimalna grupa.

**Pitanja:**
- Koja je minimalna cijena privatne predstave?
- Koliko unaprijed mora biti rezervirano?
- Što sve uključuje paket (samo izvedba, ili i transport, oprema, gostoprimstvo)?
- Postoji li gornja granica izvedbi mjesečno (kapacitet glumaca)?

**Moja preporuka:** Ostaviti na upitu (ne objavljivati cijenu javno) i internom dogovoru predefinirati raspon, npr. €1.500–€3.000 ovisno o lokaciji. Razlog: privatne grupe imaju različita očekivanja i mogu platiti više nego što bi javna cijena sugerirala.

---

## 5. Recenzije i zahvalnice nakon predstave

**Kontekst:** Issue #57 predviđa automatski bulk e-mail kupcima dan nakon predstave sa zamolbom za recenziju (Google + TripAdvisor). Issue #43 predviđa tiskane QR kartice koje se dijele na izlasku.

**Pitanja:**
- Pristajemo li slati automatski e-mail dan nakon predstave?
- Tko će fizički dijeliti QR kartice na ulazu/izlazu, door-staff ili volonter?
- Što se događa s negativnim recenzijama, tko odgovara, u kojem roku?

**Moja preporuka:** Aktivirati i e-mail i tiskane kartice (dvostruki kanal podiže odaziv). Imenovati jednu osobu (predsjednik ili tajnik) koja jednom tjedno pregledava nove recenzije i odgovara na sve, pozitivne i negativne.

---

## 6. Sadržaj bloga i autori

**Kontekst:** Tehnički je blog postavljen (#41). Plan je 1 dugi članak mjesečno (#47). Pitanje je tko ih piše.

**Pitanja:**
- Postoji li unutar HGD-a osoba koja može pisati? (povjesničar, kustos, član s afinitetom prema pisanju)
- Honoriramo li pisanje izvana?
- Tko odobrava sadržaj prije objave?

**Moja preporuka:** Naći jednog vanjskog autora (povjesničar ili kulturni novinar iz Korčule) za 6 članaka godišnje, fiksni honorar (npr. €100–€150 po članku). Predsjednik odobrava prije objave. Razlog: redovan ritam objava SEO traži tek nakon 6 mjeseci kontinuiteta, nije održivo da to radi član bez vremena.

---

## 7. Voditelj oglasnih kampanja

**Kontekst:** Plan je angažirati osobu izvan tehničkog tima koja vodi Google Ads (~€300/mj) i Meta retargeting (~€150/mj). Issue #73 je njihov onboarding.

**Pitanja:**
- Tko je ta osoba, već imenovana ili još tražimo?
- Plaća se honorarno ili je član HGD-a koji to radi besplatno?
- Tko prati uspjeh kampanja (CTR, konverzije, CAC)?

**Moja preporuka:** Angažirati profesionalca s preporukom (lokalna agencija ili freelancer s iskustvom u turizmu), na honorarnoj osnovi (€200–€300/mj uz oglasni budžet). Razlog: jeftinije od loše vođenih kampanja koje troše budžet bez rezultata. Mjesečni izvještaj predsjedniku.

---

## 8. Društvene mreže, vlasništvo i upravljanje

**Kontekst:** Issue #67, trenutno nije jasno koji su točno računi pod kontrolom HGD-a (Facebook, Instagram, TikTok, YouTube), a koji su privatni računi članova kroz koje se objavljuje. Ovo je rizik: ako član ode, gubi se i sadržaj.

**Pitanja:**
- Imamo li popis svih aktivnih računa i tko ih trenutno vodi?
- Tko je formalni vlasnik (e-mail prijave)?
- Spojiti sve na jedan zajednički HGD e-mail (npr. `social@moreska.eu`)?

**Moja preporuka:** Napraviti reviziju u roku od mjesec dana. Sve račune prebaciti pod `social@moreska.eu` (ili sličan alias) s pristupom za 2 osobe (predsjednik + voditelj društvenih mreža). Stari računi koji se ne mogu vratiti, gase se i pokreće se novi pod kontrolom HGD-a.

---

## 9. Aliasi e-mail adresa

**Kontekst:** Trenutno postoji samo `info@moreska.eu`. Issue #53 predlaže dodavanje `tickets@`, `pr@`, `bookings@`, `press@`.

**Pitanja:**
- Tko prima `bookings@` (B2B agencije i hoteli)?
- Tko `pr@` i `press@` (mediji)?
- Trebamo li i `predsjednik@` ili sl. za formalnu korespondenciju?

**Moja preporuka:** Otvoriti `tickets@` (kupci), `bookings@` (agencije), `pr@` (mediji i marketing). `tickets@` i `pr@` mogu se preusmjeriti na istu osobu u početku. `press@` ne treba, duplicira `pr@`.

---

## 10. Cjenik za sljedeću sezonu

**Kontekst:** Cijena €20/€10 je fiksna i postavljena za sezonu 2026. U kodu je radi jednostavnosti hardkodirana.

**Pitanja:**
- Mijenja li se cijena za sezonu 2027?
- Razlikuju li se cijene po dvoranama (Ljetno vs. Centar za kulturu)?
- Hoće li biti "early bird" cijena za rane bookinge?

**Moja preporuka:** Odluku donijeti najkasnije do kraja listopada 2026 (3 mjeseca prije otvaranja prodaje za novu sezonu). Razmotriti blagu korekciju za 2027 (€22 / €11), opravdano inflacijom i pozicioniranjem prema sličnim manifestacijama. Bez "early bird"-a u prvoj godini (kompleksnost prodajnih kanala).

---

## 11. Pravna pozicija prodaje preko Stripea

**Kontekst:** HGD je udruga (membership organisation). Online prodaja ulaznica za predstave je gospodarska djelatnost.

**Pitanja:**
- Imamo li u Statutu HGD-a pokrivenu gospodarsku djelatnost?
- Plaćamo li PDV, ili smo u sustavu izuzeća?
- Tko vodi knjigovodstvo i fiskalizaciju?

**Moja preporuka:** Konzultirati računovođu prije cutovera (#11). Provjeriti i Statut. Stripe može u potpunosti zatvoriti račun ako tip djelatnosti ne odgovara registriranom obliku.

---

## 12. Lokalna komunikacija s gradom i institucijama

**Kontekst:** Moreška je dio kulturne baštine Korčule. Grad Korčula, Turistička zajednica grada Korčule i Ministarstvo kulture potencijalno su partneri (a možda i sufinanciri).

**Pitanja:**
- Postoji li već formalna suradnja s TZ Korčule (npr. link na njihovom sajtu)?
- Tko je naša osoba kontakta u Gradu?
- Apliciramo li za potpore (Ministarstvo kulture, EU fondovi)?

**Moja preporuka:** Tema za posebni sastanak. Ne blokira cutover, ali bi otvorila značajne neizgrađene kanale (dolazni linkovi za SEO + sufinanciranje budžeta).
