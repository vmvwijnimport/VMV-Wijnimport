-- ------------------------------------------------------------------
--  005: bestelmails in huisstijl (via de Edge Function "bestelmail" en Resend)
--  - bij een nieuwe bestelling: een mail naar VMV (en later ook een overzicht naar de klant)
--  - wanneer VMV de status op "bevestigd" zet: een bevestiging voor de klant
--  Voer dit pas uit als de functie "bestelmail" in Supabase staat
--  (zie docs/bestelmails-instellen.md). Veilig: voegt alleen kolommen en een trigger toe.
-- ------------------------------------------------------------------

alter table public.bestellingen
  add column if not exists bericht_klant       text,         -- optioneel, komt in de bevestigingsmail
  add column if not exists mail_aanvraag_op    timestamptz,  -- wanneer de mail bij het bestellen is verstuurd
  add column if not exists mail_bevestiging_op timestamptz;  -- wanneer de bevestiging is verstuurd

comment on column public.bestellingen.bericht_klant is 'Bericht van VMV aan de klant, bijvoorbeeld de leverdag. Komt in de bevestigingsmail.';
comment on column public.bestelregels.toegewezen is 'Aantal dat VMV levert. Leeg = het bestelde aantal. Invullen vóór het bevestigen.';

-- Met pg_net kan de database een webadres aanroepen
create extension if not exists pg_net with schema extensions;

create or replace function public.bestelmail_versturen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or (new.status = 'bevestigd' and old.status is distinct from 'bevestigd') then
    -- Alleen het id; de functie leest de rest zelf uit de database
    perform net.http_post(
      url  := 'https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail',
      body := jsonb_build_object('id', new.id)
    );
  end if;
  return new;
end $$;

drop trigger if exists bestelmail on public.bestellingen;
create trigger bestelmail
  after insert or update of status on public.bestellingen
  for each row execute function public.bestelmail_versturen();
