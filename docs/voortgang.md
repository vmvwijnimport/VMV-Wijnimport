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
- **Fase 3 getest (19 okt):** de eigenaar heeft A en B goedgekeurd en 002 en de import uitgevoerd. Klant A ziet 70 producten met prijzen en instellingen; de verborgen producenten (Coustheur-Bonnard, Messager-Germain) ziet hij niet; klant C (in afwachting) krijgt een lege lijst; anoniem geeft permission denied. Screenshots op desktop en mobiel zijn in orde. ✔
- **Fase 4:** bestelmandje (assets/js/horeca-bestellen.js): per fles of + doos, spoed, opmerking, afleveradres van de klant, totaal excl./incl. btw, plaats_bestelling, mail naar info@ via FormSubmit met autoresponse naar de klant, bestelgeschiedenis. Op mobiel een vaste balk onderaan.
- **Fase 4 getest (19 okt), testorder als A via plaats_bestelling:** 24 flessen van één wijn krijgen 5% korting, een allocatiewijn geen korting, 6+6 glazen samen de staffelprijs; het totaal klopt tot op de cent met de handberekening ✔. Uitverkocht, negatief aantal en verborgen producten worden geweigerd ✔; een meegestuurde prijs van 0,01 wordt genegeerd ✔. B kan de bestellingen en gegevens van A niet lezen, wijzigen, wissen of zelf invoegen ✔. De afronding in de browser is gelijkgetrokken met de database (in centen; 3 prijzen weken eerst 1 cent af).
- **Fase 5 (deels):** het beveiligingstestscript `supabase/beveiligingstest.sh` geeft 29 goed en 0 fout, inclusief controles die moeten lukken. Aanvulscript 003 (nettere omschrijving bij glazen) staat klaar. Voorbehoud "pas definitief na bevestiging" toegevoegd aan het mandje, de bevestiging, de mail en de geschiedenis (wens van de eigenaar). De privacyverklaring is aangevuld met het horecaportaal en goedgekeurd door de eigenaar (afgewezen aanvragen worden binnen 6 maanden verwijderd).
- **Gevonden en hersteld:** er stonden horecabedragen in CLAUDE.md, voortgang.md en schema.sql (door Claude). Die zijn uit de bestanden gehaald; met toestemming van de eigenaar is ook de geschiedenis van de branch opgeschoond (filter-branch en force-push, 19 okt): 0 van de 13 commits op GitHub bevatten nog bedragen. Een lokale reservekopie staat in de branch `reserve-horeca-portaal-voor-opschonen` (niet gepusht; wissen na fase 6).
- **003 uitgevoerd** door de eigenaar; getest: een glas heet nu "HEDONIST Glas \"White\"" en een magnum krijgt "(Magnum 150 cl)" (testorder H-261019-F7F3).
- **Fase 6 (deels):** de handleiding in HANDLEIDING.md bij "Het horecaportaal": goedkeuren, prijzen, voorraad en wijnen, instellingen, bestellingen afhandelen, klant verwijderen, wachtwoord vergeten en de beveiligingstest.
- **Extra (20 okt), wens van de eigenaar:** zoeken (op wijn, producent, druif, jaargang; accenten maken niet uit) en knoppen per regio boven het assortiment (de glazen onder de knop "Glaswerk"); in het mandje rechts kun je per regel het aantal aanpassen (− / +) of de regel verwijderen. Getest als A: alle 70, "pinot" 24, Franken 6, onzin geeft "Geen wijnen gevonden"; aanpassen en verwijderen in het mandje werken; desktop en mobiel in orde. ✔
- **Mandje altijd in beeld (20 okt), wens van de eigenaar:** op de computer past het mandje rechts altijd op het scherm; is het langer, dan scrolt het mandje zelf en blijft de knop "Bestelling plaatsen" onderin staan. De regel over betalen op factuur staat nu boven de knop. Getest op een laptopscherm (1440 × 900), bovenaan en helemaal omlaag gescrold. ✔
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

- **Testaccounts verwijderen** (info+test-a/b/c) in Supabase → Authentication → Users, en de **testbestellingen** van A (H-261019-597D, -36D2, -841A, -F7F3) in de Table Editor → bestellingen.
- **Resend instellen** (`docs/resend-instellen.md`): op 19 okt overgeslagen, omdat de DNS bij GoDaddy niet bereikbaar was (verkeerd of geen account ingelogd). Zonder Resend krijgen klanten geen inlogmails (bevestigen, wachtwoord vergeten).
- Daarna in Supabase **Confirm email** weer **aan** zetten (voor het testen tijdelijk uit).

## Open vragen

- De bestelling via de knop in de browser (met mail) is nog niet echt verstuurd, om geen mail naar info@ te sturen. Testen samen met de eigenaar zodra FormSubmit is geactiveerd.
- "Maximum per klant" is nu een **maximum per bestelling** (`max_per_bestelling`). Moet het een maximum per jaar per klant worden?

## Eerstvolgende stap

De livegang voorbereiden met de eigenaar: Resend, Confirm email aan, FormSubmit activeren, samen een echte bestelling met mail testen, de testaccounts en testbestellingen verwijderen, de reservebranch wissen. Daarna mergen naar main, alleen met uitdrukkelijk akkoord.

## Zo kun je terug

- **Site van vóór het horecaportaal:** de tag `voor-horeca-portaal`.
- **Tussenstand:** elke commit op de branch `horeca-portaal`.
- `main` (de live site) wordt pas gewijzigd na toestemming.
