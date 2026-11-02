-- ------------------------------------------------------------------
--  020: wijnen vervangen bij het bevestigen, en een voorstel aan de klant
--  (wens van de eigenaar, 2 nov 2026)
--  - Bij "Bevestigen met wijziging" kan VMV een wijn (deels) vervangen door een andere wijn,
--    tegen de prijs van de vervangende wijn of tegen de prijs van de bestelde wijn.
--  - VMV kan de wijziging meteen bevestigen (al overlegd), of als voorstel naar de klant
--    sturen. De klant geeft in het portaal akkoord (dan is de bestelling bevestigd) of niet
--    (dan staat hij weer bij Nieuw, en VMV krijgt een mail).
--  - Een vervangende wijn wordt een extra regel in de bestelling, met een verwijzing naar de
--    regel die hij vervangt. Zo kloppen de factuur, het overzicht en de mails vanzelf.
--  Vervangt de functie beheer_bevestig (008) en bestelmail_versturen (006).
--  Veilig: voegt kolommen en functies toe; er worden geen gegevens verwijderd.
--  Daarna: de functie bestelmail opnieuw plakken (supabase/functions/bestelmail/index.ts).
-- ------------------------------------------------------------------

-- ---------- Nieuwe status "voorstel" en kolommen ----------
alter table public.bestellingen drop constraint if exists bestellingen_status_check;
alter table public.bestellingen add constraint bestellingen_status_check
  check (status in ('ontvangen', 'voorstel', 'bevestigd', 'geleverd', 'geannuleerd'));

alter table public.bestellingen
  add column if not exists voorstel         jsonb,         -- {"leveren": [...], "vervangen": [...], "wijzigingen": [...]}
  add column if not exists voorstel_op      timestamptz,
  add column if not exists voorstel_reactie text check (voorstel_reactie in ('akkoord', 'afgewezen')),
  add column if not exists mail_voorstel_op timestamptz,   -- mail met het voorstel aan de klant
  add column if not exists mail_reactie_op  timestamptz;   -- mail aan VMV met de reactie van de klant

alter table public.bestelregels
  add column if not exists vervangt bigint references public.bestelregels (id) on delete set null;
comment on column public.bestelregels.vervangt is 'Deze regel is een vervangende wijn voor de regel met dit id';

-- ---------- Een wijziging controleren en uitwerken ----------
-- leveren:   [{"id": <regel-id>, "leveren": 6}, ...]; leeg = alles zoals besteld
-- vervangen: [{"id": <regel-id>, "product_id": 12, "aantal": 6, "prijs": "eigen" | "zelfde"}, ...]
--            "eigen" = de horecaprijs van de vervangende wijn, "zelfde" = de prijs per stuk van de bestelde wijn.
-- Geeft de wijziging terug met de prijzen erbij, en een leesbare lijst van wat er verandert.
create or replace function public.wijziging_uitwerken(bestelling bigint, leveren jsonb, vervangen jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r      public.bestelregels;
  p      public.producten;
  x      jsonb;
  n      int;
  som    int := 0;
  lev    jsonb := '[]';
  verv   jsonb := '[]';
  wijz   jsonb := '[]';
  aantal int;
  prijs  numeric;
begin
  for r in select * from public.bestelregels where bestelling_id = bestelling and vervangt is null order by id loop
    x := null;
    select e.value into x from jsonb_array_elements(coalesce(leveren, '[]')) e where (e.value ->> 'id')::bigint = r.id;
    n := coalesce((x ->> 'leveren')::int, r.aantal);
    if n < 0 or n > r.aantal then
      raise exception 'Vul bij elke wijn een aantal in tussen 0 en het bestelde aantal';
    end if;
    lev := lev || jsonb_build_object('id', r.id, 'leveren', n);
    som := som + n;

    x := null;
    select e.value into x from jsonb_array_elements(coalesce(vervangen, '[]')) e
      where (e.value ->> 'id')::bigint = r.id and nullif(e.value ->> 'product_id', '') is not null;
    if x is not null then
      select * into p from public.producten where id = (x ->> 'product_id')::bigint;
      if p is null then raise exception 'Kies een bestaande wijn om mee te vervangen'; end if;
      if p.id = r.product_id then raise exception 'Kies een andere wijn dan de bestelde wijn om mee te vervangen'; end if;
      aantal := coalesce(nullif(x ->> 'aantal', '')::int, r.aantal - n);
      if aantal < 1 or aantal > 1000 then raise exception 'Vul bij de vervangende wijn een aantal in'; end if;
      prijs := case when x ->> 'prijs' = 'zelfde' then r.prijs_ex else p.prijs_ex end;
      verv := verv || jsonb_build_object(
        'id', r.id, 'product_id', p.id, 'aantal', aantal, 'prijs_ex', prijs,
        'omschrijving', case when p.soort = 'glas' then p.naam else p.producent || ' – ' || p.naam end || coalesce(' ' || p.jaargang, '') ||
          case when p.formaat not in ('75 cl', 'per glas') then ' (' || p.formaat || ')' else '' end);
      som := som + aantal;
      wijz := wijz || jsonb_build_object('omschrijving', r.omschrijving, 'besteld', r.aantal, 'leveren', n,
        'vervangen_door', verv -> -1 ->> 'omschrijving', 'vervangen_aantal', aantal, 'vervangen_prijs_ex', prijs);
    elsif n <> r.aantal then
      wijz := wijz || jsonb_build_object('omschrijving', r.omschrijving, 'besteld', r.aantal, 'leveren', n);
    end if;
  end loop;
  if som = 0 then raise exception 'Je levert niets. Kies Afkeuren als de bestelling niet doorgaat'; end if;
  return jsonb_build_object('leveren', lev, 'vervangen', verv, 'wijzigingen', wijz);
end $$;
revoke all on function public.wijziging_uitwerken(bigint, jsonb, jsonb) from public, anon, authenticated;

-- Een uitgewerkte wijziging toepassen en de bestelling bevestigen. De kortingen worden daarna
-- opnieuw berekend (007) en de klant krijgt de bevestiging (bestelmail).
create or replace function public.wijziging_toepassen(bestelling bigint, w jsonb, bericht text)
returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  -- Eerdere vervangende regels (van een afgewezen voorstel) weghalen
  delete from public.bestelregels where bestelling_id = bestelling and vervangt is not null;
  for x in select * from jsonb_array_elements(w -> 'leveren') loop
    update public.bestelregels set toegewezen = (x ->> 'leveren')::int
    where id = (x ->> 'id')::bigint and bestelling_id = bestelling;
  end loop;
  for x in select * from jsonb_array_elements(w -> 'vervangen') loop
    insert into public.bestelregels (bestelling_id, product_id, omschrijving, aantal, toegewezen, prijs_ex, korting_pct, regel_ex, allocatie, vervangt)
    values (bestelling, (x ->> 'product_id')::bigint, x ->> 'omschrijving', (x ->> 'aantal')::int, (x ->> 'aantal')::int,
            (x ->> 'prijs_ex')::numeric, 0, round((x ->> 'prijs_ex')::numeric * (x ->> 'aantal')::int, 2), false, (x ->> 'id')::bigint);
  end loop;
  update public.bestellingen
  set status = 'bevestigd', bericht_klant = coalesce(nullif(left(trim(bericht), 2000), ''), bericht_klant)
  where id = bestelling;
end $$;
revoke all on function public.wijziging_toepassen(bigint, jsonb, text) from public, anon, authenticated;

-- ---------- Bevestigen (VMV): meteen, of als voorstel aan de klant ----------
drop function if exists public.beheer_bevestig(bigint, jsonb, text);
create or replace function public.beheer_bevestig(bestelling bigint, leveren jsonb default '[]', bericht text default null,
                                                  vervangen jsonb default '[]', voorstel boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare w jsonb;
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  perform 1 from public.bestellingen where id = bestelling and status in ('ontvangen', 'voorstel') for update;
  if not found then raise exception 'Deze bestelling is al afgehandeld'; end if;
  w := public.wijziging_uitwerken(bestelling, leveren, vervangen);

  if voorstel then
    if jsonb_array_length(w -> 'wijzigingen') = 0 then
      raise exception 'Er is niets gewijzigd. Kies Bevestigen als je alles levert zoals besteld';
    end if;
    update public.bestellingen
    set status = 'voorstel', voorstel = w, voorstel_op = now(), voorstel_reactie = null,
        mail_voorstel_op = null, mail_reactie_op = null,
        bericht_klant = nullif(left(trim(bericht), 2000), '')
    where id = bestelling;
  else
    update public.bestellingen set bericht_klant = null where id = bestelling;
    perform public.wijziging_toepassen(bestelling, w, bericht);
  end if;
end $$;
revoke all on function public.beheer_bevestig(bigint, jsonb, text, jsonb, boolean) from public, anon;
grant execute on function public.beheer_bevestig(bigint, jsonb, text, jsonb, boolean) to authenticated;

-- Afkeuren kan ook als er een voorstel openstaat
create or replace function public.beheer_afkeur(bestelling bigint, bericht text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  update public.bestellingen
  set status = 'geannuleerd', bericht_klant = nullif(left(trim(bericht), 2000), '')
  where id = bestelling and status in ('ontvangen', 'voorstel');
  if not found then raise exception 'Deze bestelling is al afgehandeld'; end if;
end $$;

-- ---------- De klant reageert op een voorstel (in het portaal) ----------
create or replace function public.klant_voorstel(bestelling bigint, akkoord boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare b public.bestellingen;
begin
  select * into b from public.bestellingen
  where id = bestelling and klant_id = auth.uid() and status = 'voorstel' for update;
  if b is null then raise exception 'Dit voorstel is niet meer open'; end if;
  if akkoord then
    update public.bestellingen set voorstel_reactie = 'akkoord', mail_reactie_op = null where id = bestelling;
    perform public.wijziging_toepassen(bestelling, b.voorstel, null);
  else
    update public.bestellingen set status = 'ontvangen', voorstel_reactie = 'afgewezen', mail_reactie_op = null
    where id = bestelling;
  end if;
end $$;
revoke all on function public.klant_voorstel(bigint, boolean) from public, anon;
grant execute on function public.klant_voorstel(bigint, boolean) to authenticated;

-- ---------- Mails: ook bij een voorstel en bij de reactie van de klant ----------
create or replace function public.bestelmail_versturen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or (new.status in ('bevestigd', 'geannuleerd', 'voorstel') and old.status is distinct from new.status)
     or (old.status = 'voorstel' and new.status = 'ontvangen') then
    -- Alleen het id; de functie leest de rest zelf uit de database
    perform net.http_post(
      url  := 'https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail',
      body := jsonb_build_object('id', new.id)
    );
  end if;
  return new;
end $$;
