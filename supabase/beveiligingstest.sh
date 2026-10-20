#!/bin/bash
# ------------------------------------------------------------------
#  Beveiligingstest horecaportaal
#  Probeert als bezoeker, als niet-goedgekeurde klant (C) en als klant B
#  bij gegevens te komen die niet van hen zijn. Elke regel moet GOED zijn.
#
#  Gebruik:  TEST_WACHTWOORD='...' bash supabase/beveiligingstest.sh
#  Testaccounts: info+test-a/b/c@vmvwijnimport.com (A en B goedgekeurd,
#  C in afwachting). Het wachtwoord staat niet in de repository.
# ------------------------------------------------------------------
cd "$(dirname "$0")/.." || exit 1
U=$(grep 'supabase_url:' _config.yml | awk '{print $2}')
K=$(grep 'supabase_key:' _config.yml | awk '{print $2}')
[ -z "$TEST_WACHTWOORD" ] && { echo "Zet eerst TEST_WACHTWOORD"; exit 1; }

goed=0; fout=0
check() {  # omschrijving, uitkomst, verwachting (regex)
  if echo "$2" | grep -Eq "$3"; then echo "GOED  $1"; goed=$((goed+1))
  else echo "FOUT  $1"; echo "      kreeg: $(echo "$2" | head -c 200)"; fout=$((fout+1)); fi
}
tok() {
  curl -s -X POST -H "apikey: $K" -H "Content-Type: application/json" "$U/auth/v1/token?grant_type=password" \
    -d "{\"email\":\"info+test-$1@vmvwijnimport.com\",\"password\":\"$TEST_WACHTWOORD\"}" |
    sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}
get()   { curl -s -H "apikey: $K" ${2:+-H "Authorization: Bearer $2"} "$U/rest/v1/$1"; }
rpc()   { curl -s -X POST -H "apikey: $K" ${3:+-H "Authorization: Bearer $3"} -H "Content-Type: application/json" -d "$2" "$U/rest/v1/rpc/$1"; }
wijzig(){ curl -s -X "$1" -H "apikey: $K" -H "Authorization: Bearer $3" -H "Content-Type: application/json" -H "Prefer: return=representation" ${4:+-d "$4"} "$U/rest/v1/$2"; }
GEWEIGERD='permission denied|42501|^\[\]$'

TA=$(tok a); TB=$(tok b); TC=$(tok c)
[ -z "$TA" ] || [ -z "$TB" ] || [ -z "$TC" ] && { echo "Inloggen met de testaccounts lukt niet"; exit 1; }
AID=$(get "klanten?select=id" "$TA" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
ABEST=$(get "bestellingen?select=bestelnummer&limit=1" "$TA" | sed -n 's/.*"bestelnummer":"\([^"]*\)".*/\1/p')
ABID=$(get "bestellingen?select=id&limit=1" "$TA" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
CID=$(get "klanten?select=id" "$TC" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

echo "== 0. Controle: wat wél mag, werkt (anders bewijzen de tests hieronder niets)"
check "A (goedgekeurd) ziet prijzen" "$(get 'producten?select=prijs_ex' "$TA")" '"prijs_ex":[0-9]'
check "A ziet eigen bestelling $ABEST" "$(get "bestellingen?select=bestelnummer&bestelnummer=eq.$ABEST" "$TA")" "$ABEST"
check "B (goedgekeurd) ziet prijzen" "$(get 'producten?select=prijs_ex' "$TB")" '"prijs_ex":[0-9]'

echo "== 1. Bezoeker zonder inlog"
for t in producten klanten instellingen bestellingen bestelregels; do
  check "bezoeker leest $t" "$(get "$t?select=*")" 'permission denied'
done
check "bezoeker bestelt" "$(rpc plaats_bestelling '{"regels":[{"product_id":2,"aantal":1}]}')" 'permission denied'

echo "== 2. Niet-goedgekeurde klant (C)"
check "C leest prijzen" "$(get 'producten?select=prijs_ex' "$TC")" '^\[\]$'
check "C leest instellingen" "$(get 'instellingen?select=*' "$TC")" '^\[\]$'
check "C ziet alleen eigen klantgegevens" "$(get 'klanten?select=email' "$TC")" '^\[\{"email":"info\+test-c@[^]]*\}\]$'
check "C bestelt" "$(rpc plaats_bestelling '{"regels":[{"product_id":2,"aantal":1}]}' "$TC")" 'nog niet goedgekeurd'
check "C keurt zichzelf goed" "$(wijzig PATCH 'klanten?email=eq.info%2Btest-c%40vmvwijnimport.com' "$TC" '{"status":"goedgekeurd"}')" "$GEWEIGERD"

echo "== 3. Klant B probeert gegevens van klant A"
check "B leest alle bestellingen" "$(get 'bestellingen?select=bestelnummer' "$TB" | grep -c "$ABEST")" '^0$'
check "B leest bestellingen op klant_id van A" "$(get "bestellingen?select=*&klant_id=eq.$AID" "$TB")" '^\[\]$'
check "B leest bestelling op bestelnummer van A" "$(get "bestellingen?select=*&bestelnummer=eq.$ABEST" "$TB")" '^\[\]$'
check "B leest bestelregels van A" "$(get "bestelregels?select=*,bestellingen!inner(klant_id)&bestellingen.klant_id=eq.$AID" "$TB")" '^\[\]$'
check "B leest klantgegevens van A" "$(get "klanten?select=*&id=eq.$AID" "$TB")" '^\[\]$'
check "B wijzigt bestelling van A" "$(wijzig PATCH "bestellingen?bestelnummer=eq.$ABEST" "$TB" '{"status":"geannuleerd"}')" "$GEWEIGERD"
check "B wist bestelling van A" "$(wijzig DELETE "bestellingen?bestelnummer=eq.$ABEST" "$TB")" "$GEWEIGERD"
check "B maakt bestelling aan op naam van A" "$(wijzig POST 'bestellingen' "$TB" "{\"bestelnummer\":\"NEP\",\"klant_id\":\"$AID\",\"totaal_ex\":1}")" "$GEWEIGERD"

echo "== 4. Goedgekeurde klant (A) mag niet meer dan nodig"
check "A wijzigt een prijs" "$(wijzig PATCH 'producten?id=eq.2' "$TA" '{"prijs_ex":1}')" "$GEWEIGERD"
check "A wijzigt instellingen" "$(wijzig PATCH 'instellingen?id=eq.1' "$TA" '{"schenk_korting_pct":99}')" "$GEWEIGERD"
check "A wijzigt eigen bestelling" "$(wijzig PATCH "bestellingen?bestelnummer=eq.$ABEST" "$TA" '{"totaal_ex":1}')" "$GEWEIGERD"
check "A leest verborgen producten" "$(get 'producten?select=producent&actief=eq.false' "$TA")" '^\[\]$'
check "A bestelt een verborgen product" "$(rpc plaats_bestelling '{"regels":[{"product_id":28,"aantal":1}]}' "$TA")" 'niet meer beschikbaar'
check "A bestelt een uitverkochte wijn" "$(rpc plaats_bestelling '{"regels":[{"product_id":4,"aantal":1}]}' "$TA")" 'uitverkocht'
check "A ziet alleen eigen klantgegevens" "$(get 'klanten?select=email' "$TA")" '^\[\{"email":"info\+test-a@[^]]*\}\]$'

echo "== 5. Backoffice (008): alleen voor beheerders"
GEEN='Geen toegang|42501|permission denied'
check "bezoeker keurt klant goed" "$(rpc beheer_klant "{\"klant\":\"$CID\",\"status\":\"goedgekeurd\"}")" "$GEEN"
check "C keurt zichzelf goed via de backoffice" "$(rpc beheer_klant "{\"klant\":\"$CID\",\"status\":\"goedgekeurd\"}" "$TC")" "$GEEN"
check "A bevestigt eigen bestelling" "$(rpc beheer_bevestig "{\"bestelling\":$ABID}" "$TA")" "$GEEN"
check "A keurt eigen bestelling af" "$(rpc beheer_afkeur "{\"bestelling\":$ABID}" "$TA")" "$GEEN"
check "A zet eigen bestelling op geleverd" "$(rpc beheer_geleverd "{\"bestelling\":$ABID}" "$TA")" "$GEEN"
check "A wordt zelf beheerder" "$(wijzig POST 'beheerders' "$TA" "{\"id\":\"$AID\",\"naam\":\"nep\"}")" "$GEWEIGERD"
check "A leest beheerders" "$(get 'beheerders?select=*' "$TA")" '^\[\]$'
check "B leest klantgegevens van C (alleen beheerders mogen dat)" "$(get "klanten?select=*&id=eq.$CID" "$TB")" '^\[\]$'
check "C is nog steeds niet goedgekeurd" "$(get 'klanten?select=status' "$TC")" 'in_afwachting'

echo
echo "Uitkomst: $goed goed, $fout fout"
[ "$fout" -eq 0 ]
