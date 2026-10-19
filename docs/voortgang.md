# Voortgang horecaportaal

Bijgewerkt: 19 oktober 2026

## Af

- **Stap 0, herstelpunt:** de ontwerpronde staat live op `main` (ea67870). Daarna kwamen de tag `voor-horeca-portaal` en de branch `horeca-portaal`.
- **Stap 1, vastleggen:** `CLAUDE.md` is goedgekeurd door de eigenaar. Dit logboek is aangemaakt.
- **Vragen:** de eigenaar heeft de vragen over het assortiment en de voorwaarden beantwoord (zie hieronder).
- **Plan en Resend:** goedgekeurd op 19 okt.
- **Supabase-project** aangemaakt door de eigenaar; `schema.sql` is uitgevoerd met "Success" (19 okt).
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

## Open vragen

- "Maximum per klant" is nu een **maximum per bestelling** (`max_per_bestelling`). Moet het een maximum per jaar per klant worden?

## Eerstvolgende stap

De eigenaar stuurt de Project URL en de publishable key en zet de inloginstellingen (stap 4 en 5 van `docs/supabase-instellen.md`). Daarna: Resend instellen en fase 2 (de horecapagina, aanvragen en inloggen).

## Zo kun je terug

- **Site van vóór het horecaportaal:** de tag `voor-horeca-portaal`.
- **Tussenstand:** elke commit op de branch `horeca-portaal`.
- `main` (de live site) wordt pas gewijzigd na toestemming.
