-- ------------------------------------------------------------------
--  015: Hedonist-bestellingen in de backoffice (wens van de eigenaar, 26 okt 2026).
--  Is een betaling bij Mollie binnen, dan zet de betaal-Worker (betalen/worker.js) de
--  bestelling in deze tabel. In de backoffice zie je ze onder "Hedonist" en zet je ze
--  op geleverd. Alleen beheerders kunnen ze lezen.
--
--  De Worker bewijst met een eigen sleutel dat hij het is. Die sleutel maakt de database
--  hieronder zelf aan; hij staat nergens anders. Na het uitvoeren zie je hem als uitkomst:
--  kopieer hem naar Cloudflare (vmv-betalen → Settings → Variables and Secrets) als
--  geheim met de naam HEDONIST_SLEUTEL. Later nog eens nodig? Voer de laatste regel opnieuw uit.
--  Veilig: voegt alleen nieuwe tabellen en functies toe.
-- ------------------------------------------------------------------

create table if not exists public.hedonist_bestellingen (
  id           bigint generated always as identity primary key,
  mollie_id    text not null unique,
  bestelnummer text not null,
  betaald_op   timestamptz not null default now(),
  methode      text,
  naam         text not null default '',
  email        text not null default '',
  telefoon     text not null default '',
  bezorging    text not null default '',
  adres        text not null default '',
  opmerking    text,
  bestelling   text not null default '',     -- bijv. "6 × HEDONIST Glas"
  glazen       numeric(10, 2),
  verzending   numeric(10, 2),
  totaal       numeric(10, 2),
  status       text not null default 'te_leveren' check (status in ('te_leveren', 'geleverd')),
  geleverd_op  timestamptz
);
comment on table public.hedonist_bestellingen is 'Betaalde Hedonist-bestellingen (via Mollie). Alleen zichtbaar voor beheerders.';
alter table public.hedonist_bestellingen enable row level security;
revoke all on public.hedonist_bestellingen from anon, authenticated;
grant select on public.hedonist_bestellingen to authenticated;
drop policy if exists "beheerder leest hedonist" on public.hedonist_bestellingen;
create policy "beheerder leest hedonist" on public.hedonist_bestellingen
  for select to authenticated using (public.is_beheerder());

-- ---------- Sleutel voor de koppeling met de betaal-Worker ----------
create table if not exists public.koppelsleutels (
  naam    text primary key,
  sleutel text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
);
alter table public.koppelsleutels enable row level security;   -- geen policies: niemand kan hem lezen via de site
revoke all on public.koppelsleutels from anon, authenticated;
insert into public.koppelsleutels (naam) values ('hedonist') on conflict (naam) do nothing;

-- ---------- De Worker slaat een betaalde bestelling op ----------
create or replace function public.hedonist_opslaan(gegevens jsonb, sleutel text)
returns void
language plpgsql security definer set search_path = public as $$
declare g jsonb := gegevens;
begin
  if not exists (select 1 from public.koppelsleutels k where k.naam = 'hedonist' and k.sleutel = hedonist_opslaan.sleutel) then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  insert into public.hedonist_bestellingen (mollie_id, bestelnummer, methode, naam, email, telefoon, bezorging, adres,
                                            opmerking, bestelling, glazen, verzending, totaal)
  values (left(g ->> 'mollie_id', 40), left(coalesce(g ->> 'bestelnummer', ''), 40), left(g ->> 'methode', 40),
          left(coalesce(g ->> 'naam', ''), 200), left(coalesce(g ->> 'email', ''), 200), left(coalesce(g ->> 'telefoon', ''), 40),
          left(coalesce(g ->> 'bezorging', ''), 100), left(coalesce(g ->> 'adres', ''), 300), left(g ->> 'opmerking', 500),
          left(coalesce(g ->> 'bestelling', ''), 500),
          nullif(g ->> 'glazen', '')::numeric, nullif(g ->> 'verzending', '')::numeric, nullif(g ->> 'totaal', '')::numeric)
  on conflict (mollie_id) do nothing;   -- Mollie meldt een betaling soms vaker
end $$;
revoke all on function public.hedonist_opslaan(jsonb, text) from public;
grant execute on function public.hedonist_opslaan(jsonb, text) to anon;

-- ---------- In de backoffice op geleverd (of terug) zetten ----------
create or replace function public.beheer_hedonist(bestelling bigint, status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if status not in ('te_leveren', 'geleverd') then raise exception 'Onbekende status'; end if;
  update public.hedonist_bestellingen h
  set status = beheer_hedonist.status,
      geleverd_op = case when beheer_hedonist.status = 'geleverd' then now() else null end
  where h.id = bestelling;
  if not found then raise exception 'Deze bestelling bestaat niet (meer)'; end if;
end $$;
revoke all on function public.beheer_hedonist(bigint, text) from public, anon;
grant execute on function public.beheer_hedonist(bigint, text) to authenticated;

-- De sleutel voor Cloudflare (HEDONIST_SLEUTEL):
select sleutel as "kopieer naar Cloudflare als HEDONIST_SLEUTEL" from public.koppelsleutels where naam = 'hedonist';
