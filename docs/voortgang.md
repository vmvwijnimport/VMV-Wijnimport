# Voortgang horecaportaal

Bijgewerkt: 19 oktober 2026

## Af

- **Stap 0, herstelpunt:** de ontwerpronde staat live op `main` (ea67870). Daarna kwamen de tag `voor-horeca-portaal` en de branch `horeca-portaal`.
- **Stap 1, vastleggen:** `CLAUDE.md` is goedgekeurd door de eigenaar. Dit logboek is aangemaakt.
- **Vragen:** de eigenaar heeft de vragen over het assortiment en de voorwaarden beantwoord (zie hieronder).

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

## Open vragen

- **Schenkwijnen:** geldt de 5% korting vanaf 24 flessen van **dezelfde** wijn? En welke wijnen zijn schenkwijnen?
- **Allocatie:** werkt het als een **aanvraag**, waarbij de klant aangeeft hoeveel hij wil en VMV het toegewezen aantal bevestigt?
- **Bezorgkosten:** worden er geen bezorgkosten berekend?
- **Hedonist voor horeca:** mogen de twee modellen gemengd worden voor de 12 glazen?
- **E-mail:** waar draait de mailbox info@vmvwijnimport.com (Google Workspace, Microsoft 365 of een hostingprovider)? Dat is nodig om inlogmails te versturen.

## Eerstvolgende stap

Goedkeuring van het plan en antwoorden op de open vragen.

## Zo kun je terug

- **Site van vóór het horecaportaal:** de tag `voor-horeca-portaal`.
- **Tussenstand:** elke commit op de branch `horeca-portaal`.
- `main` (de live site) wordt pas gewijzigd na toestemming.
