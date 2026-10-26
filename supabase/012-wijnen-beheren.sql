-- 012: wijnen, prijzen, voorraad en instellingen beheren vanuit de backoffice.
--
-- Alleen een beheerder kan dit. Alles gaat via twee functies die eerst controleren of je
-- beheerder bent en de invoer nakijken. Er wordt niets verwijderd: een wijn die weg moet,
-- zet je op "niet zichtbaar" (actief = false). Bestaande bestellingen veranderen niet,
-- want die hebben hun eigen prijs per regel.

-- ---------- Een wijn of glas toevoegen of wijzigen ----------
-- product: {"id": 12 (leeg = nieuw), "soort", "producent", "producent_slug", "regio", "naam", "druif",
--           "jaargang", "formaat", "kleur", "prijs_ex", "beschikbaarheid", "allocatie",
--           "max_per_bestelling", "actief"}
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
  exception when others then
    raise exception 'Vul een geldige prijs en een geldig maximum in';
  end;
  if v_prijs is null or v_prijs < 0 or v_prijs > 100000 then raise exception 'Vul een geldige prijs in'; end if;
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
      actief = coalesce((p ->> 'actief')::boolean, true)
    where id = v_id
    returning id into uit;
    if uit is null then raise exception 'Deze wijn bestaat niet (meer)'; end if;
  else
    insert into public.producten (soort, producent, producent_slug, regio, naam, druif, jaargang, formaat,
                                  kleur, prijs_ex, beschikbaarheid, allocatie, max_per_bestelling, actief, volgorde)
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
                     (select coalesce(max(volgorde), 0) + 1 from public.producten)))
    returning id into uit;
  end if;
  return uit;
end $$;

-- ---------- Instellingen ----------
-- inst: {"schenk_vanaf", "schenk_korting_pct", "glas_staffel_vanaf", "glas_staffel_prijs_ex",
--        "minimale_bestelling_ex" (leeg = geen minimum), "betaaltermijn_dagen"}
create or replace function public.beheer_instellingen(inst jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_schenk int; v_pct numeric; v_glas int; v_glasprijs numeric; v_min numeric; v_termijn int;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  begin
    v_schenk := (inst ->> 'schenk_vanaf')::int;
    v_pct := round((inst ->> 'schenk_korting_pct')::numeric, 2);
    v_glas := (inst ->> 'glas_staffel_vanaf')::int;
    v_glasprijs := round((inst ->> 'glas_staffel_prijs_ex')::numeric, 2);
    v_min := round(nullif(inst ->> 'minimale_bestelling_ex', '')::numeric, 2);
    v_termijn := (inst ->> 'betaaltermijn_dagen')::int;
  exception when others then
    raise exception 'Vul overal een geldig getal in';
  end;
  if v_schenk is null or v_schenk < 1 or v_glas is null or v_glas < 1 or v_termijn is null or v_termijn < 0
     or v_pct is null or v_pct < 0 or v_pct > 100 or v_glasprijs is null or v_glasprijs < 0
     or (v_min is not null and v_min < 0) then
    raise exception 'Vul overal een geldig getal in';
  end if;
  update public.instellingen set
    schenk_vanaf = v_schenk, schenk_korting_pct = v_pct,
    glas_staffel_vanaf = v_glas, glas_staffel_prijs_ex = v_glasprijs,
    minimale_bestelling_ex = v_min, betaaltermijn_dagen = v_termijn
  where id = 1;
end $$;

revoke all on function public.beheer_product(jsonb) from public, anon;
revoke all on function public.beheer_instellingen(jsonb) from public, anon;
grant execute on function public.beheer_product(jsonb) to authenticated;
grant execute on function public.beheer_instellingen(jsonb) to authenticated;
