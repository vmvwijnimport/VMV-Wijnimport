-- ------------------------------------------------------------------
--  017: particuliere prijzen (incl. btw) bij elke wijn, voor de particuliere prijslijst
--  (wens van de eigenaar, 26 okt 2026). Een wijn zonder particuliere prijs staat niet op
--  de particuliere lijst. In te vullen in de backoffice (tabblad Wijnen) of met een
--  importbestand uit prijslijst/ (nooit op GitHub).
--  Ook een particuliere staffelprijs voor de Hedonist-glazen (instellingen).
--  Veilig: voegt kolommen toe en vervangt de functies beheer_product en beheer_instellingen (zie 012).
-- ------------------------------------------------------------------

alter table public.producten
  add column if not exists prijs_particulier numeric(10, 2) check (prijs_particulier >= 0);   -- per fles, incl. btw

-- ---------- Een wijn of glas toevoegen of wijzigen ----------
-- product: {"id": 12 (leeg = nieuw), "soort", "producent", "producent_slug", "regio", "naam", "druif",
--           "jaargang", "formaat", "kleur", "prijs_ex", "beschikbaarheid", "allocatie",
--           "max_per_bestelling", "actief", "prijs_particulier" (incl. btw; leeg = niet op de particuliere lijst)}
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
                                  prijs_particulier)
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
            v_part)
    returning id into uit;
  end if;
  return uit;
end $$;

-- ---------- Particuliere staffelprijs voor de Hedonist-glazen ----------
alter table public.instellingen
  add column if not exists part_glas_staffel_vanaf int check (part_glas_staffel_vanaf > 0),        -- glazen
  add column if not exists part_glas_staffel_prijs numeric(10, 2) check (part_glas_staffel_prijs >= 0); -- per glas, incl. btw

-- Zoals in 012, plus de twee particuliere velden (leeg = geen staffel; zonder deze velden blijven ze staan)
create or replace function public.beheer_instellingen(inst jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_schenk int; v_pct numeric; v_glas int; v_glasprijs numeric; v_min numeric; v_termijn int;
  v_pvanaf int; v_pprijs numeric;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  begin
    v_schenk := (inst ->> 'schenk_vanaf')::int;
    v_pct := round((inst ->> 'schenk_korting_pct')::numeric, 2);
    v_glas := (inst ->> 'glas_staffel_vanaf')::int;
    v_glasprijs := round((inst ->> 'glas_staffel_prijs_ex')::numeric, 2);
    v_min := round(nullif(inst ->> 'minimale_bestelling_ex', '')::numeric, 2);
    v_termijn := (inst ->> 'betaaltermijn_dagen')::int;
    v_pvanaf := nullif(inst ->> 'part_glas_staffel_vanaf', '')::int;
    v_pprijs := round(nullif(inst ->> 'part_glas_staffel_prijs', '')::numeric, 2);
  exception when others then
    raise exception 'Vul overal een geldig getal in';
  end;
  if v_schenk is null or v_schenk < 1 or v_glas is null or v_glas < 1 or v_termijn is null or v_termijn < 0
     or v_pct is null or v_pct < 0 or v_pct > 100 or v_glasprijs is null or v_glasprijs < 0
     or (v_min is not null and v_min < 0) or (v_pvanaf is not null and v_pvanaf < 1) or (v_pprijs is not null and v_pprijs < 0) then
    raise exception 'Vul overal een geldig getal in';
  end if;
  update public.instellingen i set
    schenk_vanaf = v_schenk, schenk_korting_pct = v_pct,
    glas_staffel_vanaf = v_glas, glas_staffel_prijs_ex = v_glasprijs,
    minimale_bestelling_ex = v_min, betaaltermijn_dagen = v_termijn,
    part_glas_staffel_vanaf = case when inst ? 'part_glas_staffel_vanaf' then v_pvanaf else i.part_glas_staffel_vanaf end,
    part_glas_staffel_prijs = case when inst ? 'part_glas_staffel_prijs' then v_pprijs else i.part_glas_staffel_prijs end
  where id = 1;
end $$;
