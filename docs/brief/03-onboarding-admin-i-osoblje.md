# Onboarding: kako koristiti admin sustav

Ovaj dokument je namijenjen članovima HGD-a koji će voditi prodaju i osoblju na ulazu predstava. Pretpostavlja se da nemate prethodnog iskustva sa sličnim sustavima. Prolazimo kroz svaki korak.

Dokument je podijeljen u dva dijela:

1. **Za administratora** (predsjednik, tajnik, blagajnik), upravljanje predstavama, narudžbama i povratima novca.
2. **Za osoblje na ulazu (door-staff)**, provjera ulaznica na dan predstave.

---

# DIO 1: Administrator

## 1.1 Prva prijava

1. Otvorite preglednik (Chrome, Safari, Firefox) na bilo kojem računalu ili mobitelu.
2. U adresnu traku upišite: `https://moreska.eu/admin`
3. Otvara se prijava. Unesite e-mail i lozinku koju ste dobili od razvojnog tima.
4. Pritisnite "Login".

Ako lozinku zaboravite, javite se administratoru sustava (Josip), ne pokušavajte resetirati sami.

**Važno:** Ne dijelite lozinku s drugima. Svaki admin ima svoj račun. Ako vam treba dodatni admin, otvorite mu novi račun (vidi 1.7).

## 1.2 Glavni izbornik

Nakon prijave vidite glavni dashboard. Lijevo je izbornik, gdje su sve kolekcije podataka:

- **Shows** (Predstave)
- **Orders** (Narudžbe)
- **QR Tokens** (QR ulaznice)
- **Contact Submissions** (Poruke s kontakt obrasca)
- **Users** (Korisnici sustava)

Gore desno je link "Stats" za statistiku prodaje. To je najvažniji ekran za svakodnevno praćenje.

## 1.3 Predstave (Shows)

### Kreiranje pojedinačne predstave

1. U lijevom izborniku kliknite "Shows".
2. Gore desno pritisnite "Create New".
3. Ispunite polja:
   - **Date**: datum predstave (kalendar).
   - **Time**: vrijeme u formatu HH:MM (npr. `21:00`).
   - **Venue**: dvorana, birate između "Ljetno kino" i "Zimsko kino" (Centar za kulturu).
   - **Status**: ostavite "active". Mijenjajte u "cancelled" samo kad otkazujete predstavu.
4. Pritisnite "Save".

Predstava se odmah pojavljuje na javnoj stranici `/tickets` i kupci je mogu kupiti.

### Kreiranje više predstava odjednom (bulk)

Ako trebate unijeti cijeli ljetni raspored (npr. svaki ponedjeljak u 21:00 od 1. lipnja do 30. rujna):

1. Otvorite "Shows".
2. Pritisnite "Bulk create" (gore desno).
3. Odaberite raspon datuma, dan u tjednu, vrijeme i dvoranu.
4. Sustav će pokazati listu predstava prije nego ih kreira. Provjerite, pa pritisnite "Confirm".

**Pravilo:** Bulk kreiranje koristite samo za standardni raspored. Posebne datume (turneje, dodatne predstave) unesite pojedinačno.

### Otkazivanje predstave

1. Otvorite predstavu klikom na nju.
2. Promijenite "Status" iz "active" u "cancelled".
3. Spremite.

**Što se događa nakon otkazivanja:**
- Predstava se odmah uklanja s javnog rasporeda.
- Kupci koji su već kupili ulaznice **NE dobivaju automatski povrat novca**. To morate ručno pokrenuti (vidi 1.4).
- Ako je predstava otkazana zbog vremena (kiša), prebacuje se u zimsku dvoranu kao nova predstava, a ovo otkazivanje zadržava postojeće prodaje.

**Pravilo:** Otkazivanje uvijek mora pratiti komunikacija s kupcima (e-mail). U trenutku pisanja ovog dokumenta, bulk e-mail kupcima nije gotov; do tada šaljite e-mail ručno preko Brevo-a ili osobnog inboxa.

### Unos broja prodanih ulaznica na ulazu (in-person sales)

Kupci koji plate gotovinom ili karticom na samom ulazu ne idu kroz online sustav. Da bi statistika kapaciteta bila točna, unosite ih ručno:

1. Otvorite predstavu.
2. Pronađite polje "In Person Sold".
3. Upišite broj prodanih ulaznica na ulazu.
4. Spremite.

**Važno pravilo:** Broj se **DODAJE** automatski, ne zamjenjuje. Ako ste u 20:30 unijeli 15 prodanih, a do 21:00 prodali još 5, **NE upisujte 20**, već unesite **5** u za to predviđeno polje. Sustav će automatski zbrojiti.

(Ako vam ovo zvuči zbunjujuće, pitajte razvojni tim prije prve uporabe.)

## 1.4 Narudžbe (Orders) i povrati novca

### Pregled svih narudžbi

1. U lijevom izborniku kliknite "Orders".
2. Vidite listu svih narudžbi: ime kupca, e-mail, broj ulaznica, ukupan iznos, predstava.
3. Možete filtrirati po predstavi pomoću filtera gore.

### Pojedinačni povrat novca

1. Otvorite narudžbu kupca.
2. Pronađite gumb "Refund" (u meniju s tri točkice ili gore desno, ovisno o verziji).
3. Potvrdite.

**Što se događa:**
- Stripe izvršava povrat odmah; novac kupcu sjeda na karticu unutar 5 do 10 radnih dana.
- Status narudžbe se mijenja u "refunded".
- QR ulaznice te narudžbe automatski postaju nevažeće (na ulazu će prikazati "NEVAŽEĆE").

**Stroga pravila:**
- Povrat se **NE MOŽE** poništiti. Provjerite dva puta prije potvrde.
- **Ne smijete** refundirati narudžbu kupca koji se nije javio i nije znate li je odustao. Politika povrata (još neusvojena, vidi `02-pitanja-za-upravu.md`) trenutno je: povrat samo ako mi otkažemo predstavu, ili u izvanrednim slučajevima.
- Svaki povrat zabilježite u privatnu evidenciju (datum, kupac, razlog). Mjesečno ih usporedite s izvještajem iz Stripea.

### Što ako kupac traži povrat preko e-maila

1. Provjerite je li narudžba ispravna (ime, e-mail, predstava).
2. Provjerite politiku povrata (kad bude usvojena).
3. Odgovorite kupcu prije pokretanja povrata.
4. Tek nakon pristanka uprave (ili u nedvosmislenim slučajevima) pokrenite povrat.

## 1.5 Statistika (`/admin/stats`)

Ovo je vaš dnevni alat za praćenje prodaje.

1. Otvorite `https://moreska.eu/admin/stats`.
2. Gore vidite agregat sezone: ukupno prodanih ulaznica, ukupno skeniranih, prihod, podjelu po dvoranama.
3. Ispod je tablica predstava: nadolazeće, današnja, i zadnjih 7 dana.

Klikom na neku predstavu otvara se njena detaljna statistika: koliko je prodano online, koliko na ulazu, koliko je skenirano, lista kupaca.

**Tko šta vidi:**
- Vi (admin) vidite SVE, uključujući imena i e-mailove kupaca.
- Door-staff (osoblje na ulazu) vidi **samo brojke**, bez osobnih podataka.

## 1.6 Poruke s kontakt obrasca

Sve poruke s `/contact` obrasca i upita s `/services/...` stranica završavaju u "Contact Submissions".

1. Otvorite kolekciju.
2. Pročitajte poruku.
3. Odgovorite kupcu putem vašeg e-maila (`info@moreska.eu`).

Sustav **NE šalje automatski odgovor** trenutno. Sve mora pratiti čovjek.

## 1.7 Otvaranje novog korisnika (Users)

Samo administrator može otvoriti nove račune.

1. Otvorite "Users".
2. "Create New".
3. Unesite ime, e-mail, lozinku.
4. Odaberite ulogu:
   - **admin**: puni pristup, vidi kupce, može refundirati.
   - **door-staff**: ograničen pristup, vidi samo predstave i statistiku, koristi se za osoblje na ulazu.
5. Spremite.
6. Javite osobi e-mail i lozinku (preko sigurnog kanala, ne SMS-om).

**Pravila:**
- Osoblje na ulazu **uvijek** dobiva ulogu `door-staff`, nikad `admin`.
- Ne otvarajte zajedničke admin račune. Svaki admin ima svoj.
- Kad netko prestane raditi za HGD, **odmah** obrišite ili deaktivirajte njegov račun.

## 1.8 Što NE smijete raditi

- **Nikad** ne mijenjajte cijene u admin sučelju (€20/€10 je hardkodirano u kodu; promjena cijena ide kroz razvojni tim).
- **Nikad** ne brišite predstavu s prodanim ulaznicama. Otkažite je umjesto toga.
- **Nikad** ne mijenjajte podatke u tablicama QR Tokens ručno. To je interna evidencija.
- **Nikad** ne dijelite vlastiti pristup s drugima.
- **Nikad** ne otvarajte admin panel na javnim računalima ili nezaštićenoj WiFi mreži.

## 1.9 U slučaju problema

- Greška u sustavu: kontaktirajte razvojni tim (Josip).
- Kupac se žali na nepostojeću narudžbu: provjerite Stripe panel (`dashboard.stripe.com`) prema iznosu i datumu.
- Skidanje sustava ili poruka "500": ne otvarajte iste stranice ponovno u petlji, javite razvojnom timu.

---

# DIO 2: Osoblje na ulazu (door-staff)

Vaš zadatak je provjera ulaznica kad gosti dolaze na predstavu. Sustav je jednostavan: skenirate QR kod s telefona kupca, sustav vam kaže je li ulaznica važeća.

## 2.1 Prva prijava

1. Na vašem telefonu (Android ili iPhone) otvorite preglednik (Chrome ili Safari).
2. Upišite: `https://moreska.eu/admin`
3. Prijavite se s računom koji vam je dao administrator (zajednički račun za sve osoblje na ulazu).

**Važno:** Login ostaje spremljen na telefonu. Ne morate se prijavljivati prije svake predstave.

## 2.2 Skeniranje ulaznice

Kupac vam pokazuje QR kod na svom telefonu (iz e-maila koji je dobio nakon kupnje).

1. Otvorite aplikaciju za skeniranje QR kodova na telefonu (kamera kod novijih telefona to radi automatski).
2. Usmjerite kameru na QR kod. Telefon prepoznaje QR i pita vas želite li otvoriti link.
3. Pritisnite "Otvori".
4. Otvara se stranica s rezultatom.

**Moguća tri rezultata:**

### VALID (zelena oznaka)
Ulaznica je ispravna. Propustite gosta. Sustav je automatski označio ulaznicu kao skeniranu.

### VEĆ SKENIRANO (žuta / narančasta oznaka)
Ova ulaznica je već iskorištena (najčešće: kupac je u grupi i isti QR je već skenirao netko drugi, ili gost je prošao i pokušava ponovno ući).

**Što napraviti:**
- Pitajte gosta ima li još ulaznica u istom e-mailu (svaki kupac dobiva jedan QR po ulaznici, dakle 3 odrasle ulaznice = 3 različita QR koda).
- Ako tvrdi da nije ulazio, provjerite koliko je ljudi u njegovoj grupi i koliko je QR-ova već skenirano.
- **Ako ste pogriješno skenirali ulaznicu** (npr. dvaput ste prijeđali preko istog QR-a): unutar 2 minute imate link "Undo scan" na samoj stranici. Pritisnite ga, ulaznica se vraća u status VALID.

### NEVAŽEĆE (crvena oznaka)
QR kod ne pripada nijednoj ulaznici, ili je narudžba refundirana.

**Što napraviti:**
- Pitajte gosta otkud mu QR (možda stari e-mail, krivi QR, ili pokušaj prijevare).
- Ne propuštajte gosta. Pozovite glavnog administratora (predsjednika ili tajnika) da provjeri narudžbu u sustavu.

## 2.3 Ako kupac nema telefon ili nema QR

Kupci mogu kupiti ulaznicu i na samom ulazu (gotovinom ili karticom). Ti gosti nemaju QR. Za njih:

1. Naplatite ulaznicu po standardnoj cijeni (€20 odrasli / €10 djeca).
2. Propustite ih.
3. Nakon predstave (ili kasnije iste večeri) administrator unosi broj prodanih ulaznica u sustav (vidi 1.3).

**Vi (door-staff) ne unosite prodaju u sustav.** Samo brojite (jednostavna lista na papiru: "20:30, 3 odrasle, 1 dijete") i predate administratoru.

## 2.4 Statistika tijekom predstave

Možete provjeriti koliko je ljudi do sad ušlo:

1. Otvorite `https://moreska.eu/admin/stats` na telefonu.
2. Pronađite današnju predstavu.
3. Pritisnite je, vidite koliko je prodano i koliko skenirano.

**Vi vidite samo brojke.** Ne vidite imena ni e-mailove kupaca. To je namjerno radi zaštite privatnosti.

## 2.5 Stroga pravila za door-staff

- **Nikad** ne propuštajte gosta čija ulaznica prikazuje "NEVAŽEĆE", bez obzira što tvrdi. Pozovite administratora.
- **Nikad** ne pritišćite "Undo scan" osim ako ste sigurni da ste pogriješno skenirali. Svaki "Undo" se bilježi.
- **Nikad** ne dijelite zajednički door-staff login s ljudima koji nisu osoblje HGD-a.
- **Nikad** ne otvarajte admin panel pred gostima. Telefonom upravljate vi, gost pokazuje QR.
- **Ako sustav ne radi** (nema interneta, stranica ne otvara): propuštajte goste prema printanom popisu koji ćete dobiti unaprijed, a nakon predstave sve QR-ove označite ručno administratoru.

## 2.6 Tipični problemi i rješenja

| Problem | Rješenje |
|---|---|
| QR ne skenira (loš ekran kupca) | Zatražite od kupca da poveća svjetlinu telefona ili da vam pošalje e-mail koji ćemo otvoriti s našeg telefona. |
| Nema interneta na lokaciji | Koristite mobilni podatkovni promet (svoj telefon kao hotspot). Ako ni to ne ide, prebacite se na ručnu provjeru. |
| Kupac kaže "platio sam, nemam e-mail" | Pitajte ime i provjerite u svom telefonu na `/admin/stats/[predstava]`, ali samo brojke. Konkretnu narudžbu zna naći samo administrator. Pozovite ga. |
| QR je skeniran prije početka predstave (dolazak prerano) | To je u redu, sustav ne brani rano skeniranje. Skenirana ulaznica vrijedi do kraja predstave. |
| Gost ima QR ali se ne pokazuje stranica | Provjerite jeste li spojeni na internet. Probajte upisati URL ručno (`moreska.eu/scan/...`). |

---

# Dodatak: Kome se obratiti

| Situacija | Tko |
|---|---|
| Tehnička greška, sustav ne radi | Razvojni tim (Josip) |
| Pitanje vezano za politiku povrata | Predsjednik HGD-a |
| Otkazivanje predstave | Tajnik / predsjednik |
| Naplata ili Stripe pitanja | Blagajnik |
| Sumnja u zlouporabu / nevažeći QR | Administrator na licu mjesta (predsjednik / tajnik) |

Lozinke nikad ne traže preko WhatsAppa ili SMS-a. Ako vas netko zove i traži lozinku, **nije iz HGD-a**.
