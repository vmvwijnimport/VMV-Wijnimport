-- ------------------------------------------------------------------
--  016: nieuwsmail aan horecaklanten vanuit de backoffice (wens van de eigenaar, 26 okt 2026).
--  Je schrijft de mail in de backoffice, bekijkt een voorbeeld, stuurt eventueel een proef
--  naar info@ en verstuurt pas na twee keer klikken. Er gaat nooit iets vanzelf.
--  Het versturen doet de functie "bestelmail" (eerst opnieuw plakken).
--  Veilig: voegt een tabel, een kolom en een functie toe.
-- ------------------------------------------------------------------

-- Welke nieuwsmails zijn verstuurd, door wie en aan hoeveel klanten
create table if not exists public.nieuwsbrieven (
  id           bigint generated always as identity primary key,
  verstuurd_op timestamptz not null default now(),
  door         text not null default '',
  onderwerp    text not null,
  kop          text,
  tekst        text not null,
  knoptekst    text,
  knoplink     text,
  aantal       int not null default 0
);
alter table public.nieuwsbrieven enable row level security;
revoke all on public.nieuwsbrieven from anon, authenticated;
grant select on public.nieuwsbrieven to authenticated;
drop policy if exists "beheerder leest nieuwsbrieven" on public.nieuwsbrieven;
create policy "beheerder leest nieuwsbrieven" on public.nieuwsbrieven
  for select to authenticated using (public.is_beheerder());

-- Klanten die geen nieuwsmail willen
alter table public.klanten
  add column if not exists geen_nieuwsmail boolean not null default false;

create or replace function public.beheer_nieuwsmail(klant uuid, geen boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  update public.klanten set geen_nieuwsmail = coalesce(geen, false), gewijzigd_op = now() where id = klant;
  if not found then raise exception 'Deze klant bestaat niet (meer)'; end if;
end $$;
revoke all on function public.beheer_nieuwsmail(uuid, boolean) from public, anon;
grant execute on function public.beheer_nieuwsmail(uuid, boolean) to authenticated;
