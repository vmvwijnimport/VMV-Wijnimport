-- ------------------------------------------------------------------
--  023: automatisch een factuur in e-Boekhouden voor betaalde webwinkelbestellingen
--  (wens van de eigenaar, 11 nov 2026): glazen, wijn uit een drop, of allebei.
--  Na de betaling vraagt de betaal-Worker de functie "factuur" om de factuur te maken.
--  De factuur wordt niet gemaild; dat doet VMV zelf vanuit e-Boekhouden.
--  - Wijn: het product uit e-Boekhouden dat bij de wijn is gekoppeld (Prijslijst → Koppelen).
--  - Glazen en bezorgkosten: de producten die je kiest onder Prijslijst → Koppelen, bij Webwinkel.
--  - De klant: de relatie in e-Boekhouden met hetzelfde e-mailadres, anders een nieuwe (particulier).
--  Veilig: voegt alleen kolommen toe en vervangt hedonist_opslaan (uit 015), die nu ook de regels bewaart.
-- ------------------------------------------------------------------

-- De regels van een bestelling met alleen glazen, en de factuur die erbij is gemaakt
alter table public.hedonist_bestellingen
  add column if not exists regels           jsonb,          -- [{"soort": "glas", "naam", "aantal", "bedrag"}]
  add column if not exists eb_factuur_id    int,
  add column if not exists eb_factuurnummer text,
  add column if not exists eb_factuur_op    timestamptz,
  add column if not exists eb_factuur_fout  text;           -- waarom de automatische factuur niet lukte

-- Welke producten in e-Boekhouden bij de glazen en de bezorgkosten van de webwinkel horen
alter table public.instellingen
  add column if not exists eb_glas_breed   int,
  add column if not exists eb_glas_white   int,
  add column if not exists eb_bezorgkosten int;

-- ---------- De Worker slaat een betaalde bestelling op, nu met de regels ----------
create or replace function public.hedonist_opslaan(gegevens jsonb, sleutel text)
returns void
language plpgsql security definer set search_path = public as $$
declare g jsonb := gegevens;
begin
  if not exists (select 1 from public.koppelsleutels k where k.naam = 'hedonist' and k.sleutel = hedonist_opslaan.sleutel) then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  insert into public.hedonist_bestellingen (mollie_id, bestelnummer, methode, naam, email, telefoon, bezorging, adres,
                                            opmerking, bestelling, glazen, verzending, totaal, regels)
  values (left(g ->> 'mollie_id', 40), left(coalesce(g ->> 'bestelnummer', ''), 40), left(g ->> 'methode', 40),
          left(coalesce(g ->> 'naam', ''), 200), left(coalesce(g ->> 'email', ''), 200), left(coalesce(g ->> 'telefoon', ''), 40),
          left(coalesce(g ->> 'bezorging', ''), 100), left(coalesce(g ->> 'adres', ''), 300), left(g ->> 'opmerking', 500),
          left(coalesce(g ->> 'bestelling', ''), 500),
          nullif(g ->> 'glazen', '')::numeric, nullif(g ->> 'verzending', '')::numeric, nullif(g ->> 'totaal', '')::numeric,
          case when jsonb_typeof(g -> 'regels') = 'array' then g -> 'regels' end)
  on conflict (mollie_id) do nothing;   -- Mollie meldt een betaling soms vaker
end $$;
revoke all on function public.hedonist_opslaan(jsonb, text) from public;
grant execute on function public.hedonist_opslaan(jsonb, text) to anon;

-- ---------- Elke drop kunnen verwijderen (wens van de eigenaar, 11 nov 2026) ----------
-- Is er nog niets op besteld, dan is hij echt weg. Anders verdwijnt hij uit de lijst in de backoffice
-- en is hij niet meer te bestellen (de link toont "voorbij"), maar blijft hij bewaard voor de
-- bestellingen en facturen die erbij horen.
alter table public.drops add column if not exists verwijderd boolean not null default false;

create or replace function public.beheer_drop_verwijderen(drop_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if exists (select 1 from public.drop_bestellingen b, jsonb_array_elements(b.regels) r
             where b.status <> 'vervallen' and r ->> 'soort' = 'wijn' and (r ->> 'drop_id')::bigint = beheer_drop_verwijderen.drop_id) then
    update public.drops set verwijderd = true, gestopt = true where id = beheer_drop_verwijderen.drop_id;
  else
    delete from public.drops where id = beheer_drop_verwijderen.drop_id;
  end if;
end $$;
revoke all on function public.beheer_drop_verwijderen(bigint) from public, anon;
grant execute on function public.beheer_drop_verwijderen(bigint) to authenticated;
