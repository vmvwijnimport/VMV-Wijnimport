-- ------------------------------------------------------------------
--  022: wijn-drops voor particulieren (wens van de eigenaar, 11 nov 2026)
--  - Elke vrijdag een wijn via WhatsApp. In de backoffice (tabblad Drops) kies je de wijn,
--    de prijs (incl. btw), het aantal flessen, eventueel een maximum per klant, en vanaf
--    wanneer de drop open is. Elke drop krijgt een eigen link: /drop/?c=<code>. De pagina
--    staat niet in het menu en niet in Google.
--  - De wijn gaat in hetzelfde winkelmandje als de Hedonist-glazen. Afrekenen via Mollie
--    (alleen iDEAL), via de betaal-Worker (betalen/worker.js, /drop/betaling).
--  - Tijdens het betalen houden we de flessen 30 minuten vast. Is de betaling mislukt of
--    verlopen, dan komen ze vrij. Zo kunnen twee mensen nooit dezelfde laatste fles kopen.
--  - Bezorgkosten (incl. btw) staan alleen in de database, in te stellen in de backoffice.
--  - Betaalde bestellingen komen ook in de lijst onder Webwinkel (tabel uit 015).
--  - Foto's van de drops staan in Supabase Storage (bucket "drops", openbaar te lezen).
--  Veilig: voegt alleen nieuwe tabellen en functies toe. Vereist 008, 015 en 017.
-- ------------------------------------------------------------------

-- ---------- Bezorgkosten voor bestellingen met wijn ----------
create table if not exists public.drop_instellingen (
  id                     int primary key default 1 check (id = 1),
  verzendkosten          numeric(10, 2) check (verzendkosten >= 0),           -- verzenden in NL en bezorgen in Amsterdam
  gratis_vanaf           numeric(10, 2) check (gratis_vanaf >= 0),            -- gratis verzenden vanaf dit bedrag
  gratis_amsterdam_vanaf numeric(10, 2) check (gratis_amsterdam_vanaf >= 0)   -- gratis bezorgen in Amsterdam vanaf dit bedrag
);
insert into public.drop_instellingen (id) values (1) on conflict (id) do nothing;

-- ---------- De drops ----------
create table if not exists public.drops (
  id            bigint generated always as identity primary key,
  code          text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  product_id    bigint references public.producten (id) on delete set null,
  prijs         numeric(10, 2) not null check (prijs > 0),                -- per fles, incl. btw
  aantal        int not null check (aantal >= 0),                         -- zoveel flessen in totaal
  max_per_klant int check (max_per_klant > 0),                            -- leeg = geen maximum
  toon_aantal   boolean not null default true,                            -- "Nog 8 flessen" op de pagina
  open_vanaf    timestamptz not null default now(),
  open_tot      timestamptz,                                              -- leeg = tot uitverkocht
  gestopt       boolean not null default false,                           -- handmatig gesloten
  tekst         text,
  tekst_en      text,
  levering      text,                                                     -- bijv. "Volgende week in huis"
  levering_en   text,
  foto          text,                                                     -- adres van de foto (Storage)
  aangemaakt_op timestamptz not null default now()
);

-- ---------- Bestellingen met wijn (vóór en na het betalen) ----------
create table if not exists public.drop_bestellingen (
  id            bigint generated always as identity primary key,
  bestelnummer  text not null unique,
  mollie_id     text unique,
  aangemaakt_op timestamptz not null default now(),
  status        text not null default 'gereserveerd' check (status in ('gereserveerd', 'betaald', 'vervallen')),
  betaald_op    timestamptz,
  methode       text,
  naam          text not null default '',
  email         text not null default '',
  telefoon      text not null default '',
  bezorging     text not null default '',
  adres         text not null default '',
  opmerking     text,
  taal          text not null default 'nl' check (taal in ('nl', 'en')),
  -- [{"soort": "wijn", "drop_id", "code", "naam", "aantal", "prijs", "bedrag", "levering", "levering_en"}
  --  of {"soort": "glas", "naam", "aantal", "bedrag", "levering"}]
  regels        jsonb not null default '[]',
  subtotaal     numeric(10, 2),
  verzending    numeric(10, 2),
  totaal        numeric(10, 2),
  te_veel       boolean not null default false   -- betaald nadat de reservering was verlopen én de wijn op was
);
create index if not exists drop_bestellingen_email on public.drop_bestellingen (lower(email));

-- ---------- Beveiliging: alleen beheerders lezen; schrijven gaat via de functies hieronder ----------
alter table public.drop_instellingen enable row level security;
alter table public.drops             enable row level security;
alter table public.drop_bestellingen enable row level security;
revoke all on public.drop_instellingen, public.drops, public.drop_bestellingen from anon, authenticated;
grant select on public.drop_instellingen, public.drops, public.drop_bestellingen to authenticated;
drop policy if exists "beheerder leest" on public.drop_instellingen;
create policy "beheerder leest" on public.drop_instellingen for select to authenticated using (public.is_beheerder());
drop policy if exists "beheerder leest" on public.drops;
create policy "beheerder leest" on public.drops             for select to authenticated using (public.is_beheerder());
drop policy if exists "beheerder leest" on public.drop_bestellingen;
create policy "beheerder leest" on public.drop_bestellingen for select to authenticated using (public.is_beheerder());

-- Hoeveel flessen van een drop betaald zijn of nu worden betaald (reservering van maximaal 30 minuten)
create or replace function public.drop_bezet(drop_id bigint, email text default null)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum((r ->> 'aantal')::int), 0)::int
  from public.drop_bestellingen b, jsonb_array_elements(b.regels) r
  where r ->> 'soort' = 'wijn' and (r ->> 'drop_id')::bigint = drop_bezet.drop_id
    and (b.status = 'betaald' or (b.status = 'gereserveerd' and b.aangemaakt_op > now() - interval '30 minutes'))
    and (drop_bezet.email is null or lower(b.email) = lower(drop_bezet.email));
$$;
revoke all on function public.drop_bezet(bigint, text) from public, anon, authenticated;

-- De wijn bij een drop, zoals hij op de pagina, in het mandje en in de bestelling staat
create or replace function public.drop_wijnnaam(p public.producten)
returns text
language sql immutable as $$
  select p.producent || ', ' || p.naam || coalesce(' ' || nullif(p.jaargang::text, ''), '');
$$;

-- ---------- Het aanbod voor de droppagina en het mandje (openbaar, zonder horecaprijzen) ----------
-- status: onbekend (geen drop met deze code), binnenkort, open, vol (alles is nu gereserveerd),
-- uitverkocht of voorbij
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
    'bezorgkosten', jsonb_build_object(
      'verzendkosten', i.verzendkosten, 'gratis_vanaf', i.gratis_vanaf, 'gratis_amsterdam_vanaf', i.gratis_amsterdam_vanaf)
  );
end $$;
revoke all on function public.drop_aanbod(text) from public;
grant execute on function public.drop_aanbod(text) to anon, authenticated;

-- ---------- De Worker reserveert de flessen vóór het betalen ----------
-- gegevens: {"bestelnummer", "naam", "email", "telefoon", "bezorging" (verzenden | amsterdam | ophalen),
--            "adres", "opmerking", "taal", "wijnen": {"<code>": aantal},
--            "glazen": [{"naam", "aantal", "bedrag"}], "glas_levering"}
-- De glazen rekent de Worker uit (prijzen uit winkel.json); de wijn en de bezorgkosten rekenen we hier.
create or replace function public.drop_reserveren(gegevens jsonb, sleutel text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g        jsonb := gegevens;
  en       boolean := g ->> 'taal' = 'en';
  i        public.drop_instellingen;
  d        public.drops;
  p        public.producten;
  w        record;
  a        int;
  vrij     int;
  al       int;
  naam     text;
  regels   jsonb := '[]';
  wijn     numeric := 0;
  glazen   numeric := 0;
  bez      text := g ->> 'bezorging';
  verz     numeric := 0;
  sub      numeric;
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

  -- Op volgorde van code, zodat twee bestellingen elkaar nooit blokkeren
  for w in select key as code, value from jsonb_each(coalesce(g -> 'wijnen', '{}'::jsonb)) order by key loop
    begin
      a := (w.value #>> '{}')::int;
    exception when others then
      raise exception 'Ongeldig aantal';
    end;
    if a is null or a < 0 or a > 50 then raise exception 'Ongeldig aantal'; end if;
    if a = 0 then continue; end if;

    select * into d from public.drops where code = w.code for update;   -- wacht op een gelijktijdige bestelling
    if d.id is not null then select * into p from public.producten where id = d.product_id; end if;
    if d.id is null or p.id is null or d.gestopt or now() < d.open_vanaf or (d.open_tot is not null and now() > d.open_tot) then
      raise exception '%', case when en then 'One of the wines in your basket is no longer available' else 'Een van de wijnen in je mandje is niet meer te bestellen' end;
    end if;
    naam := public.drop_wijnnaam(p);
    vrij := greatest(d.aantal - public.drop_bezet(d.id), 0);
    if a > vrij then
      raise exception '%', case
        when vrij = 0 and en then naam || ' is sold out'
        when vrij = 0 then naam || ' is uitverkocht'
        when en then 'Only ' || vrij || ' left of ' || naam
        else 'Er zijn nog ' || vrij || ' flessen van ' || naam end;
    end if;
    if d.max_per_klant is not null then
      al := public.drop_bezet(d.id, g ->> 'email');
      if al + a > d.max_per_klant then
        raise exception '%', case
          when en then 'You can order up to ' || d.max_per_klant || ' bottles of ' || naam || case when al > 0 then ' (you already ordered ' || al || ')' else '' end
          else 'Je kunt maximaal ' || d.max_per_klant || ' flessen van ' || naam || ' bestellen' || case when al > 0 then ' (je hebt er al ' || al || ')' else '' end end;
      end if;
    end if;
    wijn := wijn + d.prijs * a;
    regels := regels || jsonb_build_object('soort', 'wijn', 'drop_id', d.id, 'code', d.code, 'naam', naam, 'aantal', a,
                                           'prijs', d.prijs, 'bedrag', d.prijs * a, 'levering', d.levering, 'levering_en', d.levering_en);
  end loop;
  if wijn = 0 then raise exception '%', case when en then 'Your basket is empty' else 'Je winkelmandje is leeg' end; end if;

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

-- ---------- Het Mollie-nummer bij de reservering zetten ----------
create or replace function public.drop_koppelen(bestelnummer text, mollie text, sleutel text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.koppelsleutels k where k.naam = 'hedonist' and k.sleutel = drop_koppelen.sleutel) then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  update public.drop_bestellingen b set mollie_id = left(mollie, 40)
  where b.bestelnummer = drop_koppelen.bestelnummer and b.mollie_id is null;
end $$;
revoke all on function public.drop_koppelen(text, text, text) from public;
grant execute on function public.drop_koppelen(text, text, text) to anon;

-- ---------- Betaling mislukt, afgebroken of verlopen: de flessen komen vrij ----------
create or replace function public.drop_vervallen(bestelnummer text, sleutel text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.koppelsleutels k where k.naam = 'hedonist' and k.sleutel = drop_vervallen.sleutel) then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  update public.drop_bestellingen b set status = 'vervallen'
  where b.bestelnummer = drop_vervallen.bestelnummer and b.status = 'gereserveerd';
end $$;
revoke all on function public.drop_vervallen(text, text) from public;
grant execute on function public.drop_vervallen(text, text) to anon;

-- ---------- Betaald: vastleggen, in de Webwinkel-lijst zetten en de bestelling teruggeven voor de mails ----------
create or replace function public.drop_betaald(bestelnummer text, mollie text, methode text, sleutel text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.drop_bestellingen;
  r jsonb;
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
      select * into d from public.drops where id = (r ->> 'drop_id')::bigint;
      if d.id is not null and public.drop_bezet(d.id) > d.aantal then teveel := true; end if;
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

-- ---------- Backoffice ----------
-- drop: {"id" (leeg = nieuw), "product_id", "prijs", "aantal", "max_per_klant", "toon_aantal", "open_vanaf", "open_tot",
--        "gestopt", "tekst", "tekst_en", "levering", "levering_en", "foto"}
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
  exception when others then
    raise exception 'Vul een geldige prijs, aantallen en datums in';
  end;
  if v_prod is null or not exists (select 1 from public.producten where id = v_prod) then raise exception 'Kies een wijn'; end if;
  if v_prijs is null or v_prijs <= 0 or v_prijs > 100000 then raise exception 'Vul een geldige prijs in'; end if;
  if v_aantal is null or v_aantal < 0 or v_aantal > 100000 then raise exception 'Vul een geldig aantal flessen in'; end if;
  if v_max is not null and v_max < 1 then raise exception 'Vul een geldig maximum per klant in (leeg = geen maximum)'; end if;
  if v_tot is not null and v_tot <= v_vanaf then raise exception 'De drop moet sluiten na het moment dat hij opengaat'; end if;
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
    foto = nullif(left(trim(coalesce(g ->> 'foto', '')), 500), '')
  where id = v_id;
  if not found then raise exception 'Deze drop bestaat niet (meer)'; end if;
  return v_id;
end $$;
revoke all on function public.beheer_drop(jsonb) from public, anon;
grant execute on function public.beheer_drop(jsonb) to authenticated;

-- Een drop verwijderen kan alleen zolang er niets op besteld is; anders zet je hem op gestopt
create or replace function public.beheer_drop_verwijderen(drop_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if exists (select 1 from public.drop_bestellingen b, jsonb_array_elements(b.regels) r
             where b.status <> 'vervallen' and r ->> 'soort' = 'wijn' and (r ->> 'drop_id')::bigint = beheer_drop_verwijderen.drop_id) then
    raise exception 'Op deze drop is al besteld. Zet hem op gestopt in plaats van hem te verwijderen.';
  end if;
  delete from public.drops where id = beheer_drop_verwijderen.drop_id;
end $$;
revoke all on function public.beheer_drop_verwijderen(bigint) from public, anon;
grant execute on function public.beheer_drop_verwijderen(bigint) to authenticated;

-- inst: {"verzendkosten", "gratis_vanaf", "gratis_amsterdam_vanaf"}
create or replace function public.beheer_drop_instellingen(inst jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_k numeric; v_g numeric; v_a numeric;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  begin
    v_k := round((inst ->> 'verzendkosten')::numeric, 2);
    v_g := round((inst ->> 'gratis_vanaf')::numeric, 2);
    v_a := round((inst ->> 'gratis_amsterdam_vanaf')::numeric, 2);
  exception when others then
    raise exception 'Vul geldige bedragen in';
  end;
  if v_k is null or v_g is null or v_a is null or v_k < 0 or v_g < 0 or v_a < 0 then raise exception 'Vul alle drie de bedragen in'; end if;
  update public.drop_instellingen set verzendkosten = v_k, gratis_vanaf = v_g, gratis_amsterdam_vanaf = v_a where id = 1;
end $$;
revoke all on function public.beheer_drop_instellingen(jsonb) from public, anon;
grant execute on function public.beheer_drop_instellingen(jsonb) to authenticated;

-- ---------- Foto's (Supabase Storage): iedereen kan ze zien, alleen beheerders uploaden ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drops', 'drops', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "beheerder zet drop-foto" on storage.objects;
create policy "beheerder zet drop-foto" on storage.objects
  for insert to authenticated with check (bucket_id = 'drops' and public.is_beheerder());
drop policy if exists "beheerder wijzigt drop-foto" on storage.objects;
create policy "beheerder wijzigt drop-foto" on storage.objects
  for update to authenticated using (bucket_id = 'drops' and public.is_beheerder());
drop policy if exists "beheerder verwijdert drop-foto" on storage.objects;
create policy "beheerder verwijdert drop-foto" on storage.objects
  for delete to authenticated using (bucket_id = 'drops' and public.is_beheerder());
