# iDEAL instellen (Mollie + Cloudflare)

De website kan zelf geen betalingen verwerken. Daarom loopt het betalen via:

- **Mollie**: de betaalpagina met iDEAL en bankoverschrijving;
- **Cloudflare Worker**: een kleine koppeling die de prijs opnieuw uitrekent en de betaling bij Mollie aanmaakt. De code staat in `betalen/worker.js`.

Je Mollie-sleutel komt alleen bij Cloudflare te staan, nooit op GitHub of de website.

---

## Stap 1: Mollie-account

1. Maak een account op **mollie.com** en vul de gegevens van VMV Wijnimport B.V. in: KvK, bankrekening, ID.
2. Ga in het dashboard naar **Instellingen → Websiteprofielen** en voeg de website toe.
3. Zet bij **Betaalmethoden** **iDEAL** en **Overboeking** aan.
4. Ga naar **Developers → API-sleutels** en kopieer de **testsleutel** (begint met `test_`).

Let op: Mollie controleert de website voordat je live mag. Daarvoor moeten de algemene voorwaarden, het herroepingsrecht, de privacyverklaring en je bedrijfsgegevens op de site staan. Die staan er. **Een bezoekadres is voor verkoop op afstand wettelijk verplicht**: zie onderaan.

## Stap 2: Cloudflare Worker

1. Maak een gratis account op **cloudflare.com**.
2. Ga naar **Workers & Pages → Create → Create Worker**. Noem hem bijvoorbeeld `vmv-betalen` en klik op **Deploy**.
3. Klik op **Edit code**. Verwijder de voorbeeldcode, plak de volledige inhoud van `betalen/worker.js` en klik op **Deploy**.
4. Ga naar **Settings → Variables and Secrets** en voeg toe:
   - `MOLLIE_API_KEY` als type **Secret**, met je testsleutel (`test_...`)
   - `SITE_URL` als type **Text**: `https://vmvwijnimport.github.io/VMV-Wijnimport` (of later `https://www.vmvwijnimport.com`)
5. Kopieer het adres van de Worker, bijvoorbeeld `https://vmv-betalen.jouwnaam.workers.dev`.

## Stap 3: De website koppelen

Zet in `_data/winkel.yml`:

```
betalen:
  actief: true
  koppeling: "https://vmv-betalen.jouwnaam.workers.dev"
```

Of stuur het adres naar Claude, dan regelt die dat.

## Stap 4: Testen

Met de testsleutel zie je bij Mollie een testpagina, waar je zelf kiest of de betaling lukt of mislukt. Er wordt dan geen echt geld overgemaakt. Controleer:

- dat je op de bedankpagina terechtkomt;
- dat de bestelling per mail binnenkomt;
- dat de betaling in het Mollie-dashboard staat (onder **Testmodus**).

## Stap 5: Live

Zodra Mollie je account heeft goedgekeurd, vervang je bij Cloudflare `MOLLIE_API_KEY` door je **livesleutel** (`live_...`). Klaar.

---

## Na elke bestelling

- In de mail en in het Mollie-dashboard staan het bestelnummer (`VMV-...`), de klantgegevens en de bestelling.
- **Maak de factuur in e-Boekhouden.** Zo blijft je nummering kloppen. De website en Mollie maken geen facturen.
- Bij een bankoverschrijving staat de betaling in Mollie op **open** tot het geld binnen is.

## Adres op de website

Voor verkoop aan consumenten op afstand moet je volgens de wet je bezoekadres vermelden. Wil je je thuisadres niet tonen, dan zijn er twee gebruikelijke oplossingen:

- een zakelijk adres of correspondentieadres (bijvoorbeeld via een kantoor of een adresservice), en dat adres ook bij de KvK laten registreren;
- een ander adres van het bedrijf, als dat er is.

Het vestigingsadres van de B.V. staat in het openbare KvK-register en is daardoor ook al te vinden via sites als companyinfo.nl. Vul het adres in bij `bedrijf:` in `_config.yml`; het verschijnt dan in de algemene voorwaarden.
