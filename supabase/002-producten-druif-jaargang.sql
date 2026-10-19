-- ==================================================================
--  Aanvulling 002: druif toevoegen, jaargang als tekst (voor "B20" = base 2020)
--  Veilig: verwijdert niets. Eenmalig uitvoeren in de SQL Editor.
-- ==================================================================
alter table public.producten alter column jaargang type text using jaargang::text;
alter table public.producten add column if not exists druif text;
comment on column public.producten.jaargang is 'Jaartal, of bijvoorbeeld B20 voor base 2020';
comment on column public.producten.formaat is 'Bijvoorbeeld 75 cl, 50 cl of Magnum 150 cl';
