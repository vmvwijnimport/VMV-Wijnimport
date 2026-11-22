-- ------------------------------------------------------------------
--  030: allocatie alleen voor particulieren (wens van de eigenaar, 22 nov 2026)
--  - Nieuw vinkje per wijn: "allocatie_particulier". Dan staat op de particuliere prijslijst
--    "allocatie", maar in het horecaportaal en op de horecaprijslijst niet.
--  - Het gewone vinkje "allocatie" blijft voor allebei gelden.
--  - Maison Raday krijgt meteen het nieuwe vinkje.
--  Veilig: voegt een kolom toe (standaard uit) en vervangt beheer_product (uit 017) met dat ene veld erbij.
-- ------------------------------------------------------------------

alter table public.producten
  add column if not exists allocatie_particulier boolean not null default false;

create or replace function public.beheer_product(product jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  p          jsonb := product;
  v_id       bigint := nullif(p ->> 'id', '')::bigint;
  v_soort    text := coalesce(nullif(p ->> 'soort', ''), 'wijn');
  v_producent text := left(trim(coalesce(p ->> 'producent', '')), 200);
  v_naam     text := left(trim(coalesce(p ->> 'naam', '')), 200);
  v_kleur    text := nullif(p ->> 'kleur', '');
  v_status   text := coalesce(nullif(p ->> 'beschikbaarheid', ''), 'op_voorraad');
  v_prijs    numeric;
  v_part     numeric;
  v_max      int;
  uit        bigint;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if v_producent = '' then raise exception 'Vul de producent in'; end if;
  if v_naam = '' then raise exception 'Vul de naam van de wijn in'; end if;
  if v_soort not in ('wijn', 'glas') then raise exception 'Kies wijn of glas'; end if;
  if v_kleur is not null and v_kleur not in ('wit', 'rood', 'rose') then raise exception 'Kies een geldige kleur'; end if;
  if v_status not in ('op_voorraad', 'binnenkort', 'uitverkocht') then raise exception 'Kies een geldige beschikbaarheid'; end if;
  begin
    v_prijs := round((p ->> 'prijs_ex')::numeric, 2);
    v_max := nullif(p ->> 'max_per_bestelling', '')::int;
    v_part := round(nullif(p ->> 'prijs_particulier', '')::numeric, 2);
  exception when others then
    raise exception 'Vul een geldige prijs en een geldig maximum in';
  end;
  if v_prijs is null or v_prijs < 0 or v_prijs > 100000 then raise exception 'Vul een geldige prijs in'; end if;
  if v_part is not null and (v_part < 0 or v_part > 100000) then raise exception 'Vul een geldige particuliere prijs in'; end if;
  if v_max is not null and v_max < 1 then raise exception 'Vul een geldig maximum in (leeg = geen maximum)'; end if;

  if v_id is not null then
    update public.producten set
      soort = v_soort, producent = v_producent,
      producent_slug = nullif(left(trim(coalesce(p ->> 'producent_slug', '')), 100), ''),
      regio = nullif(left(trim(coalesce(p ->> 'regio', '')), 100), ''),
      naam = v_naam,
      druif = nullif(left(trim(coalesce(p ->> 'druif', '')), 200), ''),
      jaargang = nullif(left(trim(coalesce(p ->> 'jaargang', '')), 20), ''),
      formaat = coalesce(nullif(left(trim(coalesce(p ->> 'formaat', '')), 40), ''), '75 cl'),
      kleur = v_kleur, prijs_ex = v_prijs, beschikbaarheid = v_status,
      allocatie = coalesce((p ->> 'allocatie')::boolean, false),
      -- zonder dit veld blijft het staan
      allocatie_particulier = case when p ? 'allocatie_particulier' then coalesce((p ->> 'allocatie_particulier')::boolean, false) else allocatie_particulier end,
      max_per_bestelling = v_max,
      actief = coalesce((p ->> 'actief')::boolean, true),
      -- zonder dit veld (bijv. de snelle keuze in de lijst) blijft de particuliere prijs staan
      prijs_particulier = case when p ? 'prijs_particulier' then v_part else prijs_particulier end
    where id = v_id
    returning id into uit;
    if uit is null then raise exception 'Deze wijn bestaat niet (meer)'; end if;
  else
    insert into public.producten (soort, producent, producent_slug, regio, naam, druif, jaargang, formaat,
                                  kleur, prijs_ex, beschikbaarheid, allocatie, max_per_bestelling, actief, volgorde,
                                  prijs_particulier, allocatie_particulier)
    values (v_soort, v_producent,
            nullif(left(trim(coalesce(p ->> 'producent_slug', '')), 100), ''),
            nullif(left(trim(coalesce(p ->> 'regio', '')), 100), ''),
            v_naam,
            nullif(left(trim(coalesce(p ->> 'druif', '')), 200), ''),
            nullif(left(trim(coalesce(p ->> 'jaargang', '')), 20), ''),
            coalesce(nullif(left(trim(coalesce(p ->> 'formaat', '')), 40), ''), '75 cl'),
            v_kleur, v_prijs, v_status,
            coalesce((p ->> 'allocatie')::boolean, false), v_max,
            coalesce((p ->> 'actief')::boolean, true),
            -- bij de andere wijnen van dezelfde producent; een nieuwe producent achteraan
            coalesce((select max(volgorde) from public.producten where producent = v_producent),
                     (select coalesce(max(volgorde), 0) + 1 from public.producten)),
            v_part, coalesce((p ->> 'allocatie_particulier')::boolean, false))
    returning id into uit;
  end if;
  return uit;
end $$;

update public.producten set allocatie_particulier = true where producent ilike '%raday%';
