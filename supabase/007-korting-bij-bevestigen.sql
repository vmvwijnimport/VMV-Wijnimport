-- ------------------------------------------------------------------
--  007: kortingen opnieuw berekenen bij het bevestigen (keuze van de eigenaar, 20 okt 2026)
--  Levert VMV minder dan besteld, dan geldt de korting alleen nog als het
--  geleverde aantal er recht op geeft:
--  - schenkkorting alleen vanaf schenk_vanaf flessen van dezelfde wijn;
--  - de Hedonist-staffelprijs alleen vanaf glas_staffel_vanaf glazen in totaal.
--  Werkt bij elke bevestiging: via de knoppen in de mail én via Supabase zelf.
--  Veilig: voegt alleen een functie en een trigger toe.
-- ------------------------------------------------------------------

create or replace function public.bevestiging_herberekenen() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inst   public.instellingen;
  r      record;
  n      int;
  glazen int;
  stuk   numeric;
  pct    numeric;
  totaal numeric := 0;
begin
  if new.status is distinct from 'bevestigd' or old.status = 'bevestigd' then return new; end if;
  select * into inst from public.instellingen where id = 1;

  -- Totaal aantal glazen dat VMV levert (leeg toegewezen = het bestelde aantal)
  select coalesce(sum(coalesce(br.toegewezen, br.aantal)), 0) into glazen
  from public.bestelregels br join public.producten p on p.id = br.product_id
  where br.bestelling_id = new.id and p.soort = 'glas';

  for r in
    select br.*, p.soort, p.prijs_ex as productprijs
    from public.bestelregels br left join public.producten p on p.id = br.product_id
    where br.bestelling_id = new.id
  loop
    n := coalesce(r.toegewezen, r.aantal);
    stuk := r.prijs_ex;
    pct := r.korting_pct;

    if r.soort = 'glas' and r.productprijs is not null
       and r.prijs_ex = inst.glas_staffel_prijs_ex and glazen < inst.glas_staffel_vanaf then
      -- Staffelprijs vervalt: de gewone glasprijs
      stuk := r.productprijs;
    elsif r.korting_pct > 0 and n < inst.schenk_vanaf then
      -- Schenkkorting vervalt: terug naar de prijs zonder korting van het moment van bestellen
      stuk := case
        when r.productprijs is not null and round(r.productprijs * (1 - r.korting_pct / 100), 2) = r.prijs_ex then r.productprijs
        else round(r.prijs_ex / (1 - r.korting_pct / 100), 2)
      end;
      pct := 0;
    end if;

    update public.bestelregels
    set toegewezen = n, prijs_ex = stuk, korting_pct = pct, regel_ex = round(stuk * n, 2)
    where id = r.id;
    totaal := totaal + round(stuk * n, 2);
  end loop;

  new.totaal_ex := totaal;
  return new;
end $$;

create or replace trigger bevestiging_herberekenen
  before update of status on public.bestellingen
  for each row execute function public.bevestiging_herberekenen();
