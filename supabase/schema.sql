-- ==================================================================
--  VMV Wijnimport — horecaportaal: database en beveiliging
--
--  Eenmalig plakken in Supabase: SQL Editor → New query → Run.
--  Dit bestand bevat GEEN prijzen en GEEN geheimen; die staan alleen
--  in de database. Opnieuw uitvoeren is veilig (het script ruimt eerst op).
--
--  Beveiliging (Row Level Security):
--  - Bezoekers zonder inlog kunnen niets lezen.
--  - Een klant ziet alleen zijn eigen gegevens en bestellingen.
--  - Prijzen zijn alleen leesbaar voor goedgekeurde klanten.
--  - Een klant kan zijn eigen status niet aanpassen; goedkeuren gebeurt
--    in het Supabase-dashboard (Table Editor → klanten → status).
--  - Bestellen kan alleen via de functie plaats_bestelling, die de prijs
--    zelf uit de database berekent. Wat de browser stuurt aan bedragen
--    wordt genegeerd.
-- ==================================================================

-- ---------- Opruimen (voor herhaald uitvoeren) ----------
drop function if exists public.plaats_bestelling(jsonb, boolean, text) cascade;
drop function if exists public.is_goedgekeurd() cascade;
drop function if exists public.nieuwe_klant() cascade;
drop table if exists public.bestelregels cascade;
drop table if exists public.bestellingen cascade;
drop table if exists public.producten cascade;
drop table if exists public.instellingen cascade;
drop table if exists public.klanten cascade;

-- ---------- Klanten ----------
create table public.klanten (
  id              uuid primary key references auth.users (id) on delete cascade,
  bedrijfsnaam    text not null,
  contactpersoon  text not null,
  email           text not null,
  telefoon        text not null,
  kvk             text not null,
  btw             text not null,
  straat          text not null,
  postcode        text not null,
  plaats          text not null,
  type_zaak       text not null check (type_zaak in ('restaurant', 'bar', 'wijnbar', 'slijterij', 'overig')),
  status          text not null default 'in_afwachting'
                  check (status in ('in_afwachting', 'goedgekeurd', 'afgewezen')),
  notitie         text,                       -- alleen voor VMV, niet zichtbaar voor de klant
  aangemaakt_op   timestamptz not null default now(),
  gewijzigd_op    timestamptz not null default now()
);
comment on table public.klanten is 'Horecaklanten. Zet status op goedgekeurd om een klant toegang te geven.';

-- Bij een aanvraag (registratie) wordt automatisch een klant aangemaakt,
-- met status in_afwachting. De gegevens komen uit het aanvraagformulier.
create function public.nieuwe_klant() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := new.raw_user_meta_data;
begin
  if m ->> 'aanvraag' = 'horeca' then
    insert into public.klanten (id, bedrijfsnaam, contactpersoon, email, telefoon, kvk, btw, straat, postcode, plaats, type_zaak)
    values (new.id,
            left(coalesce(m ->> 'bedrijfsnaam', ''), 200),
            left(coalesce(m ->> 'contactpersoon', ''), 200),
            new.email,
            left(coalesce(m ->> 'telefoon', ''), 40),
            left(coalesce(m ->> 'kvk', ''), 20),
            left(coalesce(m ->> 'btw', ''), 20),
            left(coalesce(m ->> 'straat', ''), 200),
            left(coalesce(m ->> 'postcode', ''), 12),
            left(coalesce(m ->> 'plaats', ''), 100),
            coalesce(nullif(m ->> 'type_zaak', ''), 'overig'));
  end if;
  return new;
end $$;

create trigger bij_nieuwe_gebruiker
  after insert on auth.users
  for each row execute function public.nieuwe_klant();

-- Hulpfunctie: is de ingelogde gebruiker een goedgekeurde klant?
create function public.is_goedgekeurd() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.klanten where id = auth.uid() and status = 'goedgekeurd');
$$;

-- ---------- Producten (wijnen en Hedonist-glazen) ----------
create table public.producten (
  id               bigint generated always as identity primary key,
  soort            text not null default 'wijn' check (soort in ('wijn', 'glas')),
  producent        text not null,              -- bijv. 'Sacy Soeur & Frère'
  producent_slug   text,                       -- link naar /producenten/<slug>/
  regio            text,
  naam             text not null,              -- cuvée
  jaargang         int,
  formaat          text not null default '75 cl',
  kleur            text check (kleur in ('wit', 'rood', 'rose')),
  prijs_ex         numeric(10, 2) not null check (prijs_ex >= 0),   -- per fles, excl. btw
  beschikbaarheid  text not null default 'op_voorraad'
                   check (beschikbaarheid in ('op_voorraad', 'binnenkort', 'uitverkocht')),
  allocatie        boolean not null default false,
  max_per_bestelling int check (max_per_bestelling > 0),
  actief           boolean not null default true,  -- false = niet tonen
  volgorde         int not null default 0
);
comment on table public.producten is 'Horeca-assortiment met prijzen excl. btw. Alleen zichtbaar voor goedgekeurde klanten.';

-- ---------- Instellingen ----------
create table public.instellingen (
  id                     int primary key default 1 check (id = 1),
  schenk_vanaf           int not null default 24,          -- flessen van dezelfde wijn
  schenk_korting_pct     numeric(5, 2) not null default 5,
  glas_staffel_vanaf     int not null default 12,          -- glazen, modellen gemengd
  glas_staffel_prijs_ex  numeric(10, 2) not null default 0,     -- in te stellen in de database, niet hier
  minimale_bestelling_ex numeric(10, 2),                   -- leeg = geen minimum
  betaaltermijn_dagen    int not null default 14
);
insert into public.instellingen (id) values (1);

-- ---------- Bestellingen ----------
create table public.bestellingen (
  id             bigint generated always as identity primary key,
  bestelnummer   text not null unique,
  klant_id       uuid not null references public.klanten (id) on delete restrict,
  besteld_op     timestamptz not null default now(),
  status         text not null default 'ontvangen'
                 check (status in ('ontvangen', 'bevestigd', 'geleverd', 'geannuleerd')),
  spoed          boolean not null default false,
  opmerking      text,
  totaal_ex      numeric(10, 2) not null,
  bevat_aanvraag boolean not null default false   -- er zitten allocatiewijnen in
);

create table public.bestelregels (
  id             bigint generated always as identity primary key,
  bestelling_id  bigint not null references public.bestellingen (id) on delete cascade,
  product_id     bigint references public.producten (id) on delete set null,
  omschrijving   text not null,                  -- vastgelegd op het moment van bestellen
  aantal         int not null check (aantal > 0),
  prijs_ex       numeric(10, 2) not null,        -- per stuk, na korting
  korting_pct    numeric(5, 2) not null default 0,
  regel_ex       numeric(10, 2) not null,
  allocatie      boolean not null default false, -- aanvraag: VMV bevestigt het aantal
  toegewezen     int                              -- door VMV in te vullen
);

-- ---------- Beveiliging ----------
alter table public.klanten      enable row level security;
alter table public.producten    enable row level security;
alter table public.instellingen enable row level security;
alter table public.bestellingen enable row level security;
alter table public.bestelregels enable row level security;

-- Bezoekers zonder inlog krijgen nergens toegang toe
revoke all on public.klanten, public.producten, public.instellingen, public.bestellingen, public.bestelregels from anon;
-- Ingelogde gebruikers mogen alleen lezen; RLS bepaalt welke rijen
revoke all on public.klanten, public.producten, public.instellingen, public.bestellingen, public.bestelregels from authenticated;
grant select on public.klanten, public.producten, public.instellingen, public.bestellingen, public.bestelregels to authenticated;

create policy "klant leest eigen gegevens" on public.klanten
  for select to authenticated using (id = auth.uid());

create policy "goedgekeurde klant leest assortiment" on public.producten
  for select to authenticated using (public.is_goedgekeurd() and actief);

create policy "goedgekeurde klant leest instellingen" on public.instellingen
  for select to authenticated using (public.is_goedgekeurd());

create policy "klant leest eigen bestellingen" on public.bestellingen
  for select to authenticated using (klant_id = auth.uid() and public.is_goedgekeurd());

create policy "klant leest eigen bestelregels" on public.bestelregels
  for select to authenticated using (
    public.is_goedgekeurd() and exists (
      select 1 from public.bestellingen b where b.id = bestelling_id and b.klant_id = auth.uid()
    )
  );

-- ---------- Bestellen ----------
-- regels: [{"product_id": 12, "aantal": 6}, ...]
create function public.plaats_bestelling(regels jsonb, spoed boolean default false, opmerking text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inst        public.instellingen;
  p           public.producten;
  r           jsonb;
  aantal      int;
  glazen      int := 0;
  korting     numeric;
  stukprijs   numeric;
  totaal      numeric := 0;
  heeft_aanvraag boolean := false;
  nr          text;
  bestel_id   bigint;
  uitvoer     jsonb := '[]'::jsonb;
begin
  if not public.is_goedgekeurd() then
    raise exception 'Je account is nog niet goedgekeurd' using errcode = '42501';
  end if;
  if jsonb_typeof(regels) <> 'array' or jsonb_array_length(regels) = 0 then
    raise exception 'Je bestelmandje is leeg';
  end if;
  if jsonb_array_length(regels) > 200 then
    raise exception 'Te veel regels in één bestelling';
  end if;

  select * into inst from public.instellingen where id = 1;

  -- Eerst het totaal aantal glazen, voor de Hedonist-staffel (modellen gemengd)
  for r in select * from jsonb_array_elements(regels) loop
    select * into p from public.producten where id = (r ->> 'product_id')::bigint and actief;
    if found and p.soort = 'glas' then glazen := glazen + greatest((r ->> 'aantal')::int, 0); end if;
  end loop;

  nr := 'H-' || to_char(now() at time zone 'Europe/Amsterdam', 'YYMMDD') || '-' ||
        upper(substr(md5(random()::text), 1, 4));
  insert into public.bestellingen (bestelnummer, klant_id, spoed, opmerking, totaal_ex)
  values (nr, auth.uid(), coalesce(spoed, false), left(opmerking, 1000), 0)
  returning id into bestel_id;

  for r in select * from jsonb_array_elements(regels) loop
    aantal := (r ->> 'aantal')::int;
    if aantal is null or aantal < 1 or aantal > 1200 then
      raise exception 'Ongeldig aantal';
    end if;
    select * into p from public.producten where id = (r ->> 'product_id')::bigint and actief;
    if not found then raise exception 'Een product in je mandje is niet meer beschikbaar'; end if;
    if p.beschikbaarheid = 'uitverkocht' then
      raise exception '% is uitverkocht', p.naam;
    end if;
    if p.max_per_bestelling is not null and aantal > p.max_per_bestelling and not p.allocatie then
      raise exception 'Van % kun je maximaal % bestellen', p.naam, p.max_per_bestelling;
    end if;

    korting := 0;
    if p.soort = 'glas' then
      stukprijs := case when glazen >= inst.glas_staffel_vanaf then inst.glas_staffel_prijs_ex else p.prijs_ex end;
    else
      if not p.allocatie and aantal >= inst.schenk_vanaf then korting := inst.schenk_korting_pct; end if;
      stukprijs := round(p.prijs_ex * (1 - korting / 100), 2);
    end if;

    insert into public.bestelregels (bestelling_id, product_id, omschrijving, aantal, prijs_ex, korting_pct, regel_ex, allocatie)
    values (bestel_id, p.id,
            p.producent || ' – ' || p.naam || coalesce(' ' || p.jaargang, '') ||
              case when p.formaat <> '75 cl' then ' (' || p.formaat || ')' else '' end,
            aantal, stukprijs, korting, round(stukprijs * aantal, 2), p.allocatie);

    totaal := totaal + round(stukprijs * aantal, 2);
    heeft_aanvraag := heeft_aanvraag or p.allocatie;
    uitvoer := uitvoer || jsonb_build_object(
      'omschrijving', p.producent || ' – ' || p.naam || coalesce(' ' || p.jaargang, ''),
      'aantal', aantal, 'prijs_ex', stukprijs, 'korting_pct', korting,
      'regel_ex', round(stukprijs * aantal, 2), 'allocatie', p.allocatie);
  end loop;

  if inst.minimale_bestelling_ex is not null and totaal < inst.minimale_bestelling_ex then
    raise exception 'De minimale bestelling is € %', inst.minimale_bestelling_ex;
  end if;

  update public.bestellingen set totaal_ex = totaal, bevat_aanvraag = heeft_aanvraag where id = bestel_id;

  return jsonb_build_object('bestelnummer', nr, 'totaal_ex', totaal,
                            'bevat_aanvraag', heeft_aanvraag, 'regels', uitvoer);
end $$;

revoke all on function public.plaats_bestelling(jsonb, boolean, text) from public, anon;
grant execute on function public.plaats_bestelling(jsonb, boolean, text) to authenticated;
revoke all on function public.is_goedgekeurd() from public, anon;
grant execute on function public.is_goedgekeurd() to authenticated;
