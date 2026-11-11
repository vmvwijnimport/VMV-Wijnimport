-- ------------------------------------------------------------------
--  025: inloggen in de backoffice met een gebruikersnaam (wens van de eigenaar, 11 nov 2026).
--  Supabase logt in met een e-mailadres. Typ je in de backoffice een gebruikersnaam (zonder @),
--  dan zoekt beheer_inlogadres het e-mailadres van die beheerder op. Daarna gelden gewoon het
--  wachtwoord en de code uit de app. Een onbekende naam geeft niets terug.
--  De gebruikersnaam is de voornaam in kleine letters (Stijn → stijn); aan te passen met:
--    update public.beheerders set gebruikersnaam = 'nieuwenaam' where naam = 'Stijn';
--  Veilig: voegt alleen een kolom en een functie toe.
-- ------------------------------------------------------------------

alter table public.beheerders add column if not exists gebruikersnaam text unique;
update public.beheerders set gebruikersnaam = lower(split_part(trim(naam), ' ', 1)) where gebruikersnaam is null;

create or replace function public.beheer_inlogadres(gebruikersnaam text)
returns text
language sql stable security definer set search_path = public, auth as $$
  select u.email from public.beheerders b join auth.users u on u.id = b.id
  where b.gebruikersnaam = lower(trim(beheer_inlogadres.gebruikersnaam));
$$;
revoke all on function public.beheer_inlogadres(text) from public;
grant execute on function public.beheer_inlogadres(text) to anon, authenticated;
