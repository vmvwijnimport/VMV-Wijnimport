-- ------------------------------------------------------------------
--  014: de backoffice alleen na inloggen in twee stappen (wens van de eigenaar, 26 okt 2026).
--  Een beheerder heeft voortaan wachtwoord én code uit een app op de telefoon nodig.
--  Met alleen een wachtwoord geeft de database géén toegang meer tot klanten, bestellingen,
--  wijnen en de beheerfuncties.
--
--  LET OP, volgorde: voer dit pas uit als je de app al hebt ingesteld in de backoffice
--  (inloggen → QR-code scannen → code invullen). Anders kom je er tijdelijk niet in.
--
--  Telefoon kwijt? Supabase → Authentication → Users → jouw account → bij "Multi-factor
--  authentication" de factor verwijderen. Daarna stel je bij het inloggen een nieuwe app in.
--  Terugdraaien: voer onderaan de regel "Terug naar alleen wachtwoord" uit
-- ------------------------------------------------------------------

create or replace function public.is_beheerder() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.beheerders where id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- Terug naar alleen wachtwoord (alleen in noodgevallen):
-- create or replace function public.is_beheerder() returns boolean
-- language sql stable security definer set search_path = public as $$
--   select exists (select 1 from public.beheerders where id = auth.uid());
-- $$;
