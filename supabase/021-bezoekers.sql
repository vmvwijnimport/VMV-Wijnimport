-- ------------------------------------------------------------------
--  021: bezoekers tellen, te zien in de backoffice (wens van de eigenaar, 2 nov 2026)
--  - Elke paginaweergave op de live site wordt één regel: de pagina, of het een binnenkomst
--    was (van buiten de site), de website waarvandaan (alleen de naam, bijv. google.com) en
--    mobiel of computer. Geen IP-adres, geen cookies, niets waarmee iemand te herkennen is.
--  - Alleen beheerders zien de cijfers, en alleen als totalen (beheer_bezoekers).
--  - Regels ouder dan 13 maanden worden vanzelf verwijderd.
--  Veilig: voegt alleen een tabel en functies toe.
-- ------------------------------------------------------------------

create table if not exists public.bezoeken (
  id          bigint generated always as identity primary key,
  op          timestamptz not null default now(),
  pad         text not null,
  binnenkomst boolean not null default false,   -- true = van buiten de site (telt als bezoek)
  herkomst    text,                             -- bijv. "google.com", "instagram.com"; leeg = direct
  apparaat    text check (apparaat in ('mobiel', 'computer'))
);
create index if not exists bezoeken_op on public.bezoeken (op);
alter table public.bezoeken enable row level security;   -- geen policies: alleen via de functies
revoke all on public.bezoeken from anon, authenticated;

-- ---------- De site telt een paginaweergave ----------
create or replace function public.bezoek_tellen(pad text, binnenkomst boolean default false, herkomst text default null, apparaat text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p text := left(coalesce(pad, ''), 200);
  h text := lower(left(nullif(trim(coalesce(herkomst, '')), ''), 100));
begin
  if p !~ '^/[A-Za-z0-9/_.%-]*$' then return; end if;            -- alleen nette paden van de site
  if p like '/horeca/beheer%' then return; end if;               -- de backoffice telt niet
  if h is not null and h !~ '^[a-z0-9.-]+$' then h := null; end if;
  insert into public.bezoeken (pad, binnenkomst, herkomst, apparaat)
  values (p, coalesce(binnenkomst, false), h, case when apparaat in ('mobiel', 'computer') then apparaat end);
end $$;
revoke all on function public.bezoek_tellen(text, boolean, text, text) from public;
grant execute on function public.bezoek_tellen(text, boolean, text, text) to anon, authenticated;

-- ---------- De cijfers voor de backoffice ----------
-- per: 'dag' of 'maand'. Data in Nederlandse tijd.
create or replace function public.beheer_bezoekers(van date, tot date, per text default 'dag')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  stap interval := case when per = 'maand' then interval '1 month' else interval '1 day' end;
  uit jsonb;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  delete from public.bezoeken where op < now() - interval '13 months';

  with b as (
    select *, (op at time zone 'Europe/Amsterdam')::date as dag
    from public.bezoeken
    where (op at time zone 'Europe/Amsterdam')::date between van and tot
  ),
  reeks as (
    select generate_series(case when per = 'maand' then date_trunc('month', van) else van end, tot, stap)::date as begin
  )
  select jsonb_build_object(
    'bezoeken',   (select count(*) from b where binnenkomst),
    'weergaven',  (select count(*) from b),
    'mobiel',     (select count(*) from b where binnenkomst and apparaat = 'mobiel'),
    'reeks', (select coalesce(jsonb_agg(jsonb_build_object(
                'begin', r.begin,
                'bezoeken', (select count(*) from b where b.binnenkomst and b.dag >= r.begin and b.dag < (r.begin + stap)::date),
                'weergaven', (select count(*) from b where b.dag >= r.begin and b.dag < (r.begin + stap)::date)
              ) order by r.begin), '[]') from reeks r),
    'paginas', (select coalesce(jsonb_agg(x order by x.weergaven desc), '[]') from (
                  select pad, count(*) as weergaven from b group by pad order by count(*) desc limit 15) x),
    'herkomst', (select coalesce(jsonb_agg(x order by x.bezoeken desc), '[]') from (
                  select coalesce(herkomst, 'direct') as herkomst, count(*) as bezoeken
                  from b where binnenkomst group by coalesce(herkomst, 'direct') order by count(*) desc limit 10) x)
  ) into uit;
  return uit;
end $$;
revoke all on function public.beheer_bezoekers(date, date, text) from public, anon;
grant execute on function public.beheer_bezoekers(date, date, text) to authenticated;
