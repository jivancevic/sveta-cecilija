# Brzi test cijelog sustava: kupnja, skeniranje, pregled u adminu

Cilj ovog dokumenta je da sutra možete u 15 minuta proći kroz cijeli ciklus: kupiti testnu kartu, skenirati QR kao osoblje na ulazu i vidjeti rezultat u admin sučelju. Bez stvarnog plaćanja.

**Što vam treba:**
- Računalo (za kupnju) i mobitel (za skeniranje). Može i sve s mobitela ako otvorite dva preglednika.
- Pristup admin računu (admin uloga).
- Pristup door-staff računu (`tehnika@moreska.eu` ili sl.).
- Stripe test kartica (vidi korak 2).

**Važno:** Test se izvodi na **produkcijskoj domeni** `https://moreska.eu`, ali na Stripeu se može pokrenuti u **test modu**. U test modu nema stvarnih naplata. Prije testa provjerite s Josipom da je Stripe u test modu (ili da na produkciji koristite Stripe Test Cards koje će sustav odbiti tek u live modu).

> Ako se test radi na produkciji u **live modu**, koristite svoju stvarnu karticu, kupite najjeftiniju ulaznicu (€10 dječja) i odmah nakon testa napravite refund (korak 5). To je jedini pouzdan način testa na pravom produkcijskom okruženju bez izlaganja stvarnoj naplati.

---

## Korak 1: Pripremite testnu predstavu

1. Otvorite `https://moreska.eu/admin` i prijavite se kao admin.
2. Lijevi izbornik: **Shows**, **Create New**.
3. Unesite:
   - **Date:** današnji ili sutrašnji datum (može i bilo koji u sljedećih 7 dana).
   - **Time:** `21:00` (ili neki drugi).
   - **Venue:** `ljetno-kino`.
   - **Status:** `active`.
4. **Save**.
5. Otvorite novokreiranu predstavu i kopirajte njen ID iz URL-a (npr. `/admin/collections/shows/42` → ID je `42`).

Predstava se sada vidi i na javnoj stranici `https://moreska.eu/tickets`.

---

## Korak 2: Kupite testnu ulaznicu

### Ako je sustav u Stripe TEST modu

1. Otvorite `https://moreska.eu/tickets` (najbolje u inkognito prozoru, da ne miješate admin login s kupcem).
2. Pronađite predstavu koju ste maloprije kreirali. Pritisnite **Kupi ulaznice** / **Buy tickets**.
3. Na `/checkout/[id]` odaberite **1 odrasla, 0 djece** (ukupno €20).
4. Ispunite formu kupca: ime, e-mail (koristite svoj pravi e-mail da dobijete QR), telefon ako se traži.
5. U polje kartice unesite Stripe testnu karticu:
   - **Broj kartice:** `4242 4242 4242 4242`
   - **Datum:** bilo koji u budućnosti (npr. `12 / 30`)
   - **CVC:** `123`
   - **Poštanski broj:** `20260` (ili bilo koji)
6. Pritisnite **Plati**.

### Ako je sustav u LIVE modu (oprez)

1. Isti postupak, ali kupite **1 dječju ulaznicu** (€10) sa svojom pravom karticom.
2. Nakon završetka testa **odmah napravite povrat** (korak 5).
3. Drugu Stripe test karticu **NE koristite u live modu**, bit će odbijena i može aktivirati anti-fraud zaštitu.

---

## Korak 3: Provjerite e-mail s QR-om

1. Otvorite inbox e-maila kojeg ste upisali kao kupac.
2. U roku do 1 minute trebao bi stići e-mail s naslovom "Vaše ulaznice za Morešku" (ili sl.) od `info@moreska.eu`.
3. U poruci je QR kod (slika) i link na potvrdnu stranicu.
4. **Otvorite QR sliku.** Imate dvije opcije:
   - **Opcija A:** otvorite e-mail na drugom telefonu/računalu i skenirajte QR fizički kamerom door-staff telefona.
   - **Opcija B:** desnim klikom na QR sliku → "Kopiraj sliku" ili spremite kao PNG, pa je otvorite na door-staff telefonu i upišite ručno URL koji piše ispod ("`https://moreska.eu/scan/...`").

Ako e-mail ne dolazi, provjerite spam folder. Ako i tamo nije, idite na korak 5 (admin pregled), narudžba i QR će ipak biti u bazi.

---

## Korak 4: Skenirajte kao osoblje na ulazu

### 4a. Najprije test "kupac skenira sam" (neprijavljeni)

1. Otvorite QR link u **inkognito prozoru** preglednika (ili odjavite door-staff račun ako ste prijavljeni).
2. Otvara se stranica s **pregledom ulaznice** (ime kupca, predstava, vrijeme) i upozorenjem "Ovo nije skeniranje na ulazu, ulaznicu pokažite osoblju".
3. Bitno: ulaznica **nije** označena kao skenirana. Provjerit ćete u koraku 5.

### 4b. Sad test "door-staff skenira" (prijavljeni)

1. Na door-staff telefonu (ili u drugom inkognito prozoru) otvorite `https://moreska.eu/admin` i prijavite se kao `tehnika@moreska.eu` (ili koji god je door-staff račun).
2. **Bez odjave** otvorite isti QR URL u istom prozoru.
3. Sad biste trebali vidjeti **zeleni ekran VALID** s podacima o ulaznici i imenom kupca skrivenim (ili djelomično).
4. Skrolajte malo dolje, vidite link **Undo scan** (vrijedi 2 minute).

### 4c. Test "već skenirano"

1. Ponovo otvorite isti QR URL (kao prijavljeni door-staff).
2. Trebali biste dobiti **narančasti / žuti ekran VEĆ SKENIRANO** s vremenom prvog skena.

### 4d. (Opcionalno) Test "undo"

1. Vratite se na rezultat skeniranja iz koraka 4c i pritisnite **Undo scan**.
2. Pa ponovo otvorite QR URL, opet bi trebao biti VALID.

### 4e. Test "nevažeći QR"

1. U URL skena ručno promijenite zadnji znak (npr. `.../scan/abc123x` → `.../scan/abc123y`).
2. Trebali biste dobiti **crveni ekran NEVAŽEĆE**.

---

## Korak 5: Pregled u admin sučelju

Prijavite se kao admin na `https://moreska.eu/admin`.

### 5a. Provjerite narudžbu

1. Lijevi izbornik: **Orders**.
2. Trebali biste vidjeti svoju testnu narudžbu na vrhu (sortirano po datumu).
3. Otvorite je, vidite:
   - Ime kupca, e-mail.
   - Broj ulaznica (1 adult, 0 child).
   - Ukupan iznos (€20).
   - Stripe Payment Intent ID.
   - Status povrata (`none`).
   - Povezana predstava.

### 5b. Provjerite QR token

1. Lijevi izbornik: **QR Tokens**.
2. Filtrirajte po narudžbi ili pretražite po e-mailu.
3. Trebao bi se vidjeti zapis s `scanned: true` i vremenom skeniranja iz koraka 4b.
4. Ako ste napravili Undo (korak 4d), `scanned: false`.

### 5c. Provjerite statistiku

1. Otvorite `https://moreska.eu/admin/stats`.
2. Pronađite današnju predstavu u tablici.
3. Trebali biste vidjeti:
   - **Online prodano:** 1
   - **Skenirano:** 1 (ili 0 ako ste napravili Undo)
   - **Preostalo:** 319 (Ljetno kino 320 - 1)
   - **Prihod:** €20

### 5d. Pregledajte detalj predstave

1. Kliknite na predstavu u tablici (ili idite na `/admin/stats/[showId]`).
2. Vidite drill-down s listom kupaca (vaš testni kupac u listi).
3. Admin vidi e-mail, door-staff bi vidio samo brojke (ako se prijavite kao door-staff i odete na istu stranicu).

---

## Korak 6: Povrat novca (čišćenje)

Ako ste testirali u LIVE modu sa svojom karticom:

1. Otvorite narudžbu u **Orders**.
2. Pritisnite **Refund** (u meniju s tri točkice).
3. Potvrdite.
4. Status se mijenja u `refunded`.
5. Provjerite na svojoj kartici (5-10 radnih dana).

Ako ste testirali u TEST modu, refund nije potreban, nije bilo stvarnog plaćanja.

### Brisanje testne predstave

Nakon završetka testa **NEMOJTE brisati predstavu**, ostavite je s `status: cancelled` kako bi se uklonila s javnog rasporeda. Tako narudžba ostaje u evidenciji za buduće provjere.

1. Otvorite predstavu.
2. Promijenite **Status** u `cancelled`.
3. Save.

---

## Checklist za sutrašnji test

Ispišite ili otvorite na strani:

- [ ] 1. Admin login radi
- [ ] 2. Testna predstava kreirana
- [ ] 3. Predstava se vidi na `/tickets`
- [ ] 4. Checkout otvara Stripe Payment Element
- [ ] 5. Testna kartica plaća uspješno (test mod) ili stvarna kartica (live mod)
- [ ] 6. Confirmation stranica se prikazuje s podacima narudžbe
- [ ] 7. E-mail s QR kodom stiže u inbox
- [ ] 8. QR otvoren neprijavljen → buyer view (nije skenirano)
- [ ] 9. QR otvoren kao door-staff → VALID
- [ ] 10. QR ponovo otvoren kao door-staff → VEĆ SKENIRANO
- [ ] 11. Undo scan radi
- [ ] 12. Krivi token → NEVAŽEĆE
- [ ] 13. Narudžba vidljiva u **Orders**
- [ ] 14. QR token vidljiv u **QR Tokens** s ispravnim statusom
- [ ] 15. Statistika u `/admin/stats` točna
- [ ] 16. Detalj predstave (`/admin/stats/[id]`) prikazuje kupca
- [ ] 17. Refund radi (ako je live mod) ili predstava cancelled

---

## Što ako nešto ne radi

| Problem | Što napraviti |
|---|---|
| Stripe odbija test karticu `4242...` | Vjerojatno je sustav u live modu. Koristite stvarnu karticu + refund nakon. |
| E-mail ne stiže ni za 5 min | Provjerite spam. Ako nije ni tamo, provjerite Brevo dashboard ili javite Josipu. |
| QR otvara buyer view čak i kad ste prijavljeni kao door-staff | Vjerojatno ste otvorili QR iz drugog konteksta (npr. iz Gmaila u zasebnoj aplikaciji), pa preglednik ne šalje session cookie. Kopirajte URL i otvorite ga **direktno u istom pregledniku** gdje ste prijavljeni. |
| `/admin/stats` prikazuje 0 prodano nakon kupnje | Refresh stranice. Ako je i dalje 0, webhook možda nije prošao. Provjerite Stripe dashboard, sekcija Webhooks. |
| Confirmation stranica visi / ne pronalazi narudžbu | Webhook race. Pričekajte 5 sekundi i refresh, sustav ima ugrađen retry. |
| Refund gumb nedostaje | Niste prijavljeni kao admin (door-staff ga ne vidi). |

Za sve ostalo: pozovite Josipa.
