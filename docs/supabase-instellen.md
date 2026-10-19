# Supabase instellen (fase 1)

Supabase is de dienst waar het inloggen en de database van het horecaportaal draaien. De website zelf blijft op GitHub staan. Je doet dit één keer; reken op ongeveer 20 minuten.

## 1. Account maken

1. Ga naar **supabase.com** en klik op **Start your project**.
2. Meld je aan met je e-mailadres, of met je GitHub-account (dat is handig).
3. Bevestig je e-mailadres als Supabase daarom vraagt.

## 2. Project aanmaken

1. Klik op **New project**.
2. Vul in:
   - **Name:** `vmv-horeca`
   - **Database Password:** klik op **Generate a password**, kopieer het en bewaar het in je wachtwoordmanager. Je hebt het zelden nodig, maar raak het niet kwijt. Stuur het **niet** naar Claude.
   - **Region:** **Central EU (Frankfurt)**
   - **Plan:** Free
3. Klik op **Create new project** en wacht een paar minuten.

## 3. De database aanmaken

1. Klik links op **SQL Editor** (het icoontje met `>_`).
2. Klik op **New query**.
3. Open het bestand `supabase/schema.sql` uit deze projectmap, kopieer **alles** en plak het in het venster.
4. Klik rechtsonder op **Run**. Supabase waarschuwt dan voor "destructive operations"; bij een nieuw, leeg project klik je gewoon op **Run query**.
   **Voer dit script nooit opnieuw uit** als er al klanten, wijnen of bestellingen in staan: het wist dan alles.
5. Onderaan moet **Success. No rows returned** staan. Zie je een rode foutmelding, kopieer die dan en stuur hem naar Claude.

Daarna staan er onder **Table Editor** vijf tabellen: `klanten`, `producten`, `instellingen`, `bestellingen` en `bestelregels`.

## 4. Gegevens naar Claude sturen

1. Ga naar **Project Settings** (het tandwiel linksonder) en kies **API Keys** (bij oudere versies: **API**).
2. Stuur Claude deze twee gegevens:
   - de **Project URL**, zoiets als `https://abcdefgh.supabase.co` (te vinden onder **Data API** of bovenaan de pagina);
   - de **publishable key**, die begint met `sb_publishable_`. Bij oudere versies heet hij de **anon public**-sleutel en begint hij met `eyJ`.

Deze twee zijn **openbaar**: ze komen in de website te staan, en dat is veilig, omdat de beveiliging in de database zit.

**Stuur Claude nooit** de **secret key** (`sb_secret_...`) of de **service_role**-sleutel, en ook niet het databasewachtwoord. Die geven volledige toegang.

## 5. Inloginstellingen

1. Ga naar **Authentication** → **Sign In / Providers** (of **Providers**) → **Email**.
2. Zorg dat **Enable Email provider** en **Confirm email** aan staan.
3. Ga naar **Authentication** → **URL Configuration** en vul in:
   - **Site URL:** `https://vmvwijnimport.github.io/VMV-Wijnimport/horeca/`
   - Bij **Redirect URLs** voeg je toe: `https://vmvwijnimport.github.io/VMV-Wijnimport/**` en `http://localhost:4000/**`

De mailinstellingen (Resend) doen we in fase 2.
