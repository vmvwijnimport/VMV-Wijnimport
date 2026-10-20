# Handleiding website VMV Wijnimport

Je hoeft geen code aan te passen om de website bij te werken. Alles wat je nodig hebt, doe je op github.com in je browser.

---

## Een nieuwe producent toevoegen

Elke producent is één tekstbestand in de map `_producenten`. De website maakt daar automatisch een eigen pagina van. De producent verschijnt ook vanzelf op de overzichtspagina, in het menu onder de juiste regio en in het contactformulier.

### Stap 1: zet de foto online

1. Ga op github.com naar je repository en open de map `assets/img/producenten`.
2. Klik op **Add file** en daarna op **Upload files**.
3. Sleep de foto erin en klik onderaan op **Commit changes**.

Tips voor de foto:
- Gebruik een bestandsnaam zonder spaties of hoofdletters, bijvoorbeeld `domaine-dupont.jpg`.
- Liggende foto's (breder dan hoog) werken het best, liefst minimaal 1600 pixels breed.
- Houd de foto onder de 1 MB, dan laadt de site snel. Te groot? Verklein hem gratis op squoosh.app.

### Stap 2: maak het bestand voor de producent

1. Open de map `_producenten`.
2. Klik op **Add file** en daarna op **Create new file**.
3. Geef het bestand een naam die eindigt op `.md`, zonder spaties: `domaine-dupont.md`.
   Deze naam wordt ook het webadres: `vmvwijnimport.com/producenten/domaine-dupont/`.
4. Plak dit sjabloon erin en vul het aan:

```
---
naam: Domaine Dupont
land: Frankrijk
regio: Bourgogne
plaats: Beaune
foto: /assets/img/producenten/domaine-dupont.jpg
foto_positie: center
foto_alt: Marie Dupont in haar wijngaard
samenvatting: Eén of twee zinnen over deze producent. Deze tekst komt ook in Google.
druiven: Pinot noir, chardonnay
hectare: 4
werkwijze: Biologisch, low intervention
website: https://www.domainedupont.fr
instagram: https://www.instagram.com/domainedupont
cuvees:
  - naam: Les Vieilles Vignes
    druif: Pinot Noir
    type: rood
  - naam: "Bourgogne “Clos du Bois”"
    druif: Chardonnay
    type: wit
---

Hier schrijf je het verhaal van de producent. Gewoon tekst, zo lang als je wilt.

Een lege regel begint een nieuwe alinea.

## Een tussenkop maak je met twee hekjes

**Vetgedrukt** zet je tussen twee sterretjes.
```

5. Klik op **Commit changes**. Na 1 tot 2 minuten staat de producent op de website.

### Wat betekent elk veld?

| Veld | Verplicht? | Uitleg |
|---|---|---|
| `naam` | ja | Naam van de producent of het domein |
| `land` | ja | Bijvoorbeeld `Frankrijk`, `Italië`, `Oostenrijk` |
| `regio` | ja | Hiermee groepeert de site de producenten in het menu. Schrijf een regio **altijd precies hetzelfde**: `Champagne` en `champagne` worden twee aparte regio's. |
| `foto` | ja | Het pad naar de foto uit stap 1: `/assets/img/producenten/` plus de bestandsnaam |
| `samenvatting` | aanbevolen | Korte tekst voor de lijst met producenten en voor Google |
| `plaats` | nee | Dorp of stad |
| `foto_positie` | nee | Welk deel van de foto zichtbaar blijft bij bijsnijden: `center`, `center top`, `center 30%` |
| `lijst_foto` | nee | Een andere foto voor het producentenoverzicht dan op de producentpagina zelf |
| `lijst_passend` | nee | Zet op `true` om de foto in het producentenoverzicht in zijn geheel te tonen in plaats van bijgesneden, bijvoorbeeld bij een etiket |
| `foto_alt` | nee | Korte beschrijving van de foto, voor slechtzienden en Google |
| `druiven`, `hectare`, `werkwijze` | nee | Verschijnen in het rijtje met feiten naast de tekst |
| `website`, `instagram` | nee | Volledige link, beginnend met `https://` |
| `cuvees` | nee | De lijst met wijnen van deze producent, zie hieronder |

### Cuvées toevoegen of weghalen

Elke cuvée bestaat uit drie regels: `- naam:`, `druif:` en `type:`. Let op de spaties aan het begin: twee spaties voor `- naam`, vier voor `druif` en `type`.

Het type bepaalt de kleur van het stipje voor de wijn: `rood`, `wit` (ook voor champagne) of `rose`. Laat je het weg, dan krijgt de wijn een witte stip.

```
cuvees:
  - naam: Jolie Promenade
    druif: Chardonnay
    type: wit
  - naam: Rosé de Macération
    druif: Pinot Noir
    type: rose
```

Een nieuwe cuvée zet je er gewoon onder. Wil je er een weghalen, verwijder dan beide regels. Staan er aanhalingstekens of een dubbele punt in de naam? Zet de hele naam dan tussen gewone aanhalingstekens: `- naam: "Fixin “Côte Cour”"`.

Een getal met een komma zet je tussen aanhalingstekens, anders maakt de site er een heel getal van: `hectare: "4,8"` (zonder aanhalingstekens wordt dat 48).

Een veld dat je niet gebruikt, laat je leeg of haal je weg. Het verschijnt dan niet op de site.

**Let op:** de regels tussen de twee `---` moeten precies zo blijven staan: eerst de veldnaam, dan een dubbele punt en een spatie, dan de waarde. Staat er een dubbele punt in je tekst? Zet de hele tekst dan tussen aanhalingstekens:
`samenvatting: "Wijn met karakter: puur en eerlijk"`

### Een producent aanpassen of verwijderen

- **Aanpassen:** open het bestand in `_producenten`, klik op het potloodje, wijzig en klik op **Commit changes**.
- **Verwijderen:** open het bestand, klik op de drie puntjes rechtsboven en kies **Delete file**.

---

## Foto's op de homepage vervangen

De grote foto's op de homepage staan in het bestand `_data/fotos.yml`.

1. Upload je nieuwe foto naar de map `assets/img/achtergrond`.
2. Open `_data/fotos.yml` en klik op het potloodje.
3. Vervang de bestandsnaam achter `foto:`, bijvoorbeeld:
   `foto: /assets/img/achtergrond/wijngaard-zomer.jpg`
4. Klik op **Commit changes**.

Er zijn drie plekken:
- `hero`: de grote foto bovenaan de homepage
- `verhaal`: de foto die blijft staan terwijl de tekst over ons eroverheen schuift
- `hedonist`: de achtergrond van het Hedonist-blok

Gebruik hiervoor liggende foto's van minimaal 2000 pixels breed.

---

## Pre-order Hedonist glazen

Op de Hedonist-pagina staat een winkelmandje. Klanten kiezen hoeveel glazen ze willen, zien de prijs en de verzendkosten en plaatsen een pre-order. Jullie krijgen de bestelling per mail op info@vmvwijnimport.com en de klant krijgt automatisch een bevestiging.

De klant ziet de betaalstap met iDEAL. **Zolang online betalen nog niet is ingesteld** (`betalen: actief: false`), wordt er nog niet echt betaald: jullie sturen zelf een iDEAL-betaallink (bijvoorbeeld via Tikkie). Direct online betalen vraagt een account bij een betaalprovider zoals Mollie, plus een kleine koppeling; vraag Claude om hulp als je zover bent.

De prijs voor 6 glazen geldt alleen voor 6 glazen van hetzelfde model.

Alle prijzen en regels staan in `_data/winkel.yml`:

- `prijs_glas`, `prijs_zes` en de "normaal"-prijzen (met een punt: `32.75`)
- `verzendkosten`, `gratis_verzenden_vanaf` en `gratis_amsterdam_vanaf`
- `levering`: de verwachte leveringsmaand
- `modellen`: naam, korte omschrijving en foto van elk glas
- `open: false` haalt de pre-order van de site (de rest van de pagina blijft staan)

Bezorgen in Amsterdam kan alleen bij een Amsterdamse postcode (1011 tot en met 1109); het formulier controleert dat. Klanten kunnen ook kiezen voor **ophalen bij Oocker** (Frederiksplein, Amsterdam): dat is altijd gratis en de klant hoeft dan geen adres in te vullen. De ophaallocatie staat onder `ophalen:` in `_data/winkel.yml`.

## Teksten aanpassen

| Wat | Bestand |
|---|---|
| Over ons | `over-ons.md` |
| Homepage | `index.html` (de teksten staan tussen de codes, je kunt ze voorzichtig aanpassen) |
| Hedonist | `hedonist.html` |
| Contact | `contact.html` |
| E-mailadres, WhatsApp-link, beschrijving voor Google | `_config.yml` |

---

## Het contactformulier

Berichten uit het formulier komen binnen op info@vmvwijnimport.com. Dat loopt via de gratis dienst FormSubmit.

**De eerste keer:** vul het formulier op de live website zelf een keer in. Je krijgt dan een mail van FormSubmit met een activatielink. Klik daarop. Daarna komen alle berichten gewoon binnen.

---

## De website op GitHub Pages zetten (eenmalig)

1. Ga op github.com naar je repository en klik op **Settings**.
2. Kies links **Pages**.
3. Kies bij *Source* voor **Deploy from a branch**, kies de branch `main` en de map `/ (root)`. Klik op **Save**.
4. Na een paar minuten staat de site online. Het adres zie je bovenaan dezelfde pagina.

**Eigen domein (vmvwijnimport.com):** vul het domein in bij *Custom domain* op dezelfde pagina. Zet daarna bij je domeinprovider de DNS-records die GitHub aangeeft. Vink **Enforce HTTPS** aan zodra dat kan.

**Geen eigen domein?** Dan is het adres `gebruikersnaam.github.io/VMV-Wijnimport`. Zet in `_config.yml` dan:
```
url: "https://gebruikersnaam.github.io"
baseurl: "/VMV-Wijnimport"
```

---

## Gevonden worden in Google

**Voor de lancering staat de site verborgen voor Google.** In `_config.yml` staat `zoekmachines: false`. Daardoor neemt Google de pagina's niet op in de zoekresultaten. Wie het adres kent, kan de site wel gewoon bekijken.

Mag de site officieel live? Zet dan in `_config.yml` `zoekmachines: true` en klik op **Commit changes**. Meld de site daarna aan bij Google Search Console (zie hieronder).

Elke producentpagina krijgt automatisch een titel als *"Domaine Dupont, Bourgogne (Frankrijk) | importeur in Nederland | VMV Wijnimport"*. Er komen ook gegevens bij die Google begrijpt. Zo kom je hoger in de zoekresultaten als iemand zoekt op "Domaine Dupont Nederland".

Wat helpt:
- **Schrijf een goede `samenvatting`** voor elke producent, en een eigen tekst van een paar alinea's. Unieke tekst scoort beter dan tekst van de website van de producent.
- **Meld de site aan bij Google Search Console** (search.google.com/search-console). Voeg daar je domein toe en dien de sitemap in: `https://www.vmvwijnimport.com/sitemap.xml`. Die sitemap maakt de website automatisch.
- **Vraag je producenten om naar jullie te linken**, bijvoorbeeld vanaf hun pagina met importeurs. Dat is het sterkste signaal voor Google.

---

## Het horecaportaal

Op **/horeca/** kunnen horecazaken een account aanvragen. Na jouw goedkeuring zien ze de horecaprijzen en kunnen ze bestellen op factuur.

Het dagelijkse werk doe je in de **backoffice**: **/horeca/beheer/** op de site. Log in met je eigen beheerdersaccount. Daar staan alle bestellingen en alle klanten. Wijnen, prijzen en instellingen beheer je nog in **Supabase**: ga naar supabase.com, log in en open het project **vmv-horeca**. Links zie je **Table Editor**, met daarin de tabellen.

De horecaprijzen staan **alleen** in Supabase, nooit op GitHub of in de broncode van de site. Bezoekers zonder (goedgekeurd) account zien ze nergens.

### De backoffice

Bovenaan staan twee tabbladen: **Bestellingen** en **Klanten**. Erachter zie je hoeveel nieuwe bestellingen en aanvragen er zijn. Met de knoppen eronder kies je wat je ziet, bijvoorbeeld alleen nieuwe bestellingen of alles. Klik op een regel om hem te openen.

**Een beheerder toevoegen** (bijvoorbeeld voor Tim):
1. Supabase → **Authentication → Users → Add user → Create new user**. Vul het e-mailadres en een wachtwoord in en zet **Auto Confirm User** aan.
2. **SQL Editor → New query**, met het juiste adres en de naam:
   `insert into public.beheerders (id, naam) select id, 'Tim' from auth.users where email = 'tim@voorbeeld.nl';`
   Klik op **Run**.

Gebruik voor een beheerder een ander e-mailadres dan voor een horecaklant. Een beheerder die op /horeca/ inlogt, komt vanzelf in de backoffice.

### Een aanvraag goedkeuren of afwijzen

Bij een nieuwe aanvraag krijg je een mail op info@ met de gegevens van de zaak.

1. Open de backoffice → **Klanten**. Nieuwe aanvragen staan onder **Aanvragen**.
2. Open de aanvraag en controleer de gegevens. Met de links **KvK-nummer opzoeken** en **btw-nummer controleren** zie je of de zaak bestaat. Bel bij twijfel het nummer van de zaak, niet het nummer uit de aanvraag.
3. Klik op **Goedkeuren**. De klant krijgt automatisch een welkomstmail en kan direct bestellen. Of klik op **Afwijzen** (twee keer, ter controle). De klant krijgt dan geen mail, maar ziet bij het inloggen dat de aanvraag niet is goedgekeurd.
4. Bij **Notitie** kun je iets voor jezelf opschrijven. De klant ziet dat niet.

Een goedgekeurde klant blokkeren? Open de klant en klik op **Toegang intrekken**. Hij ziet dan direct geen prijzen meer. Met **Alsnog goedkeuren** zet je het terug.

### Prijzen, voorraad en wijnen beheren

Ga naar **Table Editor → producten**. Elke regel is één wijn (of glas). Dubbelklik op een vakje om het aan te passen; het portaal laat het meteen zien.

| Kolom | Wat het doet |
|---|---|
| `prijs_ex` | prijs per fles, excl. btw (met een punt, bijvoorbeeld `12.34`) |
| `beschikbaarheid` | `op_voorraad`, `binnenkort` of `uitverkocht` (uitverkocht is zichtbaar maar niet te bestellen) |
| `allocatie` | aan: de klant vraagt een aantal aan en jullie bevestigen hoeveel er kan |
| `max_per_bestelling` | maximum aantal flessen per bestelling (leeg = geen maximum) |
| `actief` | uit: de wijn is helemaal niet zichtbaar |
| `volgorde` | de volgorde in het overzicht (lager = hoger op de pagina) |
| `jaargang`, `druif`, `formaat` | wat er bij de wijn staat, bijvoorbeeld `B22` of `Magnum 150 cl` |

**Nieuwe wijn:** klik op **Insert → Insert row** en vul minimaal `producent`, `naam` en `prijs_ex` in. Voor een wijn van een producent op de site vul je ook `producent_slug` in (de naam van het bestand in `_producenten`, bijvoorbeeld `sacy-soeur-et-frere`), zodat de link naar de producentpagina werkt.

**Nieuwe prijslijst?** Zet de nieuwe PDF in de map `prijslijst/` en vraag Claude om er een importbestand van te maken. Dat bestand komt nooit op GitHub.

### Algemene instellingen

**Table Editor → instellingen** (één regel):
- `schenk_vanaf` en `schenk_korting_pct`: schenkwijnkorting (nu 5% vanaf 24 flessen van dezelfde wijn, niet voor allocatiewijnen);
- `glas_staffel_vanaf` en `glas_staffel_prijs_ex`: lagere Hedonist-glasprijs vanaf een aantal glazen (modellen gemengd);
- `minimale_bestelling_ex`: minimale bestelling excl. btw (leeg = geen minimum);
- `betaaltermijn_dagen`: betaaltermijn van de factuur (nu 14).

### Bestellingen afhandelen

Bij een nieuwe bestelling krijg je een mail op info@ in de huisstijl, met alle regels, de klantgegevens, het afleveradres en of het **spoed** heeft. De klant krijgt een **overzicht van zijn bestelaanvraag**, met daarin duidelijk dat het nog geen bevestiging is.

Open de bestelling via een van de drie knoppen in de mail, of via de backoffice → **Bestellingen**. Ben je nog niet ingelogd, dan log je eerst in. Er gebeurt pas iets als je onderaan de pagina op de knop klikt.

- **Bevestigen:** je levert alles zoals besteld. Zet eventueel een bericht voor de klant erbij, zoals de leverdag, en klik op **Bestelling bevestigen**.
- **Bevestigen met wijziging:** vul per wijn in hoeveel je levert (`0` = niet leverbaar). Dat is ook de plek voor **allocatiewijnen**. De totalen rekenen direct mee. Klik op **Bevestigen met deze aantallen**.
- **Afkeuren:** de bestelling gaat niet door. Vul eventueel de reden in en klik op **Bestelling afkeuren**.

De klant krijgt daarna automatisch een mail: een bevestiging met de aantallen die je levert en je bericht, of een mail dat de bestelling niet doorgaat. In het portaal ziet de klant de nieuwe status. Een bestelling die al is afgehandeld, kun je niet nog een keer bevestigen of afkeuren.

Daarna:
1. **Maak de factuur in e-Boekhouden**, zoals altijd. De site maakt geen facturen, zodat je nummering klopt.
2. Is de bestelling bezorgd, open hem dan in de backoffice (onder **Bevestigd**) en klik op **Op geleverd zetten**. De klant krijgt daarvan geen mail; in zijn overzicht staat dan "geleverd".

**Leveringen plannen.** Onder **Bevestigd** staan de bestellingen die nog geleverd moeten worden, met het afleveradres, gesorteerd op postcode. In een geopende bestelling tik je op het adres om het in Google Maps te openen. Elke **zondagavond** krijg je ook een mail op info@ met alles wat nog geleverd moet worden: per zaak het adres, het telefoonnummer en wat erin zit, en onderaan een laadlijst met het totaal per wijn. Zijn er geen bestellingen, dan komt er geen mail.

De bedragen berekent de database zelf. Wat een klant in zijn browser doet, kan de prijs niet veranderen. Lever je minder, dan geldt een korting alleen nog als het geleverde aantal er recht op geeft: de schenkkorting vanaf 24 flessen van dezelfde wijn, de staffelprijs voor Hedonist vanaf 12 glazen. Op de pagina zie je dat meteen ("geen schenkkorting meer"), en de bevestiging aan de klant heeft de juiste bedragen.

**Via Supabase kan het ook nog.** Vul in **bestelregels** bij `toegewezen` het aantal in dat je levert en in **bestellingen** eventueel `bericht_klant`, en zet daarna de status op `bevestigd`, `geannuleerd` of `geleverd`. De mails gaan dan ook automatisch.

### Een klant verwijderen

Ga naar **Authentication → Users**, zoek het e-mailadres en kies **Delete user**. Heeft de klant al bestellingen, dan lukt dat niet (bestellingen moeten 7 jaar bewaard blijven). Trek dan in de backoffice zijn toegang in.

### Wachtwoord vergeten

Klanten klikken bij het inloggen op **Wachtwoord vergeten?** en krijgen een mail met een link. Dat werkt pas als de mailinstellingen (Resend) klaar zijn, zie `docs/resend-instellen.md`.

### Beveiliging controleren

Na een wijziging in de database kun je Claude vragen de beveiligingstest (`supabase/beveiligingstest.sh`) opnieuw te draaien. Die probeert als bezoeker, als niet-goedgekeurde klant en als andere klant bij gegevens te komen die niet van hen zijn, en de backoffice te gebruiken zonder beheerder te zijn. Alle pogingen moeten mislukken.

**Deel nooit** de secret key of service_role-sleutel van Supabase, het databasewachtwoord of de sleutel van Resend. Niet met Claude, niet in een mail en niet op GitHub.
