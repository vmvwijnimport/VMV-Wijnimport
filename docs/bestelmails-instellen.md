# Bestelmails in huisstijl instellen

Met deze stappen verstuurt Supabase zelf de bestelmails, in de huisstijl van VMV:

- bij een nieuwe bestelling een mail naar VMV;
- bij het bevestigen (status `bevestigd`) een bevestiging voor de klant.

Zolang Resend ons domein nog niet kent (de DNS-records bij GoDaddy), mag Resend alleen mailen naar het adres van je eigen Resend-account. De bevestiging voor de klant komt dan bij jou binnen, met bovenaan het adres om hem door te sturen. Het overzicht direct na het bestellen krijgt de klant in die periode via FormSubmit.

**Je hoeft Claude geen sleutels te sturen.** Je plakt ze zelf in Supabase.

## 1. Sleutel in Resend

1. Log in op **resend.com**. Kijk rechtsboven of in **Settings** met welk e-mailadres je account is gemaakt. Alleen naar dat adres kan Resend nu al mailen.
2. Ga naar **API Keys** → **Create API Key**. **Name:** `bestelmail`. **Permission:** **Sending access**. **Domain:** **All domains**. Klik op **Add**.
3. Kopieer de sleutel (begint met `re_`). Laat het venster open of plak hem meteen in stap 3.

## 2. De functie in Supabase zetten

1. In Supabase: links **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Geef de functie de naam **`bestelmail`** (precies zo).
3. Haal alle voorbeeldcode in de editor weg. Plak de hele inhoud van `supabase/functions/bestelmail/index.ts` erin (Claude zet hem voor je klaar).
4. Klik op **Deploy function**.
5. Open de functie en ga naar de instellingen (**Details** of **Settings**). Zet **Verify JWT** (of "Enforce JWT verification") **uit** en sla op.
   Dat is veilig: de functie krijgt alleen een bestelnummer binnen, leest de rest zelf uit de database en verstuurt elke mail maar één keer.

## 3. Instellingen van de functie (secrets)

In Supabase: **Edge Functions** → **Secrets** (of **Manage secrets**). Voeg toe:

| Naam | Waarde |
|---|---|
| `RESEND_API_KEY` | de sleutel uit stap 1 (`re_...`) |
| `VMV_MAIL` | het adres van je Resend-account uit stap 1, bijvoorbeeld `info@vmvwijnimport.com` |

Klik op **Save**.

## 4. Het databasescript

**SQL Editor** → **New query** → plak de inhoud van `supabase/005-bestelmails.sql` → **Run**. Je krijgt "Success".

## 5. Testen

1. Plaats in het portaal een proefbestelling als testklant (1 fles, opmerking "PROEF").
2. Binnen een minuut komt "Nieuwe bestelling H-… – TEST Klant A" binnen in de huisstijl.
3. Zet in **Table Editor → bestellingen** de status van die bestelling op `bevestigd`. Er komt een bevestiging binnen met bovenaan "Nog niet naar de klant verstuurd".

Komt er niets? Kijk in **Edge Functions → bestelmail → Logs** of **Invocations** en stuur Claude een screenshot. Daar staan geen geheimen in.

## Later: als de DNS-records er zijn

Als Resend het domein vmvwijnimport.com kent (zie `docs/resend-instellen.md`):

1. Voeg bij de secrets toe: `AFZENDER` = `VMV Wijnimport <bestellingen@vmvwijnimport.com>` en `KLANTMAIL` = `aan`.
2. Vraag Claude om in de site `klantmail` op `resend` te zetten. Dan stopt de tekstmail via FormSubmit en krijgt de klant ook het overzicht in huisstijl.

## Update 20 okt: backoffice, knoppen in de mail, afkeuren en welkomstmail

Doe deze stappen in deze volgorde.

1. **Functie bijwerken:** **Edge Functions → bestelmail → Code**. Vervang alle code door de nieuwe inhoud van `supabase/functions/bestelmail/index.ts` en klik op **Deploy**. Controleer daarna dat **Verify JWT** nog steeds uit staat.
2. **Drie databasescripts**, één voor één: **SQL Editor → New query** → plak `supabase/006-afkeuren.sql` → **Run**. Daarna hetzelfde met `supabase/007-korting-bij-bevestigen.sql` en `supabase/008-backoffice.sql`. Je krijgt geen waarschuwing: er staat geen "drop" in. Voer 008 maar één keer uit; een tweede keer geeft de melding dat de regels al bestaan (dat kan geen kwaad).
3. **Je eigen beheerdersaccount:**
   1. **Authentication → Users → Add user → Create new user**. Vul je e-mailadres en een wachtwoord in en zet **Auto Confirm User** aan. Gebruik niet het adres van een testklant.
   2. **SQL Editor → New query**, met jouw adres en naam:
      `insert into public.beheerders (id, naam) select id, 'Stijn' from auth.users where email = 'jouw@adres.nl';`
      Klik op **Run**. Je krijgt "Success. 1 row" (staat er 0 rows, dan klopt het adres niet).
   3. Doe hetzelfde later voor Tim.
4. **Alleen zolang het portaal nog niet live staat:** de knoppen in de mail openen de backoffice op de live site, en die staat er pas na de livegang. Om nu al te testen voeg je bij de secrets `BEHEER_URL` toe met de waarde `http://localhost:4000/horeca/beheer/` (werkt alleen op je MacBook, met de voorbeeldsite aan). **Verwijder die secret na de livegang.** De knop in de welkomstmail werkt ook pas na de livegang.

## Update 20 okt: weekoverzicht op zondagavond

1. **Functie bijwerken:** **Edge Functions → bestelmail → Code**. Vervang alle code door de nieuwe inhoud van `supabase/functions/bestelmail/index.ts` en klik op **Deploy**. Verify JWT blijft uit.
2. **SQL Editor → New query** → plak `supabase/009-weekoverzicht.sql` → **Run**. Je krijgt één regel terug met een nummer: dat is de geplande taak.
3. **Testen (mag één keer per 20 uur):** **SQL Editor**:
   `select net.http_post(url := 'https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail', body := '{"weekoverzicht": true}'::jsonb);`
   Binnen een minuut komt "Te leveren: …" binnen op info@ (alleen als er bevestigde of nieuwe bestellingen zijn).

## Update 26 okt: aanvraagmail in de huisstijl

Bij een nieuwe accountaanvraag stuurt de database nu zelf een mail "Nieuwe aanvraag: …" aan info@, in de huisstijl. Die vervangt de mail van FormSubmit; de klant krijgt alleen nog de mail "Bevestig je e-mailadres".

1. **Functie bijwerken:** **Edge Functions → bestelmail → Code**. Vervang alle code door de nieuwe inhoud van `supabase/functions/bestelmail/index.ts` en klik op **Deploy**. Verify JWT blijft uit.
2. **SQL Editor → New query** → plak `supabase/010-aanvraagmail.sql` → **Run**. Je krijgt "Success". Bestaande klanten krijgen geen mail.
   Plak in dezelfde query ook `supabase/011-bestelling-verwijderen.sql` (de knop **Bestelling verwijderen** in de backoffice).
3. Daarna gaat de wijziging op de site live (het FormSubmit-mailtje vervalt).
4. **Testen:** vraag op /horeca/ een account aan met een eigen adres. Binnen een minuut komt "Nieuwe aanvraag: …" binnen op info@. Wijs de testaanvraag daarna af of verwijder hem.

## Update 26 okt: wijnen, prijzen en voorraad in de backoffice

**SQL Editor → New query** → plak `supabase/012-wijnen-beheren.sql` → **Run**. Je krijgt "Success". Daarna werkt het tabblad **Wijnen** in de backoffice (na het live zetten van de site). De functie bestelmail hoeft hiervoor niet opnieuw.
