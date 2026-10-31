-- ------------------------------------------------------------------
--  019: kerstpakketten voor particulieren (wens van de eigenaar, 31 okt 2026)
--  - In de backoffice (tabblad Kerst) stel je pakketten samen uit de wijnen in de database,
--    met per wijn een tekst voor het kaartje. Extra's (bijv. een ratafia) bestel je erbij.
--  - Prijzen (incl. btw), verzendkosten en bezorgkosten staan alleen hier, niet op GitHub.
--  - De pagina /kerst/ leest het aanbod via kerst_aanbod(); daarin staan geen horecaprijzen.
--  - Betalen gaat via de betaal-Worker (Mollie). Die zet de bestelling eerst op "onbetaald"
--    en na de betaling op "te leveren". Hij gebruikt dezelfde sleutel als Hedonist
--    (HEDONIST_SLEUTEL, zie 015), dus in Cloudflare hoeft niets nieuws.
--  Veilig: voegt alleen nieuwe tabellen en functies toe. Vereist 008, 012 en 015.
-- ------------------------------------------------------------------

-- ---------- Instellingen ----------
create table if not exists public.kerst_instellingen (
  id                 int primary key default 1 check (id = 1),
  open               boolean not null default false,       -- false = op /kerst/ staat "binnenkort"
  intro              text,                                  -- tekst bovenaan de pagina
  levering           text,                                  -- bijv. "vanaf 15 december"
  intro_en           text,                                  -- hetzelfde voor de Engelse pagina
  levering_en        text,                                  -- bijv. "from 15 December"
  verzenden          boolean not null default true,
  amsterdam          boolean not null default true,
  ophalen            boolean not null default true,
  verzendkosten      numeric(10, 2) not null default 0 check (verzendkosten >= 0),      -- per pakket
  bezorgen_amsterdam numeric(10, 2) not null default 0 check (bezorgen_amsterdam >= 0)  -- per bestelling
);
insert into public.kerst_instellingen (id) values (1) on conflict (id) do nothing;

-- ---------- Pakketten en wat erin zit ----------
create table if not exists public.kerst_pakketten (
  id           bigint generated always as identity primary key,
  naam         text not null,
  omschrijving text,
  omschrijving_en text,                                       -- voor de Engelse pagina
  prijs        numeric(10, 2) not null check (prijs >= 0),   -- incl. btw
  voorraad     int check (voorraad >= 0),                     -- leeg = geen maximum
  actief       boolean not null default false,
  volgorde     int not null default 0,
  kaart_kop    text,                                          -- kop op het kaartje (leeg = de naam)
  kaart_tekst  text                                           -- korte inleiding op het kaartje
);

create table if not exists public.kerst_pakket_wijnen (
  id          bigint generated always as identity primary key,
  pakket_id   bigint not null references public.kerst_pakketten (id) on delete cascade,
  product_id  bigint references public.producten (id) on delete set null,
  volgorde    int not null default 0,
  kaart_tekst text,      -- over de wijn, voor het kaartje
  past_bij    text       -- bijv. "oesters, gevogelte"
);

create table if not exists public.kerst_extras (
  id           bigint generated always as identity primary key,
  naam         text not null,
  omschrijving text,
  omschrijving_en text,
  prijs        numeric(10, 2) not null check (prijs >= 0),   -- incl. btw
  product_id   bigint references public.producten (id) on delete set null,
  max_per_bestelling int check (max_per_bestelling > 0),
  actief       boolean not null default false,
  volgorde     int not null default 0,
  kaart_tekst  text,
  past_bij     text
);

-- ---------- Bestellingen ----------
create table if not exists public.kerst_bestellingen (
  id           bigint generated always as identity primary key,
  mollie_id    text not null unique,
  bestelnummer text not null,
  aangemaakt_op timestamptz not null default now(),
  betaald_op   timestamptz,
  methode      text,
  naam         text not null default '',
  email        text not null default '',
  telefoon     text not null default '',
  bezorging    text not null default '',
  adres        text not null default '',
  opmerking    text,
  boodschap    text,                              -- persoonlijke boodschap op het kaartje
  taal         text not null default 'nl' check (taal in ('nl', 'en')),   -- taal van de mail aan de klant
  bestelling   text not null default '',          -- bijv. "2 × Kerstpakket, 1 × Ratafia"
  regels       jsonb not null default '[]',       -- [{"soort": "pakket"|"extra", "id", "naam", "aantal", "prijs"}]
  bedrag       numeric(10, 2),
  verzending   numeric(10, 2),
  totaal       numeric(10, 2),
  status       text not null default 'onbetaald' check (status in ('onbetaald', 'te_leveren', 'geleverd')),
  geleverd_op  timestamptz
);

-- ---------- Beveiliging: alleen beheerders lezen; schrijven gaat via de functies hieronder ----------
alter table public.kerst_instellingen  enable row level security;
alter table public.kerst_pakketten     enable row level security;
alter table public.kerst_pakket_wijnen enable row level security;
alter table public.kerst_extras        enable row level security;
alter table public.kerst_bestellingen  enable row level security;
revoke all on public.kerst_instellingen, public.kerst_pakketten, public.kerst_pakket_wijnen,
              public.kerst_extras, public.kerst_bestellingen from anon, authenticated;
grant select on public.kerst_instellingen, public.kerst_pakketten, public.kerst_pakket_wijnen,
                public.kerst_extras, public.kerst_bestellingen to authenticated;
drop policy if exists "beheerder leest" on public.kerst_instellingen;
create policy "beheerder leest" on public.kerst_instellingen  for select to authenticated using (public.is_beheerder());
drop policy if exists "beheerder leest" on public.kerst_pakketten;
create policy "beheerder leest" on public.kerst_pakketten     for select to authenticated using (public.is_beheerder());
drop policy if exists "beheerder leest" on public.kerst_pakket_wijnen;
create policy "beheerder leest" on public.kerst_pakket_wijnen for select to authenticated using (public.is_beheerder());
drop policy if exists "beheerder leest" on public.kerst_extras;
create policy "beheerder leest" on public.kerst_extras        for select to authenticated using (public.is_beheerder());
drop policy if exists "beheerder leest" on public.kerst_bestellingen;
create policy "beheerder leest" on public.kerst_bestellingen  for select to authenticated using (public.is_beheerder());

-- Hoeveel van een pakket of extra al betaald is
create or replace function public.kerst_verkocht(soort text, item bigint)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum((r ->> 'aantal')::int), 0)::int
  from public.kerst_bestellingen b, jsonb_array_elements(b.regels) r
  where b.status <> 'onbetaald' and r ->> 'soort' = kerst_verkocht.soort and (r ->> 'id')::bigint = item;
$$;
revoke all on function public.kerst_verkocht(text, bigint) from public, anon, authenticated;

-- ---------- Het aanbod voor /kerst/ en de betaal-Worker (openbaar, zonder horecaprijzen) ----------
create or replace function public.kerst_aanbod()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i public.kerst_instellingen;
begin
  select * into i from public.kerst_instellingen where id = 1;
  if i is null or not i.open then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'intro', i.intro,
    'levering', i.levering,
    'intro_en', i.intro_en,
    'levering_en', i.levering_en,
    'bezorging', jsonb_build_object('verzenden', i.verzenden, 'amsterdam', i.amsterdam, 'ophalen', i.ophalen),
    'verzendkosten', i.verzendkosten,
    'bezorgenAmsterdam', i.bezorgen_amsterdam,
    'pakketten', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'naam', p.naam, 'omschrijving', p.omschrijving, 'omschrijving_en', p.omschrijving_en, 'prijs', p.prijs,
        'beschikbaar', case when p.voorraad is null then null
                            else greatest(p.voorraad - public.kerst_verkocht('pakket', p.id), 0) end,
        'wijnen', coalesce((
          select jsonb_agg(jsonb_build_object(
            'producent', w.producent, 'slug', w.producent_slug, 'naam', w.naam, 'druif', w.druif,
            'jaargang', w.jaargang, 'kleur', w.kleur, 'formaat', w.formaat
          ) order by pw.volgorde, pw.id)
          from public.kerst_pakket_wijnen pw join public.producten w on w.id = pw.product_id
          where pw.pakket_id = p.id), '[]'::jsonb)
      ) order by p.volgorde, p.id)
      from public.kerst_pakketten p where p.actief), '[]'::jsonb),
    'extras', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'naam', e.naam, 'omschrijving', e.omschrijving, 'omschrijving_en', e.omschrijving_en, 'prijs', e.prijs,
        'max', e.max_per_bestelling, 'slug', w.producent_slug, 'kleur', w.kleur
      ) order by e.volgorde, e.id)
      from public.kerst_extras e left join public.producten w on w.id = e.product_id
      where e.actief), '[]'::jsonb)
  );
end $$;
revoke all on function public.kerst_aanbod() from public;
grant execute on function public.kerst_aanbod() to anon, authenticated;

-- ---------- De Worker legt een bestelling vast vóór het betalen ... ----------
create or replace function public.kerst_vastleggen(gegevens jsonb, sleutel text)
returns void
language plpgsql security definer set search_path = public as $$
declare g jsonb := gegevens;
begin
  if not exists (select 1 from public.koppelsleutels k where k.naam = 'hedonist' and k.sleutel = kerst_vastleggen.sleutel) then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  insert into public.kerst_bestellingen (mollie_id, bestelnummer, naam, email, telefoon, bezorging, adres,
                                         opmerking, boodschap, bestelling, regels, bedrag, verzending, totaal, taal)
  values (left(g ->> 'mollie_id', 40), left(coalesce(g ->> 'bestelnummer', ''), 40),
          left(coalesce(g ->> 'naam', ''), 200), left(coalesce(g ->> 'email', ''), 200), left(coalesce(g ->> 'telefoon', ''), 40),
          left(coalesce(g ->> 'bezorging', ''), 100), left(coalesce(g ->> 'adres', ''), 300),
          left(g ->> 'opmerking', 500), left(g ->> 'boodschap', 500), left(coalesce(g ->> 'bestelling', ''), 500),
          coalesce(g -> 'regels', '[]'::jsonb),
          nullif(g ->> 'bedrag', '')::numeric, nullif(g ->> 'verzending', '')::numeric, nullif(g ->> 'totaal', '')::numeric,
          case when g ->> 'taal' = 'en' then 'en' else 'nl' end)
  on conflict (mollie_id) do nothing;
end $$;
revoke all on function public.kerst_vastleggen(jsonb, text) from public;
grant execute on function public.kerst_vastleggen(jsonb, text) to anon;

-- ---------- ... en zet hem na de betaling op "te leveren". Geeft de bestelling terug voor de mails ----------
create or replace function public.kerst_betaald(mollie text, methode text, sleutel text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.kerst_bestellingen;
begin
  if not exists (select 1 from public.koppelsleutels k where k.naam = 'hedonist' and k.sleutel = kerst_betaald.sleutel) then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  update public.kerst_bestellingen set status = 'te_leveren', betaald_op = now(), methode = left(kerst_betaald.methode, 40)
  where mollie_id = mollie and status = 'onbetaald';
  select * into b from public.kerst_bestellingen where mollie_id = mollie;
  if b is null then return null; end if;
  return to_jsonb(b);
end $$;
revoke all on function public.kerst_betaald(text, text, text) from public;
grant execute on function public.kerst_betaald(text, text, text) to anon;

-- ---------- Backoffice ----------
-- pakket: {"id" (leeg = nieuw), "naam", "omschrijving", "omschrijving_en", "prijs", "voorraad", "actief", "volgorde",
--          "kaart_kop", "kaart_tekst", "wijnen": [{"product_id", "kaart_tekst", "past_bij"}]}
create or replace function public.beheer_kerst_pakket(pakket jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  p       jsonb := pakket;
  v_id    bigint := nullif(p ->> 'id', '')::bigint;
  v_naam  text := left(trim(coalesce(p ->> 'naam', '')), 200);
  v_prijs numeric;
  v_voorraad int;
  w       jsonb;
  n       int := 0;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if v_naam = '' then raise exception 'Vul de naam van het pakket in'; end if;
  begin
    v_prijs := round((p ->> 'prijs')::numeric, 2);
    v_voorraad := nullif(p ->> 'voorraad', '')::int;
  exception when others then
    raise exception 'Vul een geldige prijs en voorraad in';
  end;
  if v_prijs is null or v_prijs < 0 or v_prijs > 100000 then raise exception 'Vul een geldige prijs in'; end if;
  if v_voorraad is not null and v_voorraad < 0 then raise exception 'Vul een geldige voorraad in (leeg = geen maximum)'; end if;

  if v_id is null then
    insert into public.kerst_pakketten (naam, prijs) values (v_naam, v_prijs) returning id into v_id;
  end if;
  update public.kerst_pakketten set
    naam = v_naam, prijs = v_prijs, voorraad = v_voorraad,
    omschrijving = nullif(left(trim(coalesce(p ->> 'omschrijving', '')), 1000), ''),
    omschrijving_en = nullif(left(trim(coalesce(p ->> 'omschrijving_en', '')), 1000), ''),
    actief = coalesce((p ->> 'actief')::boolean, false),
    volgorde = coalesce(nullif(p ->> 'volgorde', '')::int, 0),
    kaart_kop = nullif(left(trim(coalesce(p ->> 'kaart_kop', '')), 200), ''),
    kaart_tekst = nullif(left(trim(coalesce(p ->> 'kaart_tekst', '')), 1000), '')
  where id = v_id;
  if not found then raise exception 'Dit pakket bestaat niet (meer)'; end if;

  delete from public.kerst_pakket_wijnen where pakket_id = v_id;
  for w in select * from jsonb_array_elements(coalesce(p -> 'wijnen', '[]'::jsonb)) loop
    if nullif(w ->> 'product_id', '') is null then continue; end if;
    n := n + 1;
    insert into public.kerst_pakket_wijnen (pakket_id, product_id, volgorde, kaart_tekst, past_bij)
    values (v_id, (w ->> 'product_id')::bigint, n,
            nullif(left(trim(coalesce(w ->> 'kaart_tekst', '')), 1000), ''),
            nullif(left(trim(coalesce(w ->> 'past_bij', '')), 200), ''));
  end loop;
  return v_id;
end $$;
revoke all on function public.beheer_kerst_pakket(jsonb) from public, anon;
grant execute on function public.beheer_kerst_pakket(jsonb) to authenticated;

-- extra: {"id" (leeg = nieuw), "naam", "omschrijving", "omschrijving_en", "prijs", "product_id", "max_per_bestelling",
--         "actief", "volgorde", "kaart_tekst", "past_bij"}
create or replace function public.beheer_kerst_extra(extra jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  e      jsonb := extra;
  v_id   bigint := nullif(e ->> 'id', '')::bigint;
  v_naam text := left(trim(coalesce(e ->> 'naam', '')), 200);
  v_prijs numeric;
  v_max  int;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if v_naam = '' then raise exception 'Vul de naam van de extra in'; end if;
  begin
    v_prijs := round((e ->> 'prijs')::numeric, 2);
    v_max := nullif(e ->> 'max_per_bestelling', '')::int;
  exception when others then
    raise exception 'Vul een geldige prijs en een geldig maximum in';
  end;
  if v_prijs is null or v_prijs < 0 or v_prijs > 100000 then raise exception 'Vul een geldige prijs in'; end if;
  if v_max is not null and v_max < 1 then raise exception 'Vul een geldig maximum in (leeg = geen maximum)'; end if;

  if v_id is null then
    insert into public.kerst_extras (naam, prijs) values (v_naam, v_prijs) returning id into v_id;
  end if;
  update public.kerst_extras set
    naam = v_naam, prijs = v_prijs, max_per_bestelling = v_max,
    omschrijving = nullif(left(trim(coalesce(e ->> 'omschrijving', '')), 1000), ''),
    omschrijving_en = nullif(left(trim(coalesce(e ->> 'omschrijving_en', '')), 1000), ''),
    product_id = nullif(e ->> 'product_id', '')::bigint,
    actief = coalesce((e ->> 'actief')::boolean, false),
    volgorde = coalesce(nullif(e ->> 'volgorde', '')::int, 0),
    kaart_tekst = nullif(left(trim(coalesce(e ->> 'kaart_tekst', '')), 1000), ''),
    past_bij = nullif(left(trim(coalesce(e ->> 'past_bij', '')), 200), '')
  where id = v_id;
  if not found then raise exception 'Deze extra bestaat niet (meer)'; end if;
  return v_id;
end $$;
revoke all on function public.beheer_kerst_extra(jsonb) from public, anon;
grant execute on function public.beheer_kerst_extra(jsonb) to authenticated;

-- Een pakket of extra verwijderen. Bestellingen blijven bewaard (de naam staat in de bestelling).
create or replace function public.beheer_kerst_verwijderen(soort text, item bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if soort = 'pakket' then delete from public.kerst_pakketten where id = item;
  elsif soort = 'extra' then delete from public.kerst_extras where id = item;
  else raise exception 'Onbekende soort'; end if;
end $$;
revoke all on function public.beheer_kerst_verwijderen(text, bigint) from public, anon;
grant execute on function public.beheer_kerst_verwijderen(text, bigint) to authenticated;

-- inst: {"open", "intro", "levering", "intro_en", "levering_en", "verzenden", "amsterdam", "ophalen", "verzendkosten", "bezorgen_amsterdam"}
create or replace function public.beheer_kerst_instellingen(inst jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_verzend numeric; v_ams numeric;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  begin
    v_verzend := round(coalesce(nullif(inst ->> 'verzendkosten', ''), '0')::numeric, 2);
    v_ams := round(coalesce(nullif(inst ->> 'bezorgen_amsterdam', ''), '0')::numeric, 2);
  exception when others then
    raise exception 'Vul geldige bedragen in voor verzenden en bezorgen';
  end;
  if v_verzend < 0 or v_ams < 0 then raise exception 'Vul geldige bedragen in voor verzenden en bezorgen'; end if;
  if not (coalesce((inst ->> 'verzenden')::boolean, false) or coalesce((inst ->> 'amsterdam')::boolean, false)
          or coalesce((inst ->> 'ophalen')::boolean, false)) then
    raise exception 'Kies minstens één manier van leveren';
  end if;
  update public.kerst_instellingen set
    open = coalesce((inst ->> 'open')::boolean, false),
    intro = nullif(left(trim(coalesce(inst ->> 'intro', '')), 1000), ''),
    levering = nullif(left(trim(coalesce(inst ->> 'levering', '')), 200), ''),
    intro_en = nullif(left(trim(coalesce(inst ->> 'intro_en', '')), 1000), ''),
    levering_en = nullif(left(trim(coalesce(inst ->> 'levering_en', '')), 200), ''),
    verzenden = coalesce((inst ->> 'verzenden')::boolean, false),
    amsterdam = coalesce((inst ->> 'amsterdam')::boolean, false),
    ophalen = coalesce((inst ->> 'ophalen')::boolean, false),
    verzendkosten = v_verzend, bezorgen_amsterdam = v_ams
  where id = 1;
end $$;
revoke all on function public.beheer_kerst_instellingen(jsonb) from public, anon;
grant execute on function public.beheer_kerst_instellingen(jsonb) to authenticated;

-- Een bestelling op geleverd zetten (of terug); een onbetaalde bestelling kan niet
create or replace function public.beheer_kerst_bestelling(bestelling bigint, status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if status not in ('te_leveren', 'geleverd') then raise exception 'Onbekende status'; end if;
  update public.kerst_bestellingen b
  set status = beheer_kerst_bestelling.status,
      geleverd_op = case when beheer_kerst_bestelling.status = 'geleverd' then now() else null end
  where b.id = bestelling and b.status <> 'onbetaald';
  if not found then raise exception 'Deze bestelling bestaat niet (meer)'; end if;
end $$;
revoke all on function public.beheer_kerst_bestelling(bigint, text) from public, anon;
grant execute on function public.beheer_kerst_bestelling(bigint, text) to authenticated;
