# VMV Wijnimport — projectgeheugen

Lees dit bestand en `docs/voortgang.md` aan het begin van elke sessie. Daar staat wat er al is, hoe het eruitziet en waar we gebleven zijn.

---

## 1. Over het bedrijf

**VMV Wijnimport B.V.** in Amsterdam, opgericht in november 2024 door Tim Meyer Viol en Stijn Vrolijk. Ze leerden elkaar kennen bij Oocker, het restaurant van Tim aan het Frederiksplein. VMV importeert champagne en wijn van een **nieuwe generatie wijnmakers**: veelal biologisch of biodynamisch, zonder pesticiden of herbiciden, met zo weinig mogelijk ingrijpen in de kelder. Van sommige wijnmakers is de productie klein en de vraag groot; die wijnen gaan vooral naar de Nederlandse horeca.

- **Producenten** (`_producenten/`, 16 stuks):
  - Champagne: Aurore Casanova, Champagne INSU, Champagne Petit-Collino, Domaine A. Limar, Domaine Jules Brochet, Hélène Charbaut, Julien Hénin, Maison Raday, Sacy Soeur & Frère, Théo Cecchetti, Thomas Perseval.
  - Bourgogne: Les Monts, Maison Ex Nihilo, Vins Saisons.
  - Franken: Krawalter.
  - Piëmont: Rosanna Sandri.
- **Hedonist:** VMV is officieel distributeur van Hedonist-glazen (handgeblazen, loodvrij) in Nederland. Er zijn twee modellen: HEDONIST Glas (breed) en HEDONIST Glas "White" (smaller). Op /hedonist/ staat een pre-order met winkelmandje.
- **Contact:** info@vmvwijnimport.com, WhatsApp 06 15 74 23 32 (https://wa.me/message/7A7JGLEONUS3E1). Nieuwe jaargangen worden via WhatsApp aangekondigd.
- **Bedrijfsgegevens:** KvK 99082918, btw NL868786901B01.
- **Adres:** het vestigingsadres is het **thuisadres van de eigenaar**. Het staat **alleen** in de algemene voorwaarden (wettelijk verplicht) en nergens anders op de site.
- **Ophaallocatie** voor bestellingen: restaurant Oocker, Frederiksplein 29h, Amsterdam.

## 2. Huisstijl

De officiële huisstijl staat in `huisstijl/STYLEGUIDE.md`. Die map wordt niet gecommit, dus lees hem lokaal. Alle waarden staan als tokens in `brand/tokens.css`. **Gebruik altijd de tokens, nooit losse hex-codes of maten.**

### Kleuren

| Token | Hex | Gebruik |
|---|---|---|
| `--zwart` | `#000000` | logo, koppen, primaire knop, Hedonist-pagina, footer |
| `--tekst` | `#3A3A3A` | lopende tekst |
| `--tekst-zacht` | `#6B6B6B` | bijschriften, plaats, metadata (min. 14px) |
| `--wit` | `#FFFFFF` | achtergrond |
| `--rood` | `#731515` | **enige interactiekleur**: hover, focus, secundaire knop, foutmeldingen |
| `--champagne` | `#EFEDC4` | champagnestip |
| `--champagne-logo` | `#EBE6B5` | champagnestip in het logo |
| `--champagne-licht` | `#F8F7E6` | rustige vlakken: contactblok, formulier, hover van een producentrij |
| `--champagne-rand` | `#D9D6A6` | rand om een champagnestip op wit |
| `--rose` | `#F4C4BA` | roséstip |
| `--rose-licht` | `#FBEAE6` | achtergrond van foutvelden |
| `--lijn` | `#E6E4DC` | scheidingslijnen, randen van invoervelden |

Aanvullende tokens (niet in de styleguide): `--donker-tekst #CFCFCF`, `--donker-zacht #9A9A9A`, `--donker-lijn #2A2A2A`, `--sluier rgba(0,0,0,.32)` (laag over de hero-foto) en `--wa-groen #25D366` (WhatsApp-icoon, met opacity .7).

**Regels:**
- De pagina is voor ongeveer 90% wit en zwart.
- Champagne en rosé worden **nooit** voor tekst gebruikt.
- Overal **rechte hoeken**, geen schaduwen en geen kleurverlopen. De enige ronde vormen zijn de stippen.
- Uitzondering op het kleurverloop: op de Hedonist-pagina lopen foto's met een masker zacht over in het zwart.

### Letters

- **Jost** (300, 400, 500): koppen, navigatie, knoppen, labels en formulieren.
- **Newsreader** (400 en 400 cursief): intro-alinea's (`.pagina__intro`, `.producent__samenvatting`) en verhalen (`.verhaal`).
- Alleen op /hedonist/ wordt ook Newsreader 200 geladen, voor het woordmerk HEDONIST.
- **Schaal** (tokens): `--fs-display` (hero), `--fs-h1`, `--fs-h2`, `--fs-h3`, `--fs-ui` (17px), `--fs-knop` (15px), `--fs-klein` (14px), `--fs-intro` en `--fs-verhaal`.
- Koppen in Jost 300, zwart. Alles in zinsopmaak, geen hoofdletterlabels, niets centreren behalve het logo en de Hedonist-hero.

### Ruimte en raster

- Raster van 8px: `--s-1` 8, `--s-2` 16, `--s-3` 24, `--s-4` 32, `--s-6` 48, `--s-8` 64, `--s-12` 96, `--s-16` 128.
- Container 1200px (`--container`), tekstkolom 680px (`--kolom`).
- Zijmarge `--rand` (24 tot 48px). Tussen secties `--sectie`: 96px op desktop, 64px op mobiel.
- Breekpunten: 56rem (menu wordt mobiel, kolommen stapelen), 48rem en 36rem.

### Logo (`brand/logo/`)

- `svg/vmv-logo-horizontaal.svg`: in de header, 84px hoog (mobiel 60px).
- `svg/vmv-logo-wit.svg`: in de footer, 140px breed.
- `svg/vmv-logo.svg`: in de leeftijdscheck, gecentreerd, 104px.
- `svg/vmv-stippen.svg`: favicon, met `png/favicon-32.png` en `png/apple-touch-icon-180.png` als terugvaloptie.
- `png/vmv-logo-1024.png`: afbeelding bij het delen van een link (og:image).
- Het logo nooit vervormen of opnieuw inkleuren.

### Knoppen (`.knop` + variant)

Basis: Jost 500, 15px, padding 14px × 28px, rechte hoeken, focus `outline 2px var(--rood)` met 3px offset.

| Class | Gebruik | Uiterlijk |
|---|---|---|
| `.knop--primair` | hoofdactie, max. één per scherm | zwart vlak, witte tekst; hover rood |
| `.knop--secundair` | alle secundaire knoppen op licht | transparant, rand en tekst rood; hover rood vlak, witte tekst |
| `.knop--op-foto` | op een foto (hero) | rand en tekst wit; hover wit vlak, zwarte tekst |
| `.knop--licht` / `--licht-lijn` | op zwart (Hedonist) | wit vlak / witte rand; hover rood |

Tekstlinks hebben de kleur van de tekst eromheen en een onderstreping van 1px met 3px offset; bij hover worden ze rood. Er komt **nooit een pijltje** achter knop- of linkteksten.

### Formulieren

- Velden: 48px hoog, padding 0 14px, rand 1px `--lijn`, witte achtergrond. Keuzelijsten met een eigen pijltje.
- Focus: rand en outline in `--rood`.
- Fout: rand `--rood`, achtergrond `--rose-licht` en een melding eronder (`.veld__fout`, 14px rood).
- Gebruik `novalidate` met eigen Nederlandse validatie (zie het contactformulier in `assets/js/site.js`). `aria-invalid` en `aria-describedby` op foute velden.
- Een formulier staat op een vlak in `--champagne-licht` met 48px padding.

### Foto's

Groot en zonder kader. Producentfoto's staan in `assets/img/producenten/`, sfeerfoto's in `assets/img/achtergrond/` (gekozen in `_data/fotos.yml`). Originelen staan in `foto-originelen/` (niet gecommit). Verklein eerst naar maximaal 2400px, en verplaats daarna pas het origineel: macOS ziet `Foto.JPG` en `foto.jpg` als hetzelfde bestand.

### Opbouw van de pagina

- **Header** (`_includes/header.html`): sticky, wit, met een lijn eronder. Links het logo, rechts het menu: Over ons · Producenten (megamenu) · Hedonist glas · Contact.
  - Het megamenu loopt over de volle breedte en heeft 4 kolommen: de grootste regio over kolom 1 en 2, de volgende in kolom 3 en de rest onder elkaar in kolom 4. Onderaan staat de knop "Alle producenten bekijken".
  - Op mobiel opent "Menu" een lijst over het hele scherm.
- **Footer** (`_includes/footer.html`): zwart. Bovenin het witte logo, de kolommen Contact en Website, en onderaan NIX18, © VMV Wijnimport B.V., KvK, btw en links naar de algemene voorwaarden, het herroepingsrecht en de privacyverklaring.
- **Leeftijdscheck** (`_includes/leeftijdscheck.html`): wit kader over de wazige site. "Ja" wordt 30 dagen onthouden in de cookie `vmv18`.
- **Contactblok onderaan** (`_includes/contact-blok.html`): champagne-licht, met de knoppen WhatsApp (primair) en Mail ons (secundair).

## 3. Schrijfstijl

Nederlands, informeel ("je", "we"), kort, nuchter en persoonlijk. Geen superlatieven en geen losse zinnetjes voor effect. Teksten van wijnmakers schrijft de eigenaar zelf; pas die niet zonder overleg aan.

Voorbeeldzinnen van de site:
- "Wijn die in de wijngaard begint."
- "We importeren champagne en wijn van een nieuwe generatie wijnmakers. Ze werken zonder pesticiden of herbiciden en voegen in de kelder zo weinig mogelijk toe."
- "In de kelder doen onze wijnmakers zo min mogelijk. Zo kan de wijngaard zelf spreken."
- "We kopen alleen wijnen die we zelf ook graag drinken."
- Foutmelding: "Vul je e-mailadres in". Bevestiging: "Bedankt, we nemen snel contact met je op."

## 4. Technische opzet

- **Jekyll** op **GitHub Pages**: repo `vmvwijnimport/VMV-Wijnimport`, de live site draait vanaf `main`, op https://vmvwijnimport.com (bestand `CNAME`; het oude adres vmvwijnimport.github.io/VMV-Wijnimport stuurt door). De `baseurl` is leeg, maar gebruik altijd `| relative_url`. Tot de lancering in november toont de homepage een wachtpagina (`wachtpagina: true` in `_config.yml`).
- **Mappen:**
  - `_layouts/`: `default`, `pagina` (tekstpagina) en `producent`.
  - `_includes/`: header, footer, head (SEO, JSON-LD), contactblok, contactregel, producentregel, euro, leeftijdscheck en hedonist-winkel.
  - `_data/`: `fotos.yml` (homepagefoto's) en `winkel.yml` (Hedonist-prijzen en -regels).
  - `_producenten/*.md`: front matter met naam, land, regio, plaats, foto, samenvatting, werkwijze en cuvées (naam, druif, type), plus het verhaal.
  - `assets/css/stijl.css` (de enige stylesheet), `assets/js/site.js` (menu, uitklappen, leeftijdscheck, contactformulier) en `assets/js/winkel.js` (Hedonist-mandje).
  - `brand/`: tokens en logo's.
  - `betalen/`: Cloudflare Worker voor Mollie, plus instructies. Wordt niet gepubliceerd.
- **Pagina's** gebruiken `layout: pagina` (kop, intro, tekstkolom) of `default` met eigen secties.
- **Hedonist-winkelmandje:** de prijzen komen uit `_data/winkel.yml`, gepubliceerd als `/winkel.json`. Het mandje wordt opgeslagen in `localStorage`.
  - Afrekenen gaat via een Cloudflare Worker die de prijs zelf opnieuw berekent en een Mollie-betaling (iDEAL of overschrijving) aanmaakt. Die staat nog **uit** (`betalen.actief: false`); zolang dat zo is, komt de bestelling per mail binnen.
  - Formulieren versturen via FormSubmit (AJAX) naar info@.
- **Zoekmachines:** `zoekmachines: false` in `_config.yml` zet `noindex` op alle pagina's tot de lancering.
- **CSS en JS** worden ingeladen met `?v={{ site.time }}` tegen een verouderde cache.
- **Lokaal bouwen:** Ruby 2.6 kan geen volledige Jekyll installeren. Daarom installeren we Jekyll 3.10 met `--ignore-dependencies` in `$TMPDIR/gems` en draaien we een klein bouwscript. De voorbeeldserver draait op poort 4000 (buiten de sandbox). Zie ook het geheugen van Claude.
- **Niet gecommit:** `prijslijst/`, `huisstijl/` en `foto-originelen/`.

## 5. Doel: besloten horecaportaal

Horecaklanten vragen een inlog aan; de eigenaar keurt die handmatig goed. Alleen goedgekeurde klanten zien de horecaprijzen en kunnen wijn bestellen.

- **Aanvragen** op de pagina "Horeca", met de velden bedrijfsnaam, contactpersoon, e-mail, telefoon, KvK, btw, afleveradres en type zaak (restaurant, bar, wijnbar, slijterij, overig). Daarna staat de aanvraag op **in afwachting**: de klant krijgt een bevestiging en info@ een mail.
- **Goedkeuren** en bestellingen afhandelen gaan via de backoffice op /horeca/beheer/ (inloggen als beheerder, tabel `beheerders`, script `supabase/008-backoffice.sql`). Wijnen, prijzen en instellingen staan nog in het Supabase-dashboard.
- **Besloten deel:**
  - wijnen met horecaprijzen (excl. btw), per producent;
  - aantallen per fles of per doos;
  - een bestelmandje en bestellen op factuur (geen iDEAL);
  - een mail naar info@ en een bevestiging naar de klant;
  - eerdere bestellingen bekijken en uitloggen.
- **Bezoekers zonder inlog** zien **nergens** horecaprijzen: niet op de pagina, niet in de broncode, niet in de repo.
- **Techniek:**
  - Supabase in de EU-regio (Frankfurt) voor inloggen en de database. De site blijft op GitHub Pages.
  - De prijzen staan alleen in de database, beschermd met Row Level Security.
  - Alleen de anon-sleutel mag in de site; de service-role-sleutel nooit.
  - `noindex` op alle horecapagina's.
  - De beveiliging aantoonbaar testen: als bezoeker, als niet-goedgekeurde klant, en als klant A die de gegevens van klant B probeert op te vragen.
  - De privacyverklaring bijwerken.

## 6. Vaste regels

1. **Werk op de branch `horeca-portaal`.** Merge **nooit** naar `main` zonder uitdrukkelijke toestemming van de eigenaar. De live site draait vanaf `main`.
2. Het herstelpunt is de tag `voor-horeca-portaal`.
3. **Nooit geheimen in de repo**, zoals de service-role-sleutel, de Mollie-sleutel of wachtwoorden. Lokale geheimen gaan in bestanden die in `.gitignore` staan.
4. **Nooit horecaprijzen of -bedragen in de repository**: niet in code, documentatie, commitberichten of testverslagen. Ze staan alleen in Supabase en in `prijslijst/` (genegeerd door Git). Schrijf in verslagen "klopt" in plaats van het bedrag. Controleer vóór elke commit met een zoekopdracht op bedragen uit `prijslijst/horeca-import.sql`.
5. **Volg de huisstijl strikt:** tokens, bestaande classes, layouts en includes. Geen nieuwe frameworks of buildstappen.
6. Kleine commits per afgerond onderdeel, met een Nederlands commitbericht, en werk `docs/voortgang.md` bij.
7. Maak geen aannames over prijzen of voorwaarden; vraag het de eigenaar.
8. Laat het resultaat na elke fase lokaal zien (http://localhost:4000), met screenshots op 1440px en 390px.
9. Het thuisadres staat alleen in de algemene voorwaarden.
10. Communiceer in eenvoudig Nederlands; de eigenaar is geen programmeur.

## 7. Genomen beslissingen

| Datum | Beslissing | Reden |
|---|---|---|
| okt 2026 | Jekyll op GitHub Pages, geen eigen server | eenvoudig en gratis; de eigenaar kan teksten zelf aanpassen |
| okt 2026 | Huisstijl volgens STYLEGUIDE.md, met tokens in `brand/tokens.css` | één bron voor alle kleuren en maten |
| okt 2026 | Hedonist-pagina met grote achtergrondfoto's die zacht overlopen in het zwart | de eigenaar vond de gewone opzet met losse blokken niet mooi |
| okt 2026 | Hedonist-pre-order: €185 per 6 van hetzelfde model (niet mixen); verzending €12,50, gratis vanaf 12; Amsterdam gratis vanaf 6; ophalen bij Oocker gratis | keuze van de eigenaar |
| okt 2026 | Betalen voor Hedonist via Mollie en een Cloudflare Worker, met de prijs op de server berekend | iDEAL en overschrijving, zonder geheimen op de site |
| okt 2026 | Facturen worden gemaakt in e-Boekhouden, niet op de site | de nummering in de boekhouding moet kloppen |
| okt 2026 | Pre-order is een gewone bestelling; consumenten hebben wettelijk herroepingsrecht vanaf de bestelling | wettelijk verplicht |
| okt 2026 | `noindex` tot de lancering (`zoekmachines: false`) | de site is nog niet officieel live |
| okt 2026 | Horecaportaal met Supabase (EU) en Row Level Security, op de branch `horeca-portaal` | opdracht van de eigenaar |
| 19 okt 2026 | Horeca: assortiment uit de HORECA-prijslijst (excl. btw), alles per fles, doos = 6 × flesprijs, schenkwijnen 5% korting vanaf 24 flessen, factuur 14 dagen, eigen bezorging 1× per week, spoed aan te geven, niet ophalen, 1 inlog per zaak, mails naar info@ | antwoorden van de eigenaar, zie `docs/voortgang.md` |
| 19 okt 2026 | Schenkwijnkorting 5% vanaf 24 flessen van dezelfde wijn, niet voor allocatiewijnen; allocatie = aanvraag die VMV bevestigt; geen bezorgkosten; Hedonist-modellen mogen gemengd worden | vervolgantwoorden van de eigenaar |
| 19 okt 2026 | Horecabestellingen zijn pas definitief na bevestiging door VMV (status ontvangen → bevestigd in het dashboard); voorbehoud zichtbaar in het mandje, de bevestiging, de mail en de geschiedenis | wens van de eigenaar: bij te weinig voorraad moet VMV kunnen bijsturen |
| 19 okt 2026 | Horecabedragen ook niet in documentatie of commits; geschiedenis van de branch opgeschoond | ze stonden per ongeluk in CLAUDE.md, voortgang.md en schema.sql |
| 19 okt 2026 | Coustheur-Bonnard en Messager-Germain staan in de database maar zijn verborgen (actief = false) | ze staan niet meer op de site |
| 19 okt 2026 | Prijslijst-import: doorgestreept = uitverkocht, * = allocatie; jaargang als tekst (B20 = base 2020) | de opzet van de HORECA-prijslijst |
| 20 okt 2026 | Op allocatie alleen: Domaine Jules Brochet, Champagne Petit-Collino, Hélène Charbaut (behalve La Charbauterie) en Thomas Perseval (behalve Art'Terre); script `supabase/004-allocatie.sql` | keuze van de eigenaar; vervangt de sterretjes uit de prijslijst |
| 20 okt 2026 | Bestellingen afhandelen via knoppen in de mail aan VMV (Bevestigen, Bevestigen met wijziging, Afkeuren) op /horeca/beheer/; de klant krijgt automatisch een mail. Levert VMV minder, dan vervalt de korting als het aantal er geen recht meer op geeft (schenkkorting < 24 flessen, staffel < 12 glazen) | wens van de eigenaar; Supabase was te omslachtig |
| 20 okt 2026 | Backoffice op /horeca/beheer/ met inlog voor beheerders: alle bestellingen (bevestigen, met wijziging, afkeuren, geleverd) en klanten (goedkeuren, afwijzen, toegang intrekken, notitie). De mailknoppen openen de backoffice; de links zonder inlog (met sleutel) zijn vervallen. Welkomstmail bij goedkeuring | wens van de eigenaar; Supabase was te omslachtig |
| 19 okt 2026 | Hedonist voor horeca: een lagere glasprijs vanaf 12 glazen (modellen gemengd), daaronder een hogere; tonen excl. btw. De bedragen staan alleen in de database | keuze van de eigenaar |
| 23 okt 2026 | Maximum per wijn blijft per bestelling (niet per klant per jaar); overstap naar vmvwijnimport.com later, na het bijwerken van de foto's | keuze van de eigenaar; elke bestelling wordt toch goedgekeurd |
| 23 okt 2026 | Eigen domein vmvwijnimport.com; tot de lancering in november alleen een wachtpagina op de homepage (geen links, geen leeftijdscheck). Horeca, Hedonist en de backoffice blijven bereikbaar via hun eigen adres | keuze van de eigenaar |
