-- 010: mail aan VMV bij een nieuwe accountaanvraag, in de huisstijl.
--
-- Zodra iemand op /horeca/ een account aanvraagt, maakt de database een klant aan
-- (schema.sql, status in_afwachting). Deze trigger vraagt de functie "bestelmail" dan om
-- een mail "Nieuwe aanvraag" aan VMV te sturen, met de gegevens en een knop naar de backoffice.
-- Vervangt de mail van FormSubmit. Eerst de functie bestelmail opnieuw plakken, dan dit script uitvoeren.

alter table public.klanten
  add column if not exists mail_aanvraag_op timestamptz;  -- wanneer de aanvraagmail aan VMV is verstuurd

-- Bestaande klanten krijgen geen aanvraagmail meer
update public.klanten set mail_aanvraag_op = now() where mail_aanvraag_op is null;

create or replace function public.aanvraagmail_versturen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Alleen het id; de functie leest de rest zelf uit de database en mailt maar één keer
  perform net.http_post(
    url  := 'https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail',
    body := jsonb_build_object('klant', new.id, 'soort', 'aanvraag')
  );
  return new;
end $$;

create or replace trigger aanvraagmail
  after insert on public.klanten
  for each row execute function public.aanvraagmail_versturen();
