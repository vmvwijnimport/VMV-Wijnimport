-- ------------------------------------------------------------------
--  024: herstel van "Op geleverd zetten" onder Webwinkel (gemeld door de eigenaar, 11 nov 2026).
--  In 015 stond "where h.id = bestelling"; de tabel heeft ook een kolom "bestelling", dus de
--  database wist niet welke bedoeld was en gaf een fout. Nu staat er welke het is.
--  Veilig: vervangt alleen de functie beheer_hedonist.
-- ------------------------------------------------------------------

create or replace function public.beheer_hedonist(bestelling bigint, status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_beheerder() then raise exception 'Geen toegang' using errcode = '42501'; end if;
  if beheer_hedonist.status not in ('te_leveren', 'geleverd') then raise exception 'Onbekende status'; end if;
  update public.hedonist_bestellingen h
  set status = beheer_hedonist.status,
      geleverd_op = case when beheer_hedonist.status = 'geleverd' then now() else null end
  where h.id = beheer_hedonist.bestelling;
  if not found then raise exception 'Deze bestelling bestaat niet (meer)'; end if;
end $$;
revoke all on function public.beheer_hedonist(bigint, text) from public, anon;
grant execute on function public.beheer_hedonist(bigint, text) to authenticated;
