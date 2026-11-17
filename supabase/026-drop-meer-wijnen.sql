-- ------------------------------------------------------------------
--  026: twee of drie wijnen in één drop (wens van de eigenaar, 17 nov 2026)
--  - In de backoffice kies je bij Nieuwe drop meerdere wijnen. Elke wijn is een eigen rij in
--    drops (eigen prijs, aantal, foto en voorraad); de tweede en derde wijn wijzen met "groep"
--    naar de eerste. De link is die van de eerste wijn: /drop/?c=<code>.
--  - drop_aanbod geeft bij de eerste wijn de codes van de andere wijnen mee ("samen"), zodat de
--    droppagina ze samen toont. Het mandje en de betaling werkten al met meer wijnen tegelijk.
--  Veilig: voegt één kolom toe en vervangt drop_aanbod en beheer_drop (uit 022). Vereist 022 en 023.
-- ------------------------------------------------------------------

alter table public.drops add column if not exists groep bigint references public.drops (id) on delete set null;

-- ---------- Het aanbod voor de droppagina, nu met de andere wijnen van dezelfde drop ----------
create or replace function public.drop_aanbod(drop_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d public.drops;
  p public.producten;
  i public.drop_instellingen;
  bezet int;
  betaald int;
  st text;
begin
  select * into d from public.drops where code = lower(trim(coalesce(drop_code, '')));
  if d.id is not null then select * into p from public.producten where id = d.product_id; end if;
  if d.id is null or p.id is null then return jsonb_build_object('status', 'onbekend'); end if;
  if now() < d.open_vanaf and not d.gestopt then
    return jsonb_build_object('status', 'binnenkort', 'open_vanaf', d.open_vanaf);
  end if;
  select * into i from public.drop_instellingen where id = 1;

  bezet := public.drop_bezet(d.id);
  select coalesce(sum((r ->> 'aantal')::int), 0)::int into betaald
  from public.drop_bestellingen b, jsonb_array_elements(b.regels) r
  where b.status = 'betaald' and r ->> 'soort' = 'wijn' and (r ->> 'drop_id')::bigint = d.id;

  st := case when d.gestopt or (d.open_tot is not null and now() > d.open_tot) then 'voorbij'
             when betaald >= d.aantal then 'uitverkocht'
             when bezet >= d.aantal then 'vol'
             else 'open' end;
  return jsonb_build_object(
    'status', st,
    'code', d.code,
    'naam', public.drop_wijnnaam(p),
    'producent', p.producent, 'slug', p.producent_slug, 'regio', p.regio,
    'wijn', p.naam, 'jaargang', p.jaargang, 'druif', p.druif, 'kleur', p.kleur, 'formaat', p.formaat,
    'prijs', d.prijs,
    'beschikbaar', case when st = 'open' then greatest(d.aantal - bezet, 0) else 0 end,
    'toon_aantal', d.toon_aantal,
    'max', d.max_per_klant,
    'open_tot', d.open_tot,
    'tekst', d.tekst, 'tekst_en', d.tekst_en,
    'levering', d.levering, 'levering_en', d.levering_en,
    'foto', d.foto,
    'samen', coalesce((select jsonb_agg(x.code order by x.id) from public.drops x where x.groep = d.id and not x.verwijderd), '[]'::jsonb),
    'bezorgkosten', jsonb_build_object(
      'verzendkosten', i.verzendkosten, 'gratis_vanaf', i.gratis_vanaf, 'gratis_amsterdam_vanaf', i.gratis_amsterdam_vanaf)
  );
end $$;
revoke all on function public.drop_aanbod(text) from public;
grant execute on function public.drop_aanbod(text) to anon, authenticated;

-- ---------- Backoffice: een drop opslaan, nu met de groep ----------
create or replace function public.beheer_drop(gegevens jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  g        jsonb := gegevens;
  v_id     bigint := nullif(g ->> 'id', '')::bigint;
  v_prod   bigint;
  v_prijs  numeric;
  v_aantal int;
  v_max    int;
  v_vanaf  timestamptz;
  v_tot    timestamptz;
  v_groep  bigint;
  schoon   text := '';
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  begin
    v_prod := nullif(g ->> 'product_id', '')::bigint;
    v_prijs := round((g ->> 'prijs')::numeric, 2);
    v_aantal := (g ->> 'aantal')::int;
    v_max := nullif(g ->> 'max_per_klant', '')::int;
    v_vanaf := coalesce(nullif(g ->> 'open_vanaf', '')::timestamptz, now());
    v_tot := nullif(g ->> 'open_tot', '')::timestamptz;
    v_groep := nullif(g ->> 'groep', '')::bigint;
  exception when others then
    raise exception 'Vul een geldige prijs, aantallen en datums in';
  end;
  if v_prod is null or not exists (select 1 from public.producten where id = v_prod) then raise exception 'Kies een wijn'; end if;
  if v_prijs is null or v_prijs <= 0 or v_prijs > 100000 then raise exception 'Vul een geldige prijs in'; end if;
  if v_aantal is null or v_aantal < 0 or v_aantal > 100000 then raise exception 'Vul een geldig aantal flessen in'; end if;
  if v_max is not null and v_max < 1 then raise exception 'Vul een geldig maximum per klant in (leeg = geen maximum)'; end if;
  if v_tot is not null and v_tot <= v_vanaf then raise exception 'De drop moet sluiten na het moment dat hij opengaat'; end if;
  if v_groep is not null and (v_groep = v_id or not exists (select 1 from public.drops where id = v_groep and groep is null)) then
    raise exception 'Deze drop bestaat niet (meer)';
  end if;
  if nullif(g ->> 'foto', '') is not null and g ->> 'foto' !~ '^https://[A-Za-z0-9.-]+/' then raise exception 'Ongeldig adres van de foto'; end if;

  if v_id is null then
    insert into public.drops (product_id, prijs, aantal) values (v_prod, v_prijs, v_aantal) returning id into v_id;
  end if;
  update public.drops set
    product_id = v_prod, prijs = v_prijs, aantal = v_aantal, max_per_klant = v_max,
    toon_aantal = coalesce((g ->> 'toon_aantal')::boolean, true),
    open_vanaf = v_vanaf, open_tot = v_tot,
    gestopt = coalesce((g ->> 'gestopt')::boolean, false),
    tekst = nullif(left(trim(coalesce(g ->> 'tekst', '')), 3000), ''),
    tekst_en = nullif(left(trim(coalesce(g ->> 'tekst_en', '')), 3000), ''),
    levering = nullif(left(trim(coalesce(g ->> 'levering', '')), 200), ''),
    levering_en = nullif(left(trim(coalesce(g ->> 'levering_en', '')), 200), ''),
    foto = nullif(left(trim(coalesce(g ->> 'foto', '')), 500), ''),
    groep = v_groep
  where id = v_id;
  if not found then raise exception 'Deze drop bestaat niet (meer)'; end if;
  return v_id;
end $$;
revoke all on function public.beheer_drop(jsonb) from public, anon;
grant execute on function public.beheer_drop(jsonb) to authenticated;
