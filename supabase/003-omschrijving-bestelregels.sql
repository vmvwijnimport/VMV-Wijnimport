-- ==================================================================
--  Aanvulling 003: nettere omschrijving in bestellingen
--  (glazen zonder "Hedonist –" ervoor, formaat ook in de bevestiging).
--  Veilig: vervangt alleen de functie plaats_bestelling, gegevens blijven.
-- ==================================================================
-- regels: [{"product_id": 12, "aantal": 6}, ...]
create or replace function public.plaats_bestelling(regels jsonb, spoed boolean default false, opmerking text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inst        public.instellingen;
  p           public.producten;
  r           jsonb;
  aantal      int;
  glazen      int := 0;
  korting     numeric;
  stukprijs   numeric;
  totaal      numeric := 0;
  heeft_aanvraag boolean := false;
  nr          text;
  bestel_id   bigint;
  uitvoer     jsonb := '[]'::jsonb;
begin
  if not public.is_goedgekeurd() then
    raise exception 'Je account is nog niet goedgekeurd' using errcode = '42501';
  end if;
  if jsonb_typeof(regels) <> 'array' or jsonb_array_length(regels) = 0 then
    raise exception 'Je bestelmandje is leeg';
  end if;
  if jsonb_array_length(regels) > 200 then
    raise exception 'Te veel regels in één bestelling';
  end if;

  select * into inst from public.instellingen where id = 1;

  -- Eerst het totaal aantal glazen, voor de Hedonist-staffel (modellen gemengd)
  for r in select * from jsonb_array_elements(regels) loop
    select * into p from public.producten where id = (r ->> 'product_id')::bigint and actief;
    if found and p.soort = 'glas' then glazen := glazen + greatest((r ->> 'aantal')::int, 0); end if;
  end loop;

  nr := 'H-' || to_char(now() at time zone 'Europe/Amsterdam', 'YYMMDD') || '-' ||
        upper(substr(md5(random()::text), 1, 4));
  insert into public.bestellingen (bestelnummer, klant_id, spoed, opmerking, totaal_ex)
  values (nr, auth.uid(), coalesce(spoed, false), left(opmerking, 1000), 0)
  returning id into bestel_id;

  for r in select * from jsonb_array_elements(regels) loop
    aantal := (r ->> 'aantal')::int;
    if aantal is null or aantal < 1 or aantal > 1200 then
      raise exception 'Ongeldig aantal';
    end if;
    select * into p from public.producten where id = (r ->> 'product_id')::bigint and actief;
    if not found then raise exception 'Een product in je mandje is niet meer beschikbaar'; end if;
    if p.beschikbaarheid = 'uitverkocht' then
      raise exception '% is uitverkocht', p.naam;
    end if;
    if p.max_per_bestelling is not null and aantal > p.max_per_bestelling and not p.allocatie then
      raise exception 'Van % kun je maximaal % bestellen', p.naam, p.max_per_bestelling;
    end if;

    korting := 0;
    if p.soort = 'glas' then
      stukprijs := case when glazen >= inst.glas_staffel_vanaf then inst.glas_staffel_prijs_ex else p.prijs_ex end;
    else
      if not p.allocatie and aantal >= inst.schenk_vanaf then korting := inst.schenk_korting_pct; end if;
      stukprijs := round(p.prijs_ex * (1 - korting / 100), 2);
    end if;

    insert into public.bestelregels (bestelling_id, product_id, omschrijving, aantal, prijs_ex, korting_pct, regel_ex, allocatie)
    values (bestel_id, p.id,
            case when p.soort = 'glas' then p.naam else p.producent || ' – ' || p.naam end || coalesce(' ' || p.jaargang, '') ||
              case when p.formaat not in ('75 cl', 'per glas') then ' (' || p.formaat || ')' else '' end,
            aantal, stukprijs, korting, round(stukprijs * aantal, 2), p.allocatie);

    totaal := totaal + round(stukprijs * aantal, 2);
    heeft_aanvraag := heeft_aanvraag or p.allocatie;
    uitvoer := uitvoer || jsonb_build_object(
      'omschrijving', case when p.soort = 'glas' then p.naam else p.producent || ' – ' || p.naam end || coalesce(' ' || p.jaargang, '') ||
        case when p.formaat not in ('75 cl', 'per glas') then ' (' || p.formaat || ')' else '' end,
      'aantal', aantal, 'prijs_ex', stukprijs, 'korting_pct', korting,
      'regel_ex', round(stukprijs * aantal, 2), 'allocatie', p.allocatie);
  end loop;

  if inst.minimale_bestelling_ex is not null and totaal < inst.minimale_bestelling_ex then
    raise exception 'De minimale bestelling is € %', inst.minimale_bestelling_ex;
  end if;

  update public.bestellingen set totaal_ex = totaal, bevat_aanvraag = heeft_aanvraag where id = bestel_id;

  return jsonb_build_object('bestelnummer', nr, 'totaal_ex', totaal,
                            'bevat_aanvraag', heeft_aanvraag, 'regels', uitvoer);
end $$;

revoke all on function public.plaats_bestelling(jsonb, boolean, text) from public, anon;
grant execute on function public.plaats_bestelling(jsonb, boolean, text) to authenticated;
