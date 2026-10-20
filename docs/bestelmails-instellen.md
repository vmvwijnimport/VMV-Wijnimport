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
