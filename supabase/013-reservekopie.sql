-- ------------------------------------------------------------------
--  013: elke zondagavond een reservekopie per mail naar VMV (wens van de eigenaar, 26 okt 2026).
--  De database roept de functie "bestelmail" aan; die zet alle klanten, wijnen, instellingen,
--  bestellingen en beheerders in één bestand (JSON) en mailt dat als bijlage naar info@.
--  Hooguit één per 20 uur. Veilig: voegt één kolom en een geplande taak toe.
--
--  Tijd: zondag 18:30 UTC (20:30 in de zomer, 19:30 in de winter), na het weekoverzicht.
--  Opnieuw uitvoeren mag: de taak met dezelfde naam wordt dan bijgewerkt.
--  Stoppen: select cron.unschedule('reservekopie');
--  Nu meteen een reservekopie (hooguit één per 20 uur):
--    select net.http_post(url := 'https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail',
--                         body := '{"reservekopie": true}'::jsonb, timeout_milliseconds := 60000);
-- ------------------------------------------------------------------

-- Wanneer de laatste reservekopie is verstuurd
alter table public.instellingen
  add column if not exists reservekopie_op timestamptz;

select cron.schedule(
  'reservekopie',
  '30 18 * * 0',
  $$ select net.http_post(
       url  := 'https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail',
       body := '{"reservekopie": true}'::jsonb,
       timeout_milliseconds := 60000
     ); $$
);
