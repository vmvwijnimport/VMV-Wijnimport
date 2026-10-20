-- ------------------------------------------------------------------
--  008: backoffice voor VMV op /horeca/beheer/ (wens van de eigenaar, 20 okt 2026)
--  - Beheerders: VMV-accounts die alle klanten en bestellingen zien.
--  - Bestellingen bevestigen (eventueel met andere aantallen), afkeuren
--    en op geleverd zetten; aanvragen goedkeuren of afwijzen.
--  - Een welkomstmail naar de klant zodra zijn account is goedgekeurd.
--  Alles gaat via functies die eerst controleren of je beheerder bent.
--  Een gewone klant kan er niets mee. Veilig: er wordt niets verwijderd.
--
--  Iemand beheerder maken (na het uitvoeren van dit script):
--  1. Authentication → Users → Add user → Create new user, met e-mail en
--     wachtwoord, en "Auto Confirm User" aan.
--  2. SQL Editor:
--     insert into public.beheerders (id, naam)
--     select id, 'Stijn' from auth.users where email = 'jouw@adres.nl';
-- ------------------------------------------------------------------

-- ---------- Beheerders ----------
create table if not exists public.beheerders (
  id            uuid primary key references auth.users (id) on delete cascade,
  naam          text not null,
  aangemaakt_op timestamptz not null default now()
);
comment on table public.beheerders is 'VMV-accounts met toegang tot de backoffice (/horeca/beheer/).';
alter table public.beheerders enable row level security;
revoke all on public.beheerders from anon, authenticated;
grant select on public.beheerders to authenticated;

create or replace function public.is_beheerder() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.beheerders where id = auth.uid());
$$;
revoke all on function public.is_beheerder() from public, anon;
grant execute on function public.is_beheerder() to authenticated;

-- Je ziet alleen je eigen rij: zo weet de backoffice of je beheerder bent
create policy "beheerder leest eigen rij" on public.beheerders
  for select to authenticated using (id = auth.uid());

-- ---------- Beheerders mogen alles lezen ----------
create policy "beheerder leest klanten" on public.klanten
  for select to authenticated using (public.is_beheerder());
create policy "beheerder leest producten" on public.producten
  for select to authenticated using (public.is_beheerder());
create policy "beheerder leest instellingen" on public.instellingen
  for select to authenticated using (public.is_beheerder());
create policy "beheerder leest bestellingen" on public.bestellingen
  for select to authenticated using (public.is_beheerder());
create policy "beheerder leest bestelregels" on public.bestelregels
  for select to authenticated using (public.is_beheerder());

-- ---------- Bestelling bevestigen ----------
-- leveren: [{"id": <regel-id>, "leveren": 6}, ...]; leeg = alles zoals besteld.
-- De kortingen worden daarna opnieuw berekend (007) en de klant krijgt een mail (006).
create or replace function public.beheer_bevestig(bestelling bigint, leveren jsonb default '[]', bericht text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r   public.bestelregels;
  x   jsonb;
  n   int;
  som int := 0;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  perform 1 from public.bestellingen where id = bestelling and status = 'ontvangen' for update;
  if not found then raise exception 'Deze bestelling is al afgehandeld'; end if;

  for r in select * from public.bestelregels where bestelling_id = bestelling loop
    x := null;
    select e.value into x from jsonb_array_elements(coalesce(leveren, '[]')) e where (e.value ->> 'id')::bigint = r.id;
    n := coalesce((x ->> 'leveren')::int, r.aantal);
    if n < 0 or n > r.aantal then
      raise exception 'Vul bij elke wijn een aantal in tussen 0 en het bestelde aantal';
    end if;
    update public.bestelregels set toegewezen = n where id = r.id;
    som := som + n;
  end loop;
  if som = 0 then raise exception 'Je levert niets. Kies Afkeuren als de bestelling niet doorgaat'; end if;

  update public.bestellingen
  set status = 'bevestigd', bericht_klant = nullif(left(trim(bericht), 2000), '')
  where id = bestelling;
end $$;

-- ---------- Bestelling afkeuren ----------
create or replace function public.beheer_afkeur(bestelling bigint, bericht text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  update public.bestellingen
  set status = 'geannuleerd', bericht_klant = nullif(left(trim(bericht), 2000), '')
  where id = bestelling and status = 'ontvangen';
  if not found then raise exception 'Deze bestelling is al afgehandeld'; end if;
end $$;

-- ---------- Bestelling op geleverd zetten (geen mail) ----------
create or replace function public.beheer_geleverd(bestelling bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  update public.bestellingen set status = 'geleverd' where id = bestelling and status = 'bevestigd';
  if not found then raise exception 'Alleen een bevestigde bestelling kan op geleverd'; end if;
end $$;

-- ---------- Aanvraag goedkeuren of afwijzen, notitie opslaan ----------
create or replace function public.beheer_klant(klant uuid, status text default null, notitie text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if status is not null and status not in ('in_afwachting', 'goedgekeurd', 'afgewezen') then
    raise exception 'Onbekende status';
  end if;
  update public.klanten k
  set status       = coalesce(beheer_klant.status, k.status),
      notitie      = case when beheer_klant.notitie is null then k.notitie else nullif(left(trim(beheer_klant.notitie), 2000), '') end,
      gewijzigd_op = now()
  where k.id = klant;
  if not found then raise exception 'Deze klant bestaat niet meer'; end if;
end $$;

revoke all on function public.beheer_bevestig(bigint, jsonb, text) from public, anon;
revoke all on function public.beheer_afkeur(bigint, text) from public, anon;
revoke all on function public.beheer_geleverd(bigint) from public, anon;
revoke all on function public.beheer_klant(uuid, text, text) from public, anon;
grant execute on function public.beheer_bevestig(bigint, jsonb, text) to authenticated;
grant execute on function public.beheer_afkeur(bigint, text) to authenticated;
grant execute on function public.beheer_geleverd(bigint) to authenticated;
grant execute on function public.beheer_klant(uuid, text, text) to authenticated;

-- ---------- Welkomstmail na goedkeuring ----------
alter table public.klanten
  add column if not exists mail_welkom_op timestamptz;  -- wanneer de welkomstmail is verstuurd

create or replace function public.welkomstmail_versturen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'goedgekeurd' and old.status is distinct from 'goedgekeurd' and new.mail_welkom_op is null then
    -- Alleen het id; de functie leest de rest zelf uit de database en mailt maar één keer
    perform net.http_post(
      url  := 'https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail',
      body := jsonb_build_object('klant', new.id)
    );
  end if;
  return new;
end $$;

create or replace trigger welkomstmail
  after update of status on public.klanten
  for each row execute function public.welkomstmail_versturen();
