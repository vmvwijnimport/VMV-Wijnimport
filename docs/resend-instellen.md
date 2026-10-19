# Resend instellen (mails voor het horecaportaal)

Supabase verstuurt de mails voor bevestigen en wachtwoord vergeten zonder eigen mailserver alleen naar de beheerders van het project, niet naar klanten. Daarom koppelen we Resend, een gratis maildienst (tot 3.000 mails per maand).

Je normale mailbox info@vmvwijnimport.com blijft precies zoals hij is. Resend gebruikt alleen het subdomein `send.vmvwijnimport.com` om te versturen, dus het zit je Microsoft 365-mail niet in de weg.

## 1. Account en domein

1. Ga naar **resend.com** en maak een account aan, bijvoorbeeld met info@vmvwijnimport.com.
2. Klik links op **Domains** → **Add Domain**.
3. **Domain:** `vmvwijnimport.com`. **Region:** **Ireland (eu-west-1)**. Klik op **Add**.
4. Resend toont nu een paar **DNS-records** (meestal een TXT voor DKIM, en een MX en een TXT voor `send`). Laat dit scherm open.

## 2. DNS-records bij GoDaddy

1. Log in bij **GoDaddy** → **Mijn producten** → bij `vmvwijnimport.com` klik je op **DNS** (of **Domein beheren** → **DNS**).
2. Voeg elk record uit Resend toe met **Toevoegen** / **Nieuw record**:
   - **Type:** zoals in Resend (TXT of MX).
   - **Naam/Host:** zoals in Resend, bijvoorbeeld `resend._domainkey` of `send`. Laat `.vmvwijnimport.com` weg als GoDaddy dat er zelf achter zet.
   - **Waarde:** precies kopiëren uit Resend.
   - **Prioriteit** (alleen bij MX): zoals in Resend, meestal 10.
3. Bestaande records, zoals die van Microsoft 365, **laat je staan**. Je voegt alleen toe.
4. Ga terug naar Resend en klik op **Verify DNS Records**. Het kan een paar minuten tot een paar uur duren voordat alles groen is.

Kom je er niet uit? Maak een screenshot van het DNS-scherm bij GoDaddy en van het scherm in Resend, dan kijkt Claude mee. **Er staan geen geheimen in DNS-records**, dus die screenshots zijn veilig.

## 3. Sleutel aanmaken en in Supabase zetten

1. In Resend: **API Keys** → **Create API Key**. **Name:** `supabase`. **Permission:** **Sending access**. **Domain:** `vmvwijnimport.com`.
2. Kopieer de sleutel (begint met `re_`). **Stuur hem niet naar Claude.** Je plakt hem direct in Supabase.
3. In Supabase: **Authentication** → **Emails** (of **Notifications**) → tab **SMTP Settings** → zet **Enable Custom SMTP** aan en vul in:
   - **Sender email:** `noreply@vmvwijnimport.com`
   - **Sender name:** `VMV Wijnimport`
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** de sleutel uit Resend (`re_...`)
4. Klik op **Save**.

Laat Claude weten dat het klaar is. Dan testen we samen een aanvraag.
