# Social Media / Marketing Manager — brief za onboarding (Andro)

> Pripremljeno za onboarding sastanak 2026-06-30. Sister doc: **`docs/marketing.md`** (kompletan plan sezone 2026) i **`docs/adr/0004-email-infrastructure.md`** (vlasništvo naloga preko `pr@moreska.eu`).

## Tko i što (scope)

- **Osoba:** Andro Tasovac — dosadašnji ad-campaign manager, sada preuzima **cijeli marketing** za sezonu 2026.
- **Mandat:** izvršavanje plana iz `docs/marketing.md` od kraja do kraja — plaćene kampanje (Google Ads + Meta), organski IG/FB sadržaj, listanja (GBP/TripAdvisor/OTA), recenzije, blog/SEO podrška.
- **Budžet:** **€500/mj svibanj–listopad 2026** (~€3.000/sezona). Kreni lean (€200/mj), skaliraj na izmjereni payback. **Vođeno ROAS-om (€1 → €3), ne fiksnim mjesečnim spendom.**
- **Granica prema developeru:** dev scope staje na firing tagova + ispravnost mjerenja. Kreativa, kampanje, sadržaj i listanja su Androva odgovornost.

## Glavni materijal koji preuzima

**`docs/marketing.md`** — to je njegov mandat (SEO, Google Ads ~€300/mj, Meta retargeting ~€150/mj, GBP, recenzije velocity, OTA, blog). Ne kreće od nule.

## Nalozi i pristupi

| Sredstvo | Stanje | Akcija |
|---|---|---|
| IG **[@hgdsvetacecilija](https://www.instagram.com/hgdsvetacecilija/)** | **ima pristup** (admin) | — |
| FB stranica (HGD Sveta Cecilija, `facebook.com/svcecilijamoreska`) | vlasništvo riješeno; **ima pristup** | osigurati **≥3 živa admina** (Josip, Andro, Velebit) da se siroče ne ponovi |
| **GA4** `G-HHTX087EH8` (umbrella tag `GT-KTB4FZPW`) | live | **TREBA DODIJELITI pristup** |
| **Google Ads** `163-693-3315` (conv. `AW-373373148`) | postoji | **TREBA DODIJELITI pristup** |
| Meta Business Manager + **Pixel** | live (#38); Pixel puca `Purchase` na confirmation | — |
| **GBP** (Google Business Profile) | na `info@moreska.eu` | dati manager pristup po potrebi |
| Recovery email za NOVE marketing naloge | **`pr@moreska.eu`** (ADR-0004), ne info@ | drži split čistim |

> **Akcija za sastanak:** dodijeliti Andru **GA4 + Google Ads** pristup (jedino što fali).

## Organski social — rupa u planu koju Andro popunjava

`marketing.md` pokriva *plaćeni* Meta, ali ne organski IG/FB sadržaj. To je glavni novi doprinos:

- **Kadenca:** prijedlog 3–4 IG + 2–3 FB tjedno; dogovoriti tko odobrava.
- **Materijal za repurpose (već postoji):**
  - hero video `public/hero-horizontal.webm`
  - **6 long-form blog postova** se piše (grana `blog/first-6-drafts`, #47) → svaki = 3–5 objava
  - fiksan raspored izvedbi 2026 (`docs/RASPORED ZA PRINT 2026.ods`)
- **CTA uvijek `moreska.eu/tickets` s UTM oznakama** → prodaja se mjeri u GA4.
- **Nikad ne linkati `/en` ili `/hr`** — te rute 404 (locale je cookie-based).

## Brend i pravila copyja

- **"Moreška by HGD Sveta Cecilija"**, slogan **"The Original Moreška, performed since 1883"**.
- Primarni jezik za doseg = **engleski** (turisti); HR sekundarno.
- U hrvatskom **moreška malim slovom** (common noun); u engleskom uvijek "Moreška".
- **Bez crtica (—)** u javnom copyju.
- Štiti 5★ pokretače u vizualima: živa borba mačevima, kostimi, noćni stari grad, autentičnost.
- Konkurent **moreska.hr** dominira "moreska" pretragama i Google Maps — vraćanje tog prostora je dio posla.

## KPI / mjerenje

Pratitelji su tašt metrika. Veži uspjeh na:
1. **Klikovi i prodaja s socijala** preko UTM-a u GA4
2. **ROAS po kampanji** (Google Ads + Meta dashboardi)
3. **Brzina recenzija** — cilj 3–5× ove sezone (#43 QR kartice na izlazu)

Mjesečni review: ukupne sesije moreska.eu, prihod po kanalu, ROAS po kampanji, nove recenzije/mj. Gasi kampanje koje ne rade nakon 90 dana.

## Otvorene stavke za dogovor na sastanku

- [ ] Dodijeliti GA4 + Google Ads pristup Andru
- [ ] Honorar + kadenca objava
- [ ] Tko odobrava sadržaj prije objave
- [ ] Potvrditi ≥3 živa admina na FB/IG
