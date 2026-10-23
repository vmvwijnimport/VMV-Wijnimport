# Inlogmails in de huisstijl (bevestigen en wachtwoord vergeten)

Supabase stuurt twee mails naar klanten: één om het e-mailadres te bevestigen na een aanvraag, en één bij "Wachtwoord vergeten". Ze gaan al via Resend (zie `resend-instellen.md`). Met deze stappen worden ze Nederlands en in dezelfde opmaak als de bestelmails.

De mails staan in `supabase/mails/`. Er staan geen geheimen of prijzen in.

## 1. Bevestigingsmail

1. Supabase → **Authentication** → **Emails** → tab **Templates** → **Confirm signup**.
2. **Subject:** `Bevestig je e-mailadres voor het horecaportaal`
3. **Message body:** kies **Source** (of `<>`), haal alles weg en plak de inhoud van `supabase/mails/bevestig-aanmelding.html`.
4. Klik op **Save changes**.

## 2. Wachtwoord vergeten

1. Zelfde scherm → **Reset password**.
2. **Subject:** `Nieuw wachtwoord voor het horecaportaal`
3. **Message body:** plak de inhoud van `supabase/mails/wachtwoord-herstellen.html`.
4. Klik op **Save changes**.

## 3. Bevestigen verplicht maken

1. **Authentication** → **Sign In / Providers** → **Email**.
2. Zet **Confirm email** aan en klik op **Save**.

Nieuwe aanvragen moeten dan eerst hun e-mailadres bevestigen. Bestaande accounts merken er niets van.

## 4. Testen via de voorbeeldsite

Test de links uit deze mails op de MacBook zelf, via `http://localhost:4000/horeca/`. Supabase accepteert het netwerkadres van de MacBook (`192.168.178.99`) niet als terugkeeradres, ook niet als het bij **Redirect URLs** staat; de link gaat dan naar de live site. Na de livegang gaat de link vanzelf naar de live site, en dat is goed.
