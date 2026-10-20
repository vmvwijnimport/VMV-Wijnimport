-- ------------------------------------------------------------------
--  009: elke zondagavond een mail naar VMV met de bestellingen die
--  nog geleverd moeten worden (wens van de eigenaar, 20 okt 2026).
--  De database roept de functie "bestelmail" aan; die stelt de mail samen.
--  Zijn er geen bestellingen om te leveren of te bevestigen, dan komt er geen mail.
--  Veilig: voegt één kolom en een geplande taak toe.
--
--  Tijd: zondag 18:00 UTC, dat is 20:00 in de zomer en 19:00 in de winter.
--  Opnieuw uitvoeren mag: de taak met dezelfde naam wordt dan bijgewerkt.
--  Een andere dag of tijd? Voer de regel met cron.schedule opnieuw uit met
--  bijvoorbeeld '0 6 * * 1' voor maandagochtend (minuut, uur, dag, maand, weekdag).
--  Stoppen: select cron.unschedule('weekoverzicht');
-- ------------------------------------------------------------------

-- Wanneer het laatste weekoverzicht is verstuurd (hooguit één per 20 uur, tegen misbruik)
alter table public.instellingen
  add column if not exists weekoverzicht_op timestamptz;

-- Met pg_cron kan de database zelf op vaste tijden iets doen
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'weekoverzicht',
  '0 18 * * 0',
  $$ select net.http_post(
       url  := 'https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail',
       body := '{"weekoverzicht": true}'::jsonb
     ); $$
);
