-- ------------------------------------------------------------------
--  004: welke wijnen op allocatie staan (keuze van de eigenaar, 20 okt 2026)
--  Op allocatie: alles van Domaine Jules Brochet en Champagne Petit-Collino,
--  Hélène Charbaut behalve La Charbauterie, Thomas Perseval behalve Art'Terre.
--  Alle andere wijnen staan niet (meer) op allocatie.
--  Uitvoeren in Supabase → SQL Editor → Run. Mag vaker worden uitgevoerd.
-- ------------------------------------------------------------------

update producten
set allocatie = (
     producent in ('Domaine Jules Brochet', 'Champagne Petit-Collino')
  or (producent = 'Hélène Charbaut' and naam not ilike '%charbauterie%')
  or (producent = 'Thomas Perseval' and naam not ilike 'art%terre%')
)
where soort = 'wijn';

-- Controle: deze lijst moet alleen de wijnen hierboven tonen
select producent, naam, jaargang
from producten
where allocatie
order by volgorde;
