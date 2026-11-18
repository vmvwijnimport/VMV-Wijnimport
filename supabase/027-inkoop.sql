-- ------------------------------------------------------------------
--  027: inkoopfacturen inboeken vanuit de backoffice (wens van de eigenaar, 18 nov 2026)
--  - De functie "factuur" boekt een inkoopfactuur in e-Boekhouden ("Factuur ontvangen") en maakt
--    de nieuwe wijnen daar aan als product, met de inkoopprijs.
--  - Per leverancier onthouden we de markup voor particulier en horeca en de toeslag per fles
--    (accijns en transport), zodat die de volgende keer al ingevuld zijn.
--  - Alleen de functie (met de service-role-sleutel) leest en schrijft deze tabel: er zijn geen
--    policies, dus de site en ingelogde klanten kunnen er niet bij.
--  Veilig: maakt alleen een nieuwe tabel aan. De bedragen staan alleen in de database.
-- ------------------------------------------------------------------

create table if not exists public.inkoop_leveranciers (
  eb_relatie_id      bigint primary key,
  naam               text not null default '',
  markup_particulier numeric(6, 3),
  markup_horeca      numeric(6, 3),
  toeslag            numeric(8, 2),
  bijgewerkt         timestamptz not null default now()
);

alter table public.inkoop_leveranciers enable row level security;
revoke all on public.inkoop_leveranciers from anon, authenticated;
