-- ------------------------------------------------------------------
--  029: een pakket in een drop (wens van de eigenaar, 19 nov 2026)
--  - Naast losse wijnen kan een drop een pakket hebben: een eigen naam en prijs (incl. btw), met
--    een of meer wijnen uit dezelfde drop, elk met een aantal flessen per pakket.
--  - De voorraad is gedeeld: per wijn staat het totale aantal flessen. Een pakket haalt flessen
--    van elke wijn erin af; een losse fles alleen van die wijn. Het aantal pakketten volgt uit de
--    voorraad van de wijnen erin.
--  - Per wijn: "los" (los te koop, of alleen in het pakket) en een optioneel "max_los" (zoveel
--    flessen hooguit los, zodat er genoeg overblijft voor de pakketten).
--  - In een bestelling is een pakket een regel met soort "wijn" (zodat de mails van de Worker
--    gewoon werken), met "pakket": true, "flessen" (flessen per wijn in totaal) en "inhoud".
--  Veilig: voegt kolommen toe en vervangt drop_bezet, drop_aanbod, drop_reserveren, drop_betaald,
--  beheer_drop en beheer_drop_verwijderen. Vereist 022, 023 en 026.
-- ------------------------------------------------------------------

alter table public.drops
  add column if not exists soort   text not null default 'wijn' check (soort in ('wijn', 'pakket')),
  add column if not exists los     boolean not null default true,     -- wijn: los te koop (anders alleen in het pakket)
  add column if not exists max_los int check (max_los >= 0),          -- wijn: hooguit zoveel flessen los (leeg = geen grens)
  add column if not exists naam    text,                              -- pakket: naam, bijv. "Carteret-pakket"
  add column if not exists naam_en text,
  add column if not exists inhoud  jsonb not null default '[]';       -- pakket: [{"drop_id", "aantal"}] (flessen per pakket)

-- ---------- Tellen: hoeveel er weg is (betaald, of gereserveerd in de afgelopen 30 minuten) ----------
-- Los: de regels van deze drop zelf (losse flessen, of bij een pakket: het aantal pakketten)
create or replace function public.drop_los(drop_id bigint, email text default null, alleen_betaald boolean default false)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum((r ->> 'aantal')::int), 0)::int
  from public.drop_bestellingen b, jsonb_array_elements(b.regels) r
  where r ->> 'soort' = 'wijn' and (r ->> 'drop_id')::bigint = drop_los.drop_id
    and (b.status = 'betaald' or (not drop_los.alleen_betaald and b.status = 'gereserveerd' and b.aangemaakt_op > now() - interval '30 minutes'))
    and (drop_los.email is null or lower(b.email) = lower(drop_los.email));
$$;
revoke all on function public.drop_los(bigint, text, boolean) from public, anon, authenticated;

-- Alle flessen van een wijn: los verkocht plus in pakketten
create or replace function public.drop_flessen(drop_id bigint, alleen_betaald boolean default false)
returns int
language sql stable security definer set search_path = public as $$
  select public.drop_los(drop_flessen.drop_id, null, drop_flessen.alleen_betaald) + coalesce((
    select sum((f ->> 'aantal')::int)
    from public.drop_bestellingen b, jsonb_array_elements(b.regels) r, jsonb_array_elements(coalesce(r -> 'flessen', '[]'::jsonb)) f
    where (f ->> 'drop_id')::bigint = drop_flessen.drop_id
      and (b.status = 'betaald' or (not drop_flessen.alleen_betaald and b.status = 'gereserveerd' and b.aangemaakt_op > now() - interval '30 minutes'))
  ), 0)::int;
$$;
revoke all on function public.drop_flessen(bigint, boolean) from public, anon, authenticated;

-- Zoals in 022, nu met de flessen in pakketten erbij (met e-mailadres: alleen de losse aankopen van die klant)
create or replace function public.drop_bezet(drop_id bigint, email text default null)
returns int
language sql stable security definer set search_path = public as $$
  select case when drop_bezet.email is null then public.drop_flessen(drop_bezet.drop_id)
              else public.drop_los(drop_bezet.drop_id, drop_bezet.email) end;
$$;
revoke all on function public.drop_bezet(bigint, text) from public, anon, authenticated;

-- Hoeveel er nog te koop is: bij een wijn losse flessen, bij een pakket hele pakketten
create or replace function public.drop_vrij(d public.drops, alleen_betaald boolean default false)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  f    jsonb;
  w    public.drops;
  per  int;
  n    int;
  uit  int;
begin
  if d.soort = 'pakket' then
    uit := null;
    for f in select value from jsonb_array_elements(d.inhoud) loop
      select * into w from public.drops where id = (f ->> 'drop_id')::bigint;
      per := greatest(coalesce((f ->> 'aantal')::int, 1), 1);
      n := case when w.id is null then 0 else greatest(w.aantal - public.drop_flessen(w.id, alleen_betaald), 0) / per end;
      uit := case when uit is null then n else least(uit, n) end;
    end loop;
    return coalesce(uit, 0);
  end if;
  n := greatest(d.aantal - public.drop_flessen(d.id, alleen_betaald), 0);
  if d.max_los is not null then n := least(n, greatest(d.max_los - public.drop_los(d.id, null, alleen_betaald), 0)); end if;
  return n;
end $$;
revoke all on function public.drop_vrij(public.drops, boolean) from public, anon, authenticated;

-- Korte naam van een wijn in een pakket: "Flower Power 2024", met het formaat als het geen 75 cl is
create or replace function public.drop_cuvee(p public.producten)
returns text
language sql immutable as $$
  select p.naam || coalesce(' ' || nullif(p.jaargang::text, ''), '') ||
         case when coalesce(p.formaat, '75 cl') <> '75 cl' then ' (' || p.formaat || ')' else '' end;
$$;

-- ---------- Het aanbod voor de droppagina en het mandje ----------
-- Nieuw: "soort", "los", en bij een pakket "pakket" (naam) en "inhoud" (de wijnen met hun aantal per pakket)
create or replace function public.drop_aanbod(drop_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d   public.drops;
  p   public.producten;
  w   public.drops;
  wp  public.producten;
  i   public.drop_instellingen;
  f   jsonb;
  inh jsonb := '[]';
  st  text;
  naam text;
begin
  select * into d from public.drops where code = lower(trim(coalesce(drop_code, '')));
  if d.id is null then return jsonb_build_object('status', 'onbekend'); end if;
  if d.soort = 'pakket' then
    for f in select value from jsonb_array_elements(d.inhoud) loop
      select * into w from public.drops where id = (f ->> 'drop_id')::bigint;
      select * into wp from public.producten where id = w.product_id;
      if wp.id is not null then
        if p.id is null then p := wp; end if;   -- producent en link van de eerste wijn
        inh := inh || jsonb_build_object('code', w.code, 'aantal', greatest(coalesce((f ->> 'aantal')::int, 1), 1),
          'naam', public.drop_wijnnaam(wp), 'cuvee', public.drop_cuvee(wp), 'producent', wp.producent,
          'wijn', wp.naam, 'jaargang', wp.jaargang, 'druif', wp.druif, 'kleur', wp.kleur, 'formaat', wp.formaat,
          'tekst', w.tekst, 'tekst_en', w.tekst_en, 'foto', w.foto, 'los', w.los);
      end if;
    end loop;
    if jsonb_array_length(inh) = 0 then return jsonb_build_object('status', 'onbekend'); end if;
  else
    select * into p from public.producten where id = d.product_id;
    if p.id is null then return jsonb_build_object('status', 'onbekend'); end if;
  end if;
  if now() < d.open_vanaf and not d.gestopt then
    return jsonb_build_object('status', 'binnenkort', 'open_vanaf', d.open_vanaf);
  end if;
  select * into i from public.drop_instellingen where id = 1;

  st := case when d.gestopt or d.verwijderd or (d.open_tot is not null and now() > d.open_tot) then 'voorbij'
             when public.drop_vrij(d, true) <= 0 then 'uitverkocht'
             when public.drop_vrij(d) <= 0 then 'vol'
             else 'open' end;
  naam := case when d.soort = 'pakket' then coalesce(d.naam, 'Pakket') else public.drop_wijnnaam(p) end;
  return jsonb_build_object(
    'status', st,
    'code', d.code,
    'soort', d.soort,
    'los', d.soort = 'pakket' or d.los,
    'naam', naam,
    'pakket', case when d.soort = 'pakket' then coalesce(d.naam, 'Pakket') end,
    'pakket_en', case when d.soort = 'pakket' then coalesce(d.naam_en, d.naam, 'Bundle') end,
    'inhoud', case when d.soort = 'pakket' then inh end,
    'producent', p.producent, 'slug', p.producent_slug, 'regio', p.regio,
    'wijn', case when d.soort = 'pakket' then coalesce(d.naam, 'Pakket') else p.naam end,
    'jaargang', case when d.soort = 'pakket' then null else p.jaargang end,
    'druif', case when d.soort = 'pakket' then null else p.druif end,
    'kleur', case when d.soort = 'pakket' then null else p.kleur end,
    'formaat', case when d.soort = 'pakket' then null else p.formaat end,
    'prijs', d.prijs,
    'beschikbaar', case when st = 'open' then public.drop_vrij(d) else 0 end,
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

-- ---------- De Worker reserveert de flessen vóór het betalen (zoals 022, nu met pakketten) ----------
create or replace function public.drop_reserveren(gegevens jsonb, sleutel text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g        jsonb := gegevens;
  en       boolean := g ->> 'taal' = 'en';
  i        public.drop_instellingen;
  d        public.drops;
  x        public.drops;
  p        public.producten;
  w        record;
  f        jsonb;
  a        int;
  per      int;
  vrij     int;
  al       int;
  naam     text;
  delen    text;
  flessen  jsonb;
  inhoud   jsonb;
  nodig    jsonb := '{}';   -- {"<drop_id>": flessen} van deze bestelling
  regels   jsonb := '[]';
  wijn     numeric := 0;
  glazen   numeric := 0;
  bez      text := g ->> 'bezorging';
  verz     numeric := 0;
  sub      numeric;
  weg      text := case when (g ->> 'taal') = 'en' then 'One of the wines in your basket is no longer available' else 'Een van de wijnen in je mandje is niet meer te bestellen' end;
begin
  if not exists (select 1 from public.koppelsleutels k where k.naam = 'hedonist' and k.sleutel = drop_reserveren.sleutel) then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  if bez not in ('verzenden', 'amsterdam', 'ophalen') then
    raise exception '%', case when en then 'Choose how you’d like to receive your order' else 'Kies hoe je je bestelling wilt ontvangen' end;
  end if;
  select * into i from public.drop_instellingen where id = 1;
  if i.verzendkosten is null or i.gratis_vanaf is null or i.gratis_amsterdam_vanaf is null then
    raise exception '%', case when en then 'Ordering isn’t possible right now' else 'Bestellen lukt nu niet' end;
  end if;

  -- Eerst alle betrokken drops vastzetten (ook de wijnen in een pakket), steeds in dezelfde volgorde,
  -- zodat twee gelijktijdige bestellingen elkaar nooit blokkeren
  perform 1 from public.drops y
  where y.code in (select key from jsonb_each(coalesce(g -> 'wijnen', '{}'::jsonb)))
     or y.id in (select (q ->> 'drop_id')::bigint from public.drops z, jsonb_array_elements(z.inhoud) q
                 where z.code in (select key from jsonb_each(coalesce(g -> 'wijnen', '{}'::jsonb))))
  order by y.id for update;

  for w in select key as code, value from jsonb_each(coalesce(g -> 'wijnen', '{}'::jsonb)) order by key loop
    begin
      a := (w.value #>> '{}')::int;
    exception when others then
      raise exception 'Ongeldig aantal';
    end;
    if a is null or a < 0 or a > 50 then raise exception 'Ongeldig aantal'; end if;
    if a = 0 then continue; end if;

    select * into d from public.drops where code = w.code;
    if d.id is null or d.gestopt or d.verwijderd or now() < d.open_vanaf or (d.open_tot is not null and now() > d.open_tot) then
      raise exception '%', weg;
    end if;

    if d.soort = 'pakket' then
      naam := coalesce(case when en then d.naam_en end, d.naam, 'Pakket');
      flessen := '[]'; inhoud := '[]'; delen := '';
      for f in select value from jsonb_array_elements(d.inhoud) loop
        select * into x from public.drops where id = (f ->> 'drop_id')::bigint;
        select * into p from public.producten where id = x.product_id;   -- geen rij: p wordt leeg
        if x.id is null or p.id is null or x.verwijderd then raise exception '%', weg; end if;
        per := greatest(coalesce((f ->> 'aantal')::int, 1), 1);
        nodig := jsonb_set(nodig, array[x.id::text], to_jsonb(coalesce((nodig ->> x.id::text)::int, 0) + a * per));
        flessen := flessen || jsonb_build_object('drop_id', x.id, 'aantal', a * per);
        inhoud := inhoud || jsonb_build_object('drop_id', x.id, 'aantal', per);
        delen := delen || case when delen = '' then '' else ', ' end || case when per > 1 then per || '× ' else '' end || public.drop_cuvee(p);
      end loop;
      if jsonb_array_length(flessen) = 0 then raise exception '%', weg; end if;
      vrij := public.drop_vrij(d);
      if a > vrij then
        raise exception '%', case
          when vrij = 0 and en then naam || ' is sold out'
          when vrij = 0 then naam || ' is uitverkocht'
          when en then 'Only ' || vrij || ' left of ' || naam
          else 'Er zijn nog ' || vrij || ' van ' || naam end;
      end if;
      naam := naam || ' (' || delen || ')';
    else
      select * into p from public.producten where id = d.product_id;
      if p.id is null then raise exception '%', weg; end if;
      naam := public.drop_wijnnaam(p);
      if not d.los then
        raise exception '%', case when en then naam || ' is only available in the bundle' else naam || ' is alleen te koop in het pakket' end;
      end if;
      vrij := public.drop_vrij(d);
      if a > vrij then
        raise exception '%', case
          when vrij = 0 and en then naam || ' is sold out'
          when vrij = 0 then naam || ' is uitverkocht'
          when en then 'Only ' || vrij || ' left of ' || naam
          else 'Er zijn nog ' || vrij || ' flessen van ' || naam end;
      end if;
      nodig := jsonb_set(nodig, array[d.id::text], to_jsonb(coalesce((nodig ->> d.id::text)::int, 0) + a));
      flessen := null; inhoud := null;
    end if;

    if d.max_per_klant is not null then
      al := public.drop_los(d.id, g ->> 'email');
      if al + a > d.max_per_klant then
        raise exception '%', case
          when en then 'You can order up to ' || d.max_per_klant || ' of ' || naam || case when al > 0 then ' (you already ordered ' || al || ')' else '' end
          else 'Je kunt maximaal ' || d.max_per_klant || ' van ' || naam || ' bestellen' || case when al > 0 then ' (je hebt er al ' || al || ')' else '' end end;
      end if;
    end if;
    wijn := wijn + d.prijs * a;
    regels := regels || (jsonb_build_object('soort', 'wijn', 'drop_id', d.id, 'code', d.code, 'naam', naam, 'aantal', a,
                                            'prijs', d.prijs, 'bedrag', d.prijs * a, 'levering', d.levering, 'levering_en', d.levering_en) ||
                         case when d.soort = 'pakket' then jsonb_build_object('pakket', true, 'flessen', flessen, 'inhoud', inhoud) else '{}'::jsonb end);
  end loop;
  if wijn = 0 then raise exception '%', case when en then 'Your basket is empty' else 'Je winkelmandje is leeg' end; end if;

  -- Samen (losse flessen en pakketten) niet meer flessen dan er zijn
  for w in select key, value from jsonb_each(nodig) loop
    select * into x from public.drops where id = w.key::bigint;
    vrij := greatest(x.aantal - public.drop_flessen(x.id), 0);
    if (w.value #>> '{}')::int > vrij then
      select * into p from public.producten where id = x.product_id;
      raise exception '%', case
        when en then 'Not enough bottles left of ' || public.drop_wijnnaam(p) || ' for your order'
        else 'Er zijn niet genoeg flessen meer van ' || public.drop_wijnnaam(p) || ' voor je bestelling' end;
    end if;
  end loop;

  for w in select value from jsonb_array_elements(coalesce(g -> 'glazen', '[]'::jsonb)) loop
    glazen := glazen + round((w.value ->> 'bedrag')::numeric, 2);
    regels := regels || jsonb_build_object('soort', 'glas', 'naam', left(w.value ->> 'naam', 100), 'aantal', (w.value ->> 'aantal')::int,
                                           'bedrag', round((w.value ->> 'bedrag')::numeric, 2), 'levering', left(g ->> 'glas_levering', 100));
  end loop;

  sub := wijn + glazen;
  verz := case when bez = 'ophalen' then 0
               when bez = 'amsterdam' and sub >= i.gratis_amsterdam_vanaf then 0
               when bez = 'verzenden' and sub >= i.gratis_vanaf then 0
               else i.verzendkosten end;

  insert into public.drop_bestellingen (bestelnummer, naam, email, telefoon, bezorging, adres, opmerking, taal,
                                        regels, subtotaal, verzending, totaal)
  values (left(g ->> 'bestelnummer', 40), left(coalesce(g ->> 'naam', ''), 200), left(coalesce(g ->> 'email', ''), 200),
          left(coalesce(g ->> 'telefoon', ''), 40), left(coalesce(g ->> 'bezorging_tekst', bez), 100),
          left(coalesce(g ->> 'adres', ''), 300), left(g ->> 'opmerking', 500), case when en then 'en' else 'nl' end,
          regels, sub, verz, sub + verz);
  return jsonb_build_object('subtotaal', sub, 'verzending', verz, 'totaal', sub + verz);
end $$;
revoke all on function public.drop_reserveren(jsonb, text) from public;
grant execute on function public.drop_reserveren(jsonb, text) to anon;

-- ---------- Betaald (zoals 022; de controle op te veel verkocht kijkt nu ook naar de flessen in pakketten) ----------
create or replace function public.drop_betaald(bestelnummer text, mollie text, methode text, sleutel text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.drop_bestellingen;
  r jsonb;
  f jsonb;
  d public.drops;
  teveel boolean := false;
begin
  if not exists (select 1 from public.koppelsleutels k where k.naam = 'hedonist' and k.sleutel = drop_betaald.sleutel) then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  select * into b from public.drop_bestellingen x where x.bestelnummer = drop_betaald.bestelnummer for update;
  if b.id is null then return null; end if;

  if b.status <> 'betaald' then
    update public.drop_bestellingen x
    set status = 'betaald', betaald_op = now(), methode = left(drop_betaald.methode, 40), mollie_id = coalesce(x.mollie_id, left(mollie, 40))
    where x.id = b.id;
    -- Kwam de betaling pas binnen nadat de reservering was verlopen, dan kan er nu te veel verkocht zijn
    for r in select value from jsonb_array_elements(b.regels) where value ->> 'soort' = 'wijn' loop
      if coalesce((r ->> 'pakket')::boolean, false) then
        for f in select value from jsonb_array_elements(coalesce(r -> 'flessen', '[]'::jsonb)) loop
          select * into d from public.drops where id = (f ->> 'drop_id')::bigint;
          if d.id is not null and public.drop_flessen(d.id) > d.aantal then teveel := true; end if;
        end loop;
      else
        select * into d from public.drops where id = (r ->> 'drop_id')::bigint;
        if d.id is not null and public.drop_flessen(d.id) > d.aantal then teveel := true; end if;
      end if;
    end loop;
    update public.drop_bestellingen x set te_veel = teveel where x.id = b.id;

    insert into public.hedonist_bestellingen (mollie_id, bestelnummer, methode, naam, email, telefoon, bezorging, adres,
                                              opmerking, bestelling, glazen, verzending, totaal)
    values (coalesce(b.mollie_id, left(mollie, 40)), b.bestelnummer, left(drop_betaald.methode, 40), b.naam, b.email, b.telefoon,
            b.bezorging, b.adres, b.opmerking,
            left((select string_agg((x ->> 'aantal') || ' × ' || (x ->> 'naam'), ', ') from jsonb_array_elements(b.regels) x), 500),
            b.subtotaal, b.verzending, b.totaal)
    on conflict (mollie_id) do nothing;
  end if;

  select * into b from public.drop_bestellingen x where x.id = b.id;
  return to_jsonb(b);
end $$;
revoke all on function public.drop_betaald(text, text, text, text) from public;
grant execute on function public.drop_betaald(text, text, text, text) to anon;

-- ---------- Backoffice: een drop opslaan (zoals 026, nu ook een pakket, los en max_los) ----------
-- Een pakket: {"soort": "pakket", "naam", "naam_en", "prijs", "inhoud": [{"drop_id", "aantal"}], "groep", ...}
-- De wijnen in het pakket moeten in dezelfde drop zitten (de eerste wijn, of met dezelfde groep).
create or replace function public.beheer_drop(gegevens jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  g        jsonb := gegevens;
  v_id     bigint := nullif(g ->> 'id', '')::bigint;
  v_soort  text := case when g ->> 'soort' = 'pakket' then 'pakket' else 'wijn' end;
  v_prod   bigint;
  v_prijs  numeric;
  v_aantal int;
  v_max    int;
  v_maxlos int;
  v_vanaf  timestamptz;
  v_tot    timestamptz;
  v_groep  bigint;
  v_inhoud jsonb := '[]';
  f        jsonb;
  fid      bigint;
  fper     int;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  begin
    v_prod := nullif(g ->> 'product_id', '')::bigint;
    v_prijs := round((g ->> 'prijs')::numeric, 2);
    v_aantal := coalesce(nullif(g ->> 'aantal', '')::int, case when v_soort = 'pakket' then 0 end);
    v_max := nullif(g ->> 'max_per_klant', '')::int;
    v_maxlos := nullif(g ->> 'max_los', '')::int;
    v_vanaf := coalesce(nullif(g ->> 'open_vanaf', '')::timestamptz, now());
    v_tot := nullif(g ->> 'open_tot', '')::timestamptz;
    v_groep := nullif(g ->> 'groep', '')::bigint;
  exception when others then
    raise exception 'Vul een geldige prijs, aantallen en datums in';
  end;
  if v_soort = 'wijn' and (v_prod is null or not exists (select 1 from public.producten where id = v_prod)) then raise exception 'Kies een wijn'; end if;
  if v_soort = 'pakket' then
    v_prod := null;
    if nullif(trim(coalesce(g ->> 'naam', '')), '') is null then raise exception 'Geef het pakket een naam'; end if;
    if v_groep is null then raise exception 'Een pakket hoort bij een drop met wijnen'; end if;
    for f in select value from jsonb_array_elements(coalesce(g -> 'inhoud', '[]'::jsonb)) loop
      begin
        fid := (f ->> 'drop_id')::bigint;
        fper := coalesce((f ->> 'aantal')::int, 1);
      exception when others then
        raise exception 'Kies de wijnen in het pakket';
      end;
      if fper < 1 or fper > 24 then raise exception 'Vul bij elke wijn in het pakket een geldig aantal flessen in'; end if;
      if not exists (select 1 from public.drops x where x.id = fid and x.soort = 'wijn' and not x.verwijderd
                     and (x.id = v_groep or x.groep = v_groep)) then
        raise exception 'Een wijn in het pakket hoort niet bij deze drop';
      end if;
      if v_inhoud @> jsonb_build_array(jsonb_build_object('drop_id', fid)) then raise exception 'Een wijn staat twee keer in het pakket'; end if;
      v_inhoud := v_inhoud || jsonb_build_object('drop_id', fid, 'aantal', fper);
    end loop;
    if jsonb_array_length(v_inhoud) = 0 then raise exception 'Kies de wijnen in het pakket'; end if;
  end if;
  if v_prijs is null or v_prijs <= 0 or v_prijs > 100000 then raise exception 'Vul een geldige prijs in'; end if;
  if v_aantal is null or v_aantal < 0 or v_aantal > 100000 then raise exception 'Vul een geldig aantal flessen in'; end if;
  if v_max is not null and v_max < 1 then raise exception 'Vul een geldig maximum per klant in (leeg = geen maximum)'; end if;
  if v_maxlos is not null and (v_maxlos < 0 or v_maxlos > 100000) then raise exception 'Vul een geldig maximum los in (leeg = geen maximum)'; end if;
  if v_tot is not null and v_tot <= v_vanaf then raise exception 'De drop moet sluiten na het moment dat hij opengaat'; end if;
  if v_groep is not null and (v_groep = v_id or not exists (select 1 from public.drops where id = v_groep and groep is null and soort = 'wijn')) then
    raise exception 'Deze drop bestaat niet (meer)';
  end if;
  if nullif(g ->> 'foto', '') is not null and g ->> 'foto' !~ '^https://[A-Za-z0-9.-]+/' then raise exception 'Ongeldig adres van de foto'; end if;

  if v_id is null then
    insert into public.drops (product_id, prijs, aantal, soort) values (v_prod, v_prijs, v_aantal, v_soort) returning id into v_id;
  end if;
  update public.drops set
    soort = v_soort, product_id = v_prod, prijs = v_prijs, aantal = v_aantal, max_per_klant = v_max,
    los = v_soort = 'pakket' or coalesce((g ->> 'los')::boolean, true),
    max_los = case when v_soort = 'wijn' then v_maxlos end,
    naam = case when v_soort = 'pakket' then left(trim(g ->> 'naam'), 120) end,
    naam_en = case when v_soort = 'pakket' then nullif(left(trim(coalesce(g ->> 'naam_en', '')), 120), '') end,
    inhoud = v_inhoud,
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

-- ---------- Verwijderen (zoals 023): ook een wijn die alleen in een pakket is verkocht blijft bewaard ----------
create or replace function public.beheer_drop_verwijderen(drop_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if exists (select 1 from public.drop_bestellingen b, jsonb_array_elements(b.regels) r
             where b.status <> 'vervallen' and r ->> 'soort' = 'wijn'
               and ((r ->> 'drop_id')::bigint = beheer_drop_verwijderen.drop_id
                    or coalesce(r -> 'flessen', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('drop_id', beheer_drop_verwijderen.drop_id)))) then
    update public.drops set verwijderd = true, gestopt = true where id = beheer_drop_verwijderen.drop_id;
  else
    delete from public.drops where id = beheer_drop_verwijderen.drop_id;
  end if;
end $$;
revoke all on function public.beheer_drop_verwijderen(bigint) from public, anon;
grant execute on function public.beheer_drop_verwijderen(bigint) to authenticated;
