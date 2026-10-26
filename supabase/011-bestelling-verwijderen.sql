-- 011: een bestelling verwijderen vanuit de backoffice (bijvoorbeeld een testbestelling).
--
-- Alleen een beheerder kan dit. De regels van de bestelling gaan mee (on delete cascade);
-- de klant krijgt geen mail. Verwijderen kan niet ongedaan worden gemaakt.

create or replace function public.beheer_verwijder(bestelling bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  delete from public.bestellingen where id = bestelling;
  if not found then raise exception 'Deze bestelling bestaat niet (meer)'; end if;
end $$;

revoke all on function public.beheer_verwijder(bigint) from public, anon;
grant execute on function public.beheer_verwijder(bigint) to authenticated;
