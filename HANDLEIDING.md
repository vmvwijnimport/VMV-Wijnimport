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
