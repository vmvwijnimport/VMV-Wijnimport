-- ------------------------------------------------------------------
--  018: factuurkoppeling met e-Boekhouden (wens van de eigenaar, 29 okt 2026).
--  Vanuit de backoffice maak je bij een bevestigde bestelling een factuur in e-Boekhouden,
--  met de producten uit e-Boekhouden (zodat de voorraad daar meeloopt). Eerst zie je een
--  voorbeeld; pas na jouw klik wordt de factuur gemaakt. Er gaat nooit iets vanzelf naar de klant.
--  Het werk doet de Edge Function "factuur" (supabase/functions/factuur); die schrijft deze
--  kolommen, en alleen na een controle of je als beheerder bent ingelogd (wachtwoord én code).
--  Veilig: voegt alleen kolommen toe. Klanten kunnen niets wijzigen (ze hebben alleen leesrechten).
-- ------------------------------------------------------------------

-- Welk product in e-Boekhouden hoort bij deze wijn of dit glas
alter table public.producten
  add column if not exists eb_product_id int;

-- Welke relatie in e-Boekhouden hoort bij deze zaak (wordt bij de eerste factuur vastgelegd)
alter table public.klanten
  add column if not exists eb_relatie_id int;

-- De factuur die bij deze bestelling is gemaakt; één factuur per bestelling
alter table public.bestellingen
  add column if not exists eb_factuur_id int,
  add column if not exists eb_factuurnummer text,
  add column if not exists eb_factuur_op timestamptz;

-- Vaste keuzes: welk factuursjabloon, en of de factuur meteen in de boekhouding wordt verwerkt
alter table public.instellingen
  add column if not exists eb_sjabloon_id int,
  add column if not exists eb_verwerken boolean not null default true;
