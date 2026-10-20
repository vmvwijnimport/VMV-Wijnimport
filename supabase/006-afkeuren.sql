-- ------------------------------------------------------------------
--  006: ook een mail naar de klant als VMV een bestelling afkeurt
--  (status "geannuleerd"). Voegt één kolom toe en vervangt de functie
--  die de mails aanroept. Veilig: er worden geen gegevens verwijderd.
-- ------------------------------------------------------------------

alter table public.bestellingen
  add column if not exists mail_annulering_op timestamptz;  -- wanneer de afkeurmail is verstuurd

create or replace function public.bestelmail_versturen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or (new.status in ('bevestigd', 'geannuleerd') and old.status is distinct from new.status) then
    -- Alleen het id; de functie leest de rest zelf uit de database
    perform net.http_post(
      url  := 'https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail',
      body := jsonb_build_object('id', new.id)
    );
  end if;
  return new;
end $$;
