# Voortgang horecaportaal

Bijgewerkt: 19 oktober 2026

## Af

- **Stap 0, herstelpunt:** de ontwerpronde staat live op `main` (ea67870). Daarna kwamen de tag `voor-horeca-portaal` en de branch `horeca-portaal`.
- **Stap 1, vastleggen:** `CLAUDE.md` is goedgekeurd door de eigenaar. Dit logboek is aangemaakt.
- **Vragen:** de eigenaar heeft de vragen over het assortiment en de voorwaarden beantwoord (zie hieronder).
- **Plan en Resend:** goedgekeurd op 19 okt.
- **Supabase-project** `iemduldvpylppckpttja` (Frankfurt), met de URL en de publishable key in `_config.yml` onder `horeca:`. Test als bezoeker zonder inlog: alle tabellen en functies geven "permission denied" (19 okt).
- **Fase 2:** de horecapagina /horeca/ met aanvragen, inloggen, uitloggen en wachtwoord herstellen (commit f3b35f4). Testaccounts info+test-a/b/c@vmvwijnimport.com (wachtwoord TestWachtwoord-123, alleen voor testen; verwijderen vóór de livegang).
- **Test niet-goedgekeurde klant (C), 19 okt:** ziet alleen zijn eigen rij in klanten; producten, instellingen en bestellingen zijn leeg; bestellen geeft "Je account is nog niet goedgekeurd"; zelf de status wijzigen geeft "permission denied". ✔
- **Fase 3 (code):** het portaal toont na goedkeuring het assortiment per producent (assets/js/horeca-portaal.js), met jaargang, druif, formaat, allocatie- en voorraadlabels en prijzen excl. btw. Aanvulscript `supabase/002-producten-druif-jaargang.sql` (jaargang als tekst voor B20, plus druif). Het importbestand met prijzen staat in `prijslijst/horeca-import.sql` (wordt niet gecommit): 76 wijnen en 2 glazen. Doorgestreept = uitverkocht, * = allocatie. Coustheur-Bonnard en Messager-Germain zijn geïmporteerd als niet actief.
- Het databasescript: `schema.sql` is uitgevoerd met "Success" (19 okt).
- **Fase 1 (deels):** het databasescript `supabase/schema.sql` staat klaar, met tabellen, beveiliging (RLS) en de bestelfunctie die de prijs zelf berekent. De stappen voor de eigenaar staan in `docs/supabase-instellen.md`.

## Antwoorden van de eigenaar (19 okt 2026)

| Onderwerp | Antwoord |
|---|---|
| Assortiment en prijzen | uit `prijslijst/VMV Wijnimport HORECA.pdf`; de prijzen zijn **excl. btw** |
| Jaargangen | per wijn tonen; meerdere jaargangen worden aparte regels |
| Magnums en andere formaten | bestelbaar |
| Beschikbaarheid | per wijn instelbaar |
| Schaarse wijnen | maximum per klant mogelijk, en wijnen kunnen **op allocatie** |
| Fles of doos | alles is per fles te bestellen; een doos is 6 flessen, doosprijs = 6 × flesprijs |
| Schenkwijnen | 5% korting vanaf 24 flessen |
| Minimale bestelling | nog niet, maar misschien later; maak het instelbaar |
| Bezorgen | doen we zelf, in principe 1× per week. Bij kleine bestellingen ver van Amsterdam nemen we contact op. De klant kan "spoed" aangeven |
| Ophalen | niet voor horeca |
| Betalen | op factuur, **14 dagen**; de factuur maken we zelf in e-Boekhouden |
| Hedonist voor horeca | lagere glasprijs vanaf 12 glazen, anders een hogere; tonen excl. btw (bedragen alleen in de database) |
| Aanvragen | iedereen mag aanvragen, VMV keurt goed |
| Mails | naar info@vmvwijnimport.com |
| Welkomstmail na goedkeuring | automatisch, later in de huisstijl |
| Inlogs | 1 inlog per zaak |
| Tekst horecapagina | geen eigen tekst nodig; het moet vooral een portaal zijn |

## Nog te doen

1. Plan in fases laten goedkeuren.
2. Fase 1 tot en met 6 bouwen (zie het plan in het gesprek van 19 okt), met na elke fase een lokale demo, een update van dit logboek en een commit.

## Beantwoorde vervolgvragen (19 okt 2026)

- **Schenkwijn:** elke wijn krijgt 5% korting vanaf 24 flessen van **dezelfde** wijn, behalve allocatiewijnen.
- **Allocatie:** de klant vraagt een aantal aan en VMV bevestigt het toegewezen aantal. Aanvragen kan altijd; er wordt jaarlijks gealloceerd en er blijft wat over voor nieuwe klanten.
- **Bezorgkosten:** geen.
- **Hedonist voor horeca:** de modellen mogen gemengd worden voor de 12 glazen.
- **E-mail:** info@ draait waarschijnlijk op Microsoft 365 via GoDaddy. Het domein staat waarschijnlijk ook bij GoDaddy.

## ⏰ Herinnering vóór de livegang

- **Testaccounts verwijderen** (info+test-a/b/c) in Supabase → Authentication → Users.
- **Resend instellen** (`docs/resend-instellen.md`): op 19 okt overgeslagen, omdat de DNS bij GoDaddy niet bereikbaar was (verkeerd of geen account ingelogd). Zonder Resend krijgen klanten geen inlogmails (bevestigen, wachtwoord vergeten).
- Daarna in Supabase **Confirm email** weer **aan** zetten (voor het testen tijdelijk uit).

## Open vragen

- Moeten Coustheur-Bonnard en Messager-Germain zichtbaar zijn in het portaal? (Ze staan niet meer op de site, maar wel op de horecaprijslijst.)
- "Maximum per klant" is nu een **maximum per bestelling** (`max_per_bestelling`). Moet het een maximum per jaar per klant worden?

## Eerstvolgende stap

De eigenaar voert in de SQL Editor uit: (1) A en B goedkeuren, (2) `supabase/002-producten-druif-jaargang.sql`, (3) `prijslijst/horeca-import.sql`. Daarna testen als klant A en fase 4 (bestellen) bouwen.

## Zo kun je terug

- **Site van vóór het horecaportaal:** de tag `voor-horeca-portaal`.
- **Tussenstand:** elke commit op de branch `horeca-portaal`.
- `main` (de live site) wordt pas gewijzigd na toestemming.
