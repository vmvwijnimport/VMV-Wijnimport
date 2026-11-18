// Factuurkoppeling met e-Boekhouden (Supabase Edge Function "factuur", supabase/018-eboekhouden.sql).
//
// Alleen een ingelogde beheerder (wachtwoord én code) kan deze functie gebruiken, vanuit de backoffice:
// 1. "gegevens":      de producten en factuursjablonen uit e-Boekhouden ophalen, voor het koppelscherm.
// 2. "koppelen":      per wijn of glas vastleggen welk product in e-Boekhouden erbij hoort, plus het
//                     factuursjabloon en of de factuur meteen in de boekhouding wordt verwerkt.
// 3. "voorbereiden":  een voorbeeld van de factuur voor een bevestigde bestelling. Er wordt niets gemaakt.
// 4. "maken":         de factuur echt maken in e-Boekhouden. Eén factuur per bestelling. De factuur wordt
//                     niet gemaild: dat doet VMV zelf vanuit e-Boekhouden, na controle.
// 5. "klanten":       klanten (relaties) in e-Boekhouden zoeken, voor een losse factuur.
// 6. "los_voorbereiden" en "los_maken": een losse factuur, los van het portaal: een klant uit e-Boekhouden
//                     (of een nieuwe), wijnen uit de prijslijst, en de horecaprijs (excl. btw) of de
//                     particuliere prijs (incl. btw). Ook hier eerst een voorbeeld en pas na een klik de factuur.
// 7. "webwinkel":      na een betaalde webwinkelbestelling (glazen en/of drops) automatisch de factuur
//                     maken, aangevraagd door de betaal-Worker (met de koppelsleutel) of opnieuw vanuit de backoffice.
// 8. "cijfers":        de omzet van dit jaar en deze maand en de openstaande facturen, voor het startscherm.
// 9. "kopers":         per cuvée van één producent welke klanten hem op een factuur hadden (alleen lezen).
// 10. "leveranciers", "inkoop_voorbereiden" en "inkoop_maken": een inkoopfactuur inboeken en de nieuwe wijnen
//                     als product aanmaken, met de inkoopprijs (supabase/027). Ook hier eerst een voorbeeld.
// Factuurregels verwijzen naar het product in e-Boekhouden (productId), zodat de voorraad daar meeloopt.
// Bedragen komen uit de bestelling zoals VMV hem heeft bevestigd (prijs per stuk na korting).
//
// Instellingen in Supabase → Edge Functions → Secrets (niets hiervan staat in de repository):
//   EBOEKHOUDEN_TOKEN  het API-token uit e-Boekhouden (Beheer → Inrichting → Koppelingen → e-Boekhouden API)
//   EBOEKHOUDEN_INBOX  het e-mailadres waarmee je documenten in e-Boekhouden zet (voor de pdf van inkoopfacturen);
//                      verstuurd met RESEND_API_KEY en AFZENDER, die al voor de functie bestelmail bestaan

const EB = "https://api.e-boekhouden.nl";
const BRON = "VMVportaal";   // naam van deze koppeling bij e-Boekhouden (max. 10 tekens)
const BTW = { HOOG_VERK_21: 21, LAAG_VERK_9: 9 };

const CORS = {
  "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info"
};
const antwoord = (data, status = 200) => Response.json(data, { status, headers: CORS });
const centen = (n) => Math.round(Number(n) * 100);
const schoon = (v, max) => String(v ?? "").trim().slice(0, max);
const vandaag = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

// Een fout die we zo aan de beheerder kunnen laten zien
class Melding extends Error {
  constructor(tekst, status = 400) { super(tekst); this.status = status; }
}

// Controleert het inlogbewijs uit de backoffice: geldig, ingelogd in twee stappen, en een beheerder
const beheerderUit = async (db, req) => {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data || !data.user) return null;
  let aal = "";
  try {
    const deel = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    aal = JSON.parse(atob(deel + "===".slice((deel.length + 3) % 4))).aal;
  } catch (_) { aal = ""; }
  if (aal !== "aal2") return null;
  const { data: be } = await db.from("beheerders").select("naam").eq("id", data.user.id).maybeSingle();
  return be ? { id: data.user.id, naam: be.naam } : null;
};

// ---------- e-Boekhouden ----------
const ebFout = async (r) => {
  let j = null;
  try { j = await r.json(); } catch (_) { j = null; }
  const tekst = j ? [j.title, Array.isArray(j.errors) ? j.errors.join("; ") : "", j.code ? `(${j.code})` : ""].filter(Boolean).join(" ") : "";
  return new Melding(`e-Boekhouden meldt: ${tekst || `fout ${r.status}`}`, 502);
};

const ebSessie = async () => {
  const sleutel = Deno.env.get("EBOEKHOUDEN_TOKEN");
  if (!sleutel) throw new Melding("De koppeling met e-Boekhouden is nog niet ingesteld: het API-token ontbreekt in Supabase.", 503);
  const r = await fetch(`${EB}/v1/session`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ accessToken: sleutel, source: BRON })
  });
  if (!r.ok) {
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      throw new Melding("e-Boekhouden accepteert het API-token niet. Maak in e-Boekhouden een nieuw token en zet het in Supabase.", 502);
    }
    throw await ebFout(r);
  }
  const { token } = await r.json();
  const vraag = async (methode, pad, body) => {
    const v = await fetch(`${EB}${pad}`, {
      method: methode,
      headers: { Authorization: token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (v.status === 404) return null;
    if (!v.ok) throw await ebFout(v);
    return v.status === 204 ? {} : await v.json();
  };
  vraag.sluit = () => fetch(`${EB}/v1/session`, { method: "DELETE", headers: { Authorization: token } }).catch(() => {});
  return vraag;
};

// Alle rijen van een lijst, 2000 per keer
const alles = async (vraag, pad) => {
  const rijen = [];
  for (let offset = 0; offset < 20000; offset += 2000) {
    const j = await vraag("GET", `${pad}${pad.includes("?") ? "&" : "?"}limit=2000&offset=${offset}`);
    const items = (j && j.items) || [];
    rijen.push(...items);
    if (items.length < 2000) break;
  }
  return rijen;
};

// ---------- 1. Producten en sjablonen voor het koppelscherm ----------
const gegevens = async (db, vraag) => {
  const [producten, sjablonen, { data: inst }] = await Promise.all([
    alles(vraag, "/v1/product"),
    alles(vraag, "/v1/invoicetemplate"),
    db.from("instellingen").select("*").maybeSingle()
  ]);
  return {
    producten: producten.map((p) => ({ id: p.id, code: p.code || "", omschrijving: p.description || "", actief: p.active !== false })),
    sjablonen: sjablonen.filter((s) => s.active !== false).map((s) => ({ id: s.id, naam: s.name || `Sjabloon ${s.id}` })),
    sjabloon: inst ? inst.eb_sjabloon_id : null,
    verwerken: inst ? inst.eb_verwerken !== false : true,
    webwinkel: inst ? { eb_glas_breed: inst.eb_glas_breed ?? null, eb_glas_white: inst.eb_glas_white ?? null, eb_bezorgkosten: inst.eb_bezorgkosten ?? null } : {}
  };
};

// ---------- 2. Koppelingen opslaan ----------
const koppelen = async (db, vraag, opdracht) => {
  const lijst = Array.isArray(opdracht.koppelingen) ? opdracht.koppelingen.slice(0, 1000) : [];
  const ebIds = new Set((await alles(vraag, "/v1/product")).map((p) => p.id));
  for (const k of lijst) {
    if (!Number.isInteger(k.id)) throw new Melding("Onbekende wijn in de lijst.");
    if (k.eb !== null && !(Number.isInteger(k.eb) && ebIds.has(k.eb))) {
      throw new Melding("Een gekozen product bestaat niet (meer) in e-Boekhouden. Laad de pagina opnieuw.");
    }
  }
  if (opdracht.sjabloon != null) {
    const sjablonen = await alles(vraag, "/v1/invoicetemplate");
    if (!sjablonen.some((s) => s.id === opdracht.sjabloon)) throw new Melding("Kies een bestaand factuursjabloon.");
  }
  for (const k of lijst) {
    const { error } = await db.from("producten").update({ eb_product_id: k.eb }).eq("id", k.id);
    if (error) throw error;
  }
  // Webwinkel (supabase/023): de producten voor de glazen en de bezorgkosten
  const ww = opdracht.webwinkel || {};
  for (const n of ["eb_glas_breed", "eb_glas_white", "eb_bezorgkosten"]) {
    if (ww[n] != null && !(Number.isInteger(ww[n]) && ebIds.has(ww[n]))) throw new Melding("Een gekozen product voor de webwinkel bestaat niet (meer) in e-Boekhouden.");
  }
  const { error } = await db.from("instellingen")
    .update({
      eb_sjabloon_id: Number.isInteger(opdracht.sjabloon) ? opdracht.sjabloon : null, eb_verwerken: opdracht.verwerken !== false,
      ...(opdracht.webwinkel ? { eb_glas_breed: ww.eb_glas_breed ?? null, eb_glas_white: ww.eb_glas_white ?? null, eb_bezorgkosten: ww.eb_bezorgkosten ?? null } : {})
    })
    .eq("id", 1);
  if (error) throw error;
  return { opgeslagen: lijst.length };
};

// ---------- 3. Een factuur opbouwen (voorbeeld, en de basis voor het maken) ----------
const relatieVan = (r) => ({
  id: r.id, code: r.code || "", naam: r.name || "", plaats: r.city || "",
  kvk: r.companyRegistrationNumber || "", email: r.emailAddress || ""
});

// Mogelijke relaties in e-Boekhouden: de gekoppelde, anders zoeken op naam en e-mailadres
const kandidaten = async (vraag, k) => {
  if (k.eb_relatie_id) {
    const r = await vraag("GET", `/v1/relation/${k.eb_relatie_id}`);
    if (r) return [{ ...relatieVan(r), gekoppeld: true }];
  }
  const ids = [];
  const zoek = async (q) => {
    const j = await vraag("GET", `/v1/relation?limit=10&${q}`);
    ((j && j.items) || []).forEach((x) => { if (!ids.includes(x.id)) ids.push(x.id); });
  };
  const naam = schoon(k.bedrijfsnaam, 100).replace(/[%?]/g, "");
  if (naam) await zoek(`name%5Blike%5D=${encodeURIComponent(`%${naam}%`)}`);
  if (k.email) await zoek(`email=${encodeURIComponent(k.email)}`);
  const lijst = [];
  for (const id of ids.slice(0, 6)) {
    const r = await vraag("GET", `/v1/relation/${id}`);
    if (r && !r.inactive) lijst.push(relatieVan(r));
  }
  const kvk = String(k.kvk || "").replace(/\D/g, "");
  lijst.sort((a, b) => Number(b.kvk.replace(/\D/g, "") === kvk) - Number(a.kvk.replace(/\D/g, "") === kvk));
  return lijst;
};

// Het volgende factuurnummer: het hoogste nummer dat nu in e-Boekhouden staat plus 1, met dezelfde
// letters en hetzelfde aantal cijfers (F000130 → F000131). Zo vult een verwijderde factuur het gat op,
// in plaats van dat e-Boekhouden een nummer overslaat. Geen bruikbare nummers: e-Boekhouden kiest zelf.
export const volgendOp = (nummers) => {
  const delen = nummers.map((n) => /^(.*?)(\d+)$/.exec(String(n || "").trim())).filter(Boolean)
    .map((m) => ({ voor: m[1], cijfers: m[2], getal: parseInt(m[2], 10) }));
  if (!delen.length) return null;
  // De letters die het meest voorkomen (de gewone reeks), daarbinnen het hoogste nummer
  const telling = {};
  delen.forEach((d) => { telling[d.voor] = (telling[d.voor] || 0) + 1; });
  const voor = Object.keys(telling).sort((a, b) => telling[b] - telling[a])[0];
  const hoogste = delen.filter((d) => d.voor === voor).sort((a, b) => b.getal - a.getal)[0];
  return voor + String(hoogste.getal + 1).padStart(hoogste.cijfers.length, "0");
};
const volgendNummer = async (vraag) => volgendOp((await alles(vraag, "/v1/invoice")).map((f) => f.invoiceNumber));

const opbouwen = async (db, vraag, id) => {
  const { data: b, error } = await db.from("bestellingen")
    .select("*, klanten(*), bestelregels(*, producten(id, soort, eb_product_id))").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!b) throw new Melding("Deze bestelling bestaat niet (meer).", 404);
  // Is de factuur in e-Boekhouden verwijderd, dan mag hij opnieuw worden gemaakt
  if (b.eb_factuur_id && !(await vraag("GET", `/v1/invoice/${b.eb_factuur_id}`))) {
    await db.from("bestellingen").update({ eb_factuur_id: null, eb_factuurnummer: null, eb_factuur_op: null }).eq("id", b.id);
    b.eb_factuur_id = null; b.eb_factuurnummer = null; b.eb_factuur_op = null;
  }
  if (b.eb_factuur_id || b.eb_factuur_op) {
    throw new Melding(b.eb_factuurnummer ? `Factuur ${b.eb_factuurnummer} staat nog in e-Boekhouden. Wil je hem opnieuw maken, verwijder hem daar dan eerst.` : "Voor deze bestelling is al een factuur gemaakt of wordt er nu een gemaakt.", 409);
  }
  if (b.status !== "bevestigd" && b.status !== "geleverd") throw new Melding("Maak pas een factuur als de bestelling is bevestigd.");
  const { data: inst } = await db.from("instellingen").select("*").maybeSingle();
  const k = b.klanten || {};
  const problemen = [];
  if (!inst || !inst.eb_sjabloon_id) problemen.push("Kies eerst een factuursjabloon onder Prijslijst → Koppelen met e-Boekhouden.");

  const regels = b.bestelregels.slice().sort((x, y) => x.id - y.id)
    .map((r) => ({ r, n: r.toegewezen != null ? r.toegewezen : r.aantal })).filter((x) => x.n > 0);
  if (!regels.length) problemen.push("Deze bestelling heeft geen regels om te factureren.");

  // De gegevens van elk gekoppeld product: grootboekrekening en btw-code
  const details = {};
  for (const { r } of regels) {
    const eb = r.producten && r.producten.eb_product_id;
    if (!eb) { problemen.push(`${r.omschrijving} is nog niet gekoppeld aan een product in e-Boekhouden.`); continue; }
    if (!(eb in details)) details[eb] = await vraag("GET", `/v1/product/${eb}`);
    const p = details[eb];
    if (!p) problemen.push(`Het product bij ${r.omschrijving} bestaat niet meer in e-Boekhouden. Koppel het opnieuw.`);
    else if (!p.ledgerId) problemen.push(`Het product bij ${r.omschrijving} heeft in e-Boekhouden geen grootboekrekening.`);
  }

  // Eenheid op de factuur: die van het product, anders "stuks"
  let stuks = null;
  if (Object.values(details).some((p) => p && !p.unitId)) {
    const eenheden = await alles(vraag, "/v1/unit");
    const e = eenheden.find((x) => /^stuks?$/i.test(String(x.plural || "").trim()) || /^stuk$/i.test(String(x.singular || "").trim()));
    stuks = e ? e.id : null;
    if (!stuks) problemen.push("In e-Boekhouden staat geen eenheid \"stuks\". Maak die aan onder Instellingen, of geef de artikelen een eenheid.");
  }

  const items = regels.map(({ r, n }) => {
    const eb = r.producten && r.producten.eb_product_id;
    const p = (eb && details[eb]) || {};
    const pct = Number(r.korting_pct);
    const btw = p.vat || "HOOG_VERK_21";
    // productId koppelt het artikel (en de voorraad). Met alleen code staat de code wel op de factuur,
    // maar is het artikel niet gekoppeld (getest 2 nov). Daarom allebei; volgens de API wordt code dan
    // genegeerd, en dan blijft de kolom Code leeg, maar de voorraad loopt mee.
    return {
      productId: eb || null,
      ...(p.code ? { code: schoon(p.code, 50) } : {}),
      description: schoon(r.omschrijving + (pct > 0 ? ` (incl. ${String(pct).replace(".", ",")}% schenkkorting)` : ""), 200),
      quantity: n,
      unitId: p.unitId || stuks,
      pricePerUnit: Number(r.prijs_ex),
      vatCode: btw,
      ledgerId: p.ledgerId || null,
      // alleen voor het voorbeeld in de backoffice
      _product: p.code ? `${p.code} ${p.description || ""}`.trim() : (p.description || ""),
      _btw: btw in BTW ? BTW[btw] : null
    };
  });
  const ex = items.reduce((s, i) => s + centen(i.pricePerUnit) * i.quantity, 0);
  const btw = items.reduce((s, i) => s + Math.round(centen(i.pricePerUnit) * i.quantity * (i._btw || 0) / 100), 0);

  const nummer = await volgendNummer(vraag);

  let sjabloon = null;
  if (inst && inst.eb_sjabloon_id) {
    const s = (await alles(vraag, "/v1/invoicetemplate")).find((x) => x.id === inst.eb_sjabloon_id);
    if (s) sjabloon = s.name || `Sjabloon ${s.id}`;
    else problemen.push("Het gekozen factuursjabloon bestaat niet meer in e-Boekhouden. Kies een ander.");
  }

  return {
    b, k, inst, items, problemen, nummer,
    voorbeeld: {
      bestelnummer: b.bestelnummer, datum: vandaag(), termijn: inst ? inst.betaaltermijn_dagen : 14, nummer,
      sjabloon, verwerken: inst ? inst.eb_verwerken !== false : true,
      regels: items.map((i) => ({ omschrijving: i.description, product: i._product, aantal: i.quantity, prijs: i.pricePerUnit, btw: i._btw })),
      totaal: { ex: ex / 100, btw: btw / 100, incl: (ex + btw) / 100 },
      relaties: await kandidaten(vraag, k),
      klant: { naam: k.bedrijfsnaam || "", kvk: k.kvk || "", plaats: k.plaats || "" },
      problemen
    }
  };
};

// ---------- 4. De factuur maken ----------
const nieuweRelatie = (k, termijn) => ({
  type: "B",
  name: schoon(k.bedrijfsnaam, 100), contact: schoon(k.contactpersoon, 50),
  address: schoon(k.straat, 100), postalCode: schoon(k.postcode, 10), city: schoon(k.plaats, 50),
  phoneNumber: schoon(k.telefoon, 25), emailAddress: schoon(k.email, 150), emailAddressInvoice: schoon(k.email, 150),
  vatNumber: schoon(k.btw, 20).replace(/\s/g, ""),
  ...(String(k.kvk || "").replace(/\D/g, "") ? { companyRegistrationNumber: String(k.kvk).replace(/\D/g, "").slice(0, 20) } : {}),
  termOfPayment: termijn
});

const maken = async (db, vraag, opdracht) => {
  const o = await opbouwen(db, vraag, opdracht.bestelling);
  if (o.problemen.length) throw new Melding(o.problemen[0]);
  const { b, k, inst } = o;
  const keuze = opdracht.relatie;
  if (keuze !== "nieuw" && !Number.isInteger(keuze)) throw new Melding("Kies bij welke klant in e-Boekhouden de factuur hoort.");
  if (Number.isInteger(keuze) && !(await vraag("GET", `/v1/relation/${keuze}`))) {
    throw new Melding("Deze klant bestaat niet (meer) in e-Boekhouden. Bereid de factuur opnieuw voor.");
  }

  // Claimen: zo kan er nooit twee keer een factuur voor dezelfde bestelling worden gemaakt
  const { data: claim } = await db.from("bestellingen").update({ eb_factuur_op: new Date().toISOString() })
    .eq("id", b.id).is("eb_factuur_op", null).is("eb_factuur_id", null).select("id");
  if (!claim || !claim.length) throw new Melding("Voor deze bestelling wordt al een factuur gemaakt. Laad de pagina opnieuw.", 409);

  let relatie = keuze;
  let factuur = null;
  try {
    if (keuze === "nieuw") {
      const nieuw = await vraag("POST", "/v1/relation", nieuweRelatie(k, inst.betaaltermijn_dagen));
      relatie = nieuw.id;
    }
    if (k.eb_relatie_id !== relatie) await db.from("klanten").update({ eb_relatie_id: relatie }).eq("id", k.id);

    let mutatie = null;
    if (inst.eb_verwerken !== false) {
      const deb = await alles(vraag, "/v1/ledger?category=DEB");
      mutatie = { description: `Factuur bestelling ${b.bestelnummer}`, ...(deb.length === 1 ? { ledgerId: deb[0].id } : {}) };
    }
    factuur = await vraag("POST", "/v1/invoice", {
      ...(o.nummer ? { invoiceNumber: o.nummer } : {}),
      relationId: relatie,
      date: vandaag(),
      termOfPayment: inst.betaaltermijn_dagen,
      inExVat: "EX",
      templateId: inst.eb_sjabloon_id,
      text: `Bestelling ${b.bestelnummer}`,
      items: o.items.map(({ _product, _btw, ...i }) => i),
      ...(mutatie ? { mutation: mutatie } : {})
    });
  } catch (e) {
    // Mislukt vóór de factuur er was: vrijgeven, zodat je het opnieuw kunt proberen
    if (!factuur) await db.from("bestellingen").update({ eb_factuur_op: null }).eq("id", b.id).is("eb_factuur_id", null);
    throw e;
  }
  await db.from("bestellingen").update({ eb_factuur_id: factuur.id, eb_factuurnummer: factuur.invoiceNumber || null }).eq("id", b.id);
  return { nummer: factuur.invoiceNumber || "", id: factuur.id };
};

// ---------- 5 en 6. Losse factuur (niet uit het portaal) ----------
const klantenZoeken = async (vraag, opdracht) => {
  const tekst = schoon(opdracht.zoek, 100).replace(/[%?]/g, "");
  if (tekst.length < 2) return { klanten: [] };
  const ids = [];
  const zoek = async (q) => {
    const j = await vraag("GET", `/v1/relation?limit=15&${q}`);
    ((j && j.items) || []).forEach((x) => { if (!ids.includes(x.id)) ids.push(x.id); });
  };
  await zoek(`name%5Blike%5D=${encodeURIComponent(`%${tekst}%`)}`);
  if (tekst.includes("@")) await zoek(`email=${encodeURIComponent(tekst)}`);
  const lijst = [];
  for (const id of ids.slice(0, 10)) {
    const r = await vraag("GET", `/v1/relation/${id}`);
    if (r && !r.inactive) lijst.push({ ...relatieVan(r), type: r.type || "B" });
  }
  return { klanten: lijst };
};

// regels: [{ product: <id in de prijslijst>, aantal, prijs (leeg = uit de prijslijst) }]
// soort: "horeca" (prijs excl. btw) of "particulier" (prijs incl. btw)
const losOpbouwen = async (db, vraag, opdracht) => {
  const soort = opdracht.soort === "particulier" ? "particulier" : "horeca";
  const problemen = [];
  const invoer = Array.isArray(opdracht.regels) ? opdracht.regels.slice(0, 100) : [];
  if (!invoer.length) problemen.push("Kies minstens één wijn.");
  const ids = invoer.map((r) => r.product).filter(Number.isInteger);
  const { data: producten, error } = ids.length
    ? await db.from("producten").select("id, soort, producent, naam, jaargang, formaat, prijs_ex, prijs_particulier, eb_product_id").in("id", ids)
    : { data: [], error: null };
  if (error) throw error;
  const { data: inst } = await db.from("instellingen").select("*").maybeSingle();
  if (!inst || !inst.eb_sjabloon_id) problemen.push("Kies eerst een factuursjabloon onder Prijslijst → Koppelen met e-Boekhouden.");

  const omschrijving = (p) => (p.soort === "glas" ? p.naam : `${p.producent} – ${p.naam}`) + (p.jaargang ? ` ${p.jaargang}` : "") +
    (p.formaat && p.formaat !== "75 cl" && p.formaat !== "per glas" ? ` (${p.formaat})` : "");
  const details = {};
  const regels = [];
  for (const r of invoer) {
    const p = (producten || []).find((x) => x.id === r.product);
    const aantal = Math.floor(Number(r.aantal));
    if (!p) { problemen.push("Een gekozen wijn bestaat niet (meer) in de prijslijst."); continue; }
    if (!Number.isFinite(aantal) || aantal < 1 || aantal > 10000) { problemen.push(`Vul bij ${omschrijving(p)} een aantal in.`); continue; }
    const eigen = r.prijs === "" || r.prijs == null ? null : Math.round(Number(r.prijs) * 100) / 100;
    if (eigen != null && !(Number.isFinite(eigen) && eigen >= 0 && eigen <= 100000)) { problemen.push(`Vul bij ${omschrijving(p)} een geldige prijs in.`); continue; }
    const lijstprijs = soort === "particulier" ? p.prijs_particulier : p.prijs_ex;
    const prijs = eigen != null ? eigen : lijstprijs != null ? Number(lijstprijs) : null;
    if (prijs == null) { problemen.push(`${omschrijving(p)} heeft geen ${soort === "particulier" ? "particuliere prijs" : "horecaprijs"}. Vul de prijs zelf in.`); continue; }
    const eb = p.eb_product_id;
    if (!eb) { problemen.push(`${omschrijving(p)} is nog niet gekoppeld aan een product in e-Boekhouden.`); continue; }
    if (!(eb in details)) details[eb] = await vraag("GET", `/v1/product/${eb}`);
    const d = details[eb];
    if (!d) { problemen.push(`Het product bij ${omschrijving(p)} bestaat niet meer in e-Boekhouden. Koppel het opnieuw.`); continue; }
    if (!d.ledgerId) { problemen.push(`Het product bij ${omschrijving(p)} heeft in e-Boekhouden geen grootboekrekening.`); continue; }
    regels.push({ p, d, aantal, prijs, eb });
  }

  let stuks = null;
  if (regels.some((r) => !r.d.unitId)) {
    const e = (await alles(vraag, "/v1/unit")).find((x) => /^stuks?$/i.test(String(x.plural || "").trim()) || /^stuk$/i.test(String(x.singular || "").trim()));
    stuks = e ? e.id : null;
    if (!stuks) problemen.push("In e-Boekhouden staat geen eenheid \"stuks\". Maak die aan, of geef de artikelen een eenheid.");
  }
  const items = regels.map(({ p, d, aantal, prijs, eb }) => {
    const btw = d.vat || "HOOG_VERK_21";
    return {
      productId: eb, ...(d.code ? { code: schoon(d.code, 50) } : {}),
      description: schoon(omschrijving(p), 200), quantity: aantal, unitId: d.unitId || stuks,
      pricePerUnit: prijs, vatCode: btw, ledgerId: d.ledgerId,
      _product: d.code ? `${d.code} ${d.description || ""}`.trim() : (d.description || ""), _btw: btw in BTW ? BTW[btw] : null
    };
  });
  // Totalen: bij de horecaprijs komt de btw erbij, bij de particuliere prijs zit hij erin
  let ex = 0, btw = 0, incl = 0;
  items.forEach((i) => {
    const bedrag = centen(i.pricePerUnit) * i.quantity, pct = i._btw || 0;
    if (soort === "particulier") { const b = Math.round(bedrag * pct / (100 + pct)); incl += bedrag; btw += b; ex += bedrag - b; }
    else { const b = Math.round(bedrag * pct / 100); ex += bedrag; btw += b; incl += bedrag + b; }
  });

  // De klant: een bestaande relatie, of een nieuwe
  let klant = null, nieuw = null;
  if (Number.isInteger(opdracht.relatie)) {
    const r = await vraag("GET", `/v1/relation/${opdracht.relatie}`);
    if (!r) problemen.push("Deze klant bestaat niet (meer) in e-Boekhouden. Zoek hem opnieuw.");
    else klant = relatieVan(r);
  } else if (opdracht.relatie === "nieuw") {
    const n = opdracht.nieuw || {};
    nieuw = {
      type: n.type === "P" ? "P" : "B",
      name: schoon(n.naam, 100), contact: schoon(n.contact, 50),
      address: schoon(n.adres, 100), postalCode: schoon(n.postcode, 10), city: schoon(n.plaats, 50),
      emailAddress: schoon(n.email, 150), emailAddressInvoice: schoon(n.email, 150),
      ...(n.type !== "P" && schoon(n.btw, 20) ? { vatNumber: schoon(n.btw, 20).replace(/\s/g, "").toUpperCase() } : {}),
      termOfPayment: inst ? inst.betaaltermijn_dagen : 14
    };
    if (!nieuw.name) problemen.push("Vul de naam van de nieuwe klant in.");
    klant = { id: null, naam: nieuw.name, plaats: nieuw.city, nieuw: true };
  } else problemen.push("Kies de klant.");

  return {
    inst, items, nieuw, soort, problemen,
    voorbeeld: {
      nummer: await volgendNummer(vraag), datum: vandaag(), termijn: inst ? inst.betaaltermijn_dagen : 14, soort, klant,
      verwerken: inst ? inst.eb_verwerken !== false : true,
      regels: items.map((i) => ({ omschrijving: i.description, product: i._product, aantal: i.quantity, prijs: i.pricePerUnit, btw: i._btw })),
      totaal: { ex: ex / 100, btw: btw / 100, incl: incl / 100 },
      problemen
    }
  };
};

const losMaken = async (db, vraag, opdracht) => {
  const o = await losOpbouwen(db, vraag, opdracht);
  if (o.problemen.length) throw new Melding(o.problemen[0]);
  let relatie = opdracht.relatie;
  if (o.nieuw) relatie = (await vraag("POST", "/v1/relation", o.nieuw)).id;
  let mutatie = null;
  if (o.inst.eb_verwerken !== false) {
    const deb = await alles(vraag, "/v1/ledger?category=DEB");
    mutatie = { description: `Factuur ${schoon(opdracht.tekst, 100) || o.voorbeeld.klant.naam}`, ...(deb.length === 1 ? { ledgerId: deb[0].id } : {}) };
  }
  const factuur = await vraag("POST", "/v1/invoice", {
    ...(o.voorbeeld.nummer ? { invoiceNumber: o.voorbeeld.nummer } : {}),
    relationId: relatie,
    date: vandaag(),
    termOfPayment: o.inst.betaaltermijn_dagen,
    inExVat: o.soort === "particulier" ? "IN" : "EX",
    templateId: o.inst.eb_sjabloon_id,
    text: schoon(opdracht.tekst, 500),
    items: o.items.map(({ _product, _btw, ...i }) => i),
    ...(mutatie ? { mutation: mutatie } : {})
  });
  return { nummer: factuur.invoiceNumber || "", id: factuur.id };
};

// ---------- 7. Webwinkel: automatisch een factuur na de betaling (supabase/023) ----------
// De betaal-Worker vraagt dit aan met de koppelsleutel; in de backoffice kan een beheerder het opnieuw
// proberen. Prijzen zijn incl. btw (particulier). De factuur wordt niet gemaild.

// "Teststraat 1, 1017 AB Amsterdam" → straat, postcode, plaats
export const adresDelen = (adres) => {
  const m = /^(.*?),\s*(\d{4}\s?[A-Za-z]{2})\s+(.*)$/.exec(String(adres || "").trim());
  return m ? { straat: m[1], postcode: m[2].toUpperCase(), plaats: m[3] } : { straat: String(adres || ""), postcode: "", plaats: "" };
};

// Is relatie r in e-Boekhouden dezelfde klant als de webwinkelbestelling h (met adres a)?
// Hetzelfde e-mailadres (ook in een veld met meer adressen, hoofdletters maken niet uit), of dezelfde
// naam met dezelfde postcode of hetzelfde telefoonnummer. Alleen de naam is niet genoeg.
const kaal = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const adressen = (v) => kaal(v).split(/[;,\s]+/).filter(Boolean);
const telnr = (v) => String(v ?? "").replace(/\D/g, "").replace(/^(31|0031)/, "0");
export const zelfdeKlant = (r, h, a) => {
  if (!r || r.inactive) return false;
  const mail = kaal(h.email);
  if (mail && [...adressen(r.emailAddress), ...adressen(r.emailAddressInvoice)].includes(mail)) return true;
  if (!kaal(h.naam) || kaal(r.name) !== kaal(h.naam)) return false;
  const pc = (v) => kaal(v).replace(/\s/g, "");
  if (pc(a.postcode) && pc(r.postalCode) === pc(a.postcode)) return true;
  const tel = telnr(h.telefoon);
  return tel.length >= 9 && [r.phoneNumber, r.mobilePhoneNumber].some((t) => telnr(t) === tel);
};

// Een bestaande relatie zoeken: eerst op e-mailadres, dan op naam. Geeft het id, of null.
const bestaandeKlant = async (vraag, h, a) => {
  const ids = [];
  const zoek = async (q) => {
    const j = await vraag("GET", `/v1/relation?limit=10&${q}`);
    ((j && j.items) || []).forEach((x) => { if (!ids.includes(x.id)) ids.push(x.id); });
  };
  const like = (v) => encodeURIComponent(`%${String(v).replace(/[%?]/g, "")}%`);
  const mail = kaal(h.email);
  if (mail) await zoek(`email%5Blike%5D=${like(mail)}`);
  const naam = schoon(h.naam, 100);
  if (naam) await zoek(`name%5Blike%5D=${like(naam)}`);
  for (const id of ids.slice(0, 12)) {
    const r = await vraag("GET", `/v1/relation/${id}`);
    if (zelfdeKlant(r, h, a)) return r.id;
  }
  return null;
};

// Een bedrag over een aantal stuks verdelen in hele centen: 6 glazen voor 185,00 → 2 × 30,84 en 4 × 30,83
export const verdeel = (bedrag, aantal) => {
  const c = centen(bedrag), per = Math.floor(c / aantal), rest = c - per * aantal;
  return [{ aantal: rest, prijs: (per + 1) / 100 }, { aantal: aantal - rest, prijs: per / 100 }].filter((x) => x.aantal > 0);
};

// De glasprijzen van de site (_data/winkel.yml): de prijs per glas en voor elke 6 van hetzelfde model
const glasprijzen = async () => {
  try {
    const r = await fetch("https://vmvwijnimport.com/winkel.json");
    const w = r.ok ? await r.json() : null;
    return w && w.prijsGlas > 0 && w.prijsZes > 0 ? w : null;
  } catch (e) { return null; }
};

// Glazen op de factuur (wens van de eigenaar, 14 nov 2026): alle glazen voor de prijs per glas, en per
// 6 stuks een regel "Korting 6 stuks" met een min-bedrag. Die kortingsregel heeft geen product, zodat
// de voorraad in e-Boekhouden niet verandert. Klopt het bedrag niet met de prijzen van nu (de prijzen
// zijn intussen veranderd), dan zoals eerst: het betaalde bedrag verdeeld over de glazen.
export const glasDelen = (r, eb, w) => {
  const zessen = Math.floor(r.aantal / 6);
  const korting = w ? centen(6 * w.prijsGlas) - centen(w.prijsZes) : 0;
  if (!w || !zessen || korting <= 0 || centen(r.aantal * w.prijsGlas) - zessen * korting !== centen(r.bedrag)) {
    return [{ eb, naam: r.naam, delen: verdeel(r.bedrag, r.aantal) }];
  }
  return [
    { eb, naam: r.naam, delen: [{ aantal: r.aantal, prijs: w.prijsGlas }] },
    { eb, naam: `Korting 6 stuks ${r.naam}`, korting: true, delen: [{ aantal: zessen, prijs: -korting / 100 }] }
  ];
};

const webwinkelOpbouwen = async (db, vraag, h) => {
  const problemen = [];
  let regels = h.regels;
  if (/^VMV-D/.test(h.bestelnummer)) {
    const { data: d } = await db.from("drop_bestellingen").select("regels").eq("bestelnummer", h.bestelnummer).maybeSingle();
    regels = d ? d.regels : null;
  }
  if (!Array.isArray(regels) || !regels.length) {
    throw new Melding("Van deze bestelling zijn de regels niet bewaard (een oudere bestelling). Maak de factuur onder Losse factuur.");
  }
  const { data: inst } = await db.from("instellingen").select("*").maybeSingle();
  if (!inst || !inst.eb_sjabloon_id) problemen.push("Kies eerst een factuursjabloon onder Prijslijst → Koppelen met e-Boekhouden.");

  // Wijn: via de drop naar de wijn in de prijslijst en het gekoppelde product
  const dropIds = regels.filter((r) => r.soort === "wijn").map((r) => Number(r.drop_id));
  const { data: drops } = dropIds.length
    ? await db.from("drops").select("id, product_id, producten(eb_product_id)").in("id", dropIds)
    : { data: [] };
  const winkel = regels.some((r) => r.soort === "glas") ? await glasprijzen() : null;
  const lijst = [];
  for (const r of regels) {
    let eb = null;
    if (r.soort === "wijn") {
      const d = (drops || []).find((x) => x.id === Number(r.drop_id));
      eb = d && d.producten ? d.producten.eb_product_id : null;
      if (!eb) { problemen.push(`${r.naam} is nog niet gekoppeld aan een product in e-Boekhouden (Prijslijst → Koppelen).`); continue; }
      lijst.push({ eb, naam: r.naam, delen: verdeel(r.bedrag, r.aantal) });
    } else if (r.soort === "glas") {
      eb = /white/i.test(r.naam) ? inst && inst.eb_glas_white : inst && inst.eb_glas_breed;
      if (!eb) { problemen.push(`Kies onder Prijslijst → Koppelen bij Webwinkel het product voor ${r.naam}.`); continue; }
      lijst.push(...glasDelen(r, eb, winkel));
    }
  }
  if (Number(h.verzending) > 0) {
    const eb = inst && inst.eb_bezorgkosten;
    if (!eb) problemen.push("Kies onder Prijslijst → Koppelen bij Webwinkel het product voor de bezorgkosten.");
    else lijst.push({ eb, naam: h.bezorging === "Bezorgen in Amsterdam" ? "Bezorgen in Amsterdam" : "Verzendkosten", delen: [{ aantal: 1, prijs: Number(h.verzending) }] });
  }

  const details = {};
  for (const l of lijst) {
    if (!(l.eb in details)) details[l.eb] = await vraag("GET", `/v1/product/${l.eb}`);
    const p = details[l.eb];
    if (!p) problemen.push(`Het product bij ${l.naam} bestaat niet meer in e-Boekhouden. Koppel het opnieuw.`);
    else if (!p.ledgerId) problemen.push(`Het product bij ${l.naam} heeft in e-Boekhouden geen grootboekrekening.`);
  }
  let stuks = null;
  if (Object.values(details).some((p) => p && !p.unitId)) {
    const e = (await alles(vraag, "/v1/unit")).find((x) => /^stuks?$/i.test(String(x.plural || "").trim()) || /^stuk$/i.test(String(x.singular || "").trim()));
    stuks = e ? e.id : null;
    if (!stuks) problemen.push("In e-Boekhouden staat geen eenheid \"stuks\". Maak die aan, of geef de artikelen een eenheid.");
  }
  const items = [];
  lijst.forEach((l) => {
    const p = details[l.eb] || {};
    l.delen.forEach((d) => items.push({
      ...(l.korting ? {} : { productId: l.eb, ...(p.code ? { code: schoon(p.code, 50) } : {}) }),
      description: schoon(l.naam, 200), quantity: d.aantal, unitId: p.unitId || stuks,
      pricePerUnit: d.prijs, vatCode: p.vat || "HOOG_VERK_21", ledgerId: p.ledgerId || null
    }));
  });
  // Controle: de factuur moet precies het betaalde bedrag zijn
  const som = items.reduce((s, i) => s + centen(i.pricePerUnit) * i.quantity, 0);
  if (!problemen.length && som !== centen(h.totaal)) problemen.push("Het bedrag van de factuur komt niet overeen met de betaling. Maak de factuur onder Losse factuur.");
  return { inst, items, problemen };
};

const webwinkel = async (db, vraag, opdracht) => {
  const q = db.from("hedonist_bestellingen").select("*");
  const { data: h, error } = await (Number.isInteger(opdracht.bestelling) ? q.eq("id", opdracht.bestelling) : q.eq("bestelnummer", schoon(opdracht.bestelnummer, 40))).maybeSingle();
  if (error) throw error;
  if (!h) throw new Melding("Deze bestelling bestaat niet (meer).", 404);
  // Is de factuur in e-Boekhouden verwijderd, dan mag hij opnieuw worden gemaakt
  if (h.eb_factuur_id && !(await vraag("GET", `/v1/invoice/${h.eb_factuur_id}`))) {
    await db.from("hedonist_bestellingen").update({ eb_factuur_id: null, eb_factuurnummer: null, eb_factuur_op: null }).eq("id", h.id);
    h.eb_factuur_id = null; h.eb_factuur_op = null;
  }
  if (h.eb_factuur_id || h.eb_factuur_op) throw new Melding(h.eb_factuurnummer ? `Factuur ${h.eb_factuurnummer} staat al in e-Boekhouden.` : "Voor deze bestelling wordt al een factuur gemaakt.", 409);

  // Claimen: zo komt er nooit twee keer een factuur voor dezelfde bestelling (Mollie meldt soms vaker)
  const { data: claim } = await db.from("hedonist_bestellingen").update({ eb_factuur_op: new Date().toISOString() })
    .eq("id", h.id).is("eb_factuur_op", null).is("eb_factuur_id", null).select("id");
  if (!claim || !claim.length) throw new Melding("Voor deze bestelling wordt al een factuur gemaakt.", 409);

  let factuur = null;
  try {
    const o = await webwinkelOpbouwen(db, vraag, h);
    if (o.problemen.length) throw new Melding(o.problemen[0]);
    const { inst } = o;

    // De klant: een bestaande relatie (zie bestaandeKlant), anders een nieuwe particulier
    const a = h.adres === "Ophalen" ? { straat: "", postcode: "", plaats: "" } : adresDelen(h.adres);
    let relatie = await bestaandeKlant(vraag, h, a);
    if (!relatie) {
      relatie = (await vraag("POST", "/v1/relation", {
        type: "P", name: schoon(h.naam, 100),
        address: schoon(a.straat, 100), postalCode: schoon(a.postcode, 10), city: schoon(a.plaats, 50),
        phoneNumber: schoon(h.telefoon, 25), emailAddress: schoon(h.email, 150), emailAddressInvoice: schoon(h.email, 150),
        termOfPayment: inst.betaaltermijn_dagen
      })).id;
    }

    let mutatie = null;
    if (inst.eb_verwerken !== false) {
      const deb = await alles(vraag, "/v1/ledger?category=DEB");
      mutatie = { description: `Factuur webwinkel ${h.bestelnummer}`, ...(deb.length === 1 ? { ledgerId: deb[0].id } : {}) };
    }
    const betaald = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" }).format(new Date(h.betaald_op));
    const nummer = await volgendNummer(vraag);
    factuur = await vraag("POST", "/v1/invoice", {
      ...(nummer ? { invoiceNumber: nummer } : {}),
      relationId: relatie,
      date: vandaag(),
      termOfPayment: inst.betaaltermijn_dagen,
      inExVat: "IN",
      templateId: inst.eb_sjabloon_id,
      text: `Bestelling ${h.bestelnummer}. Al betaald met ${h.methode === "banktransfer" ? "een bankoverschrijving" : "iDEAL"} via Mollie op ${betaald}.`,
      items: o.items,
      ...(mutatie ? { mutation: mutatie } : {})
    });
  } catch (e) {
    // Mislukt vóór de factuur er was: vrijgeven en de reden bewaren, zodat je het in de backoffice opnieuw kunt proberen
    if (!factuur) {
      await db.from("hedonist_bestellingen").update({ eb_factuur_op: null, eb_factuur_fout: e instanceof Melding ? e.message : "Er ging iets mis bij e-Boekhouden." })
        .eq("id", h.id).is("eb_factuur_id", null);
    }
    throw e;
  }
  await db.from("hedonist_bestellingen").update({ eb_factuur_id: factuur.id, eb_factuurnummer: factuur.invoiceNumber || null, eb_factuur_fout: null }).eq("id", h.id);
  return { nummer: factuur.invoiceNumber || "", id: factuur.id };
};

// ---------- 8. Cijfers voor het startscherm van de backoffice ----------
// Omzet = het totaal excl. btw van de facturen in e-Boekhouden (creditfacturen tellen negatief mee),
// en wat er nog openstaat bij debiteuren (incl. btw).
export const omzet = (facturen, nu) => {
  const jaar = nu.slice(0, 4), maand = nu.slice(0, 7), vorig = String(Number(jaar) - 1), vorigTot = vorig + nu.slice(4);
  let j = 0, m = 0, v = 0, n = 0;
  for (const f of facturen) {
    const d = String(f.date || "").slice(0, 10), ex = centen(f.totalExcl || 0);
    if (d.startsWith(jaar)) { j += ex; n++; if (d.startsWith(maand)) m += ex; }
    else if (d.startsWith(vorig) && d <= vorigTot) v += ex;
  }
  return { jaar: j / 100, maand: m / 100, vorigJaar: v / 100, facturen: n };
};
const cijfers = async (vraag) => {
  const [facturen, open] = await Promise.all([alles(vraag, "/v1/invoice"), alles(vraag, "/v1/mutation/invoice/outstanding?credDeb=D")]);
  const openstaand = open.filter((x) => Number(x.outstandingAmount) > 0);
  return {
    ...omzet(facturen, vandaag()),
    openstaand: { aantal: openstaand.length, bedrag: openstaand.reduce((s, x) => s + centen(x.outstandingAmount), 0) / 100 }
  };
};

// De betaal-Worker bewijst met de koppelsleutel (supabase/015) dat hij het is
const isWorker = async (db, sleutel) => {
  if (!sleutel || typeof sleutel !== "string") return false;
  const { data } = await db.from("koppelsleutels").select("sleutel").eq("naam", "hedonist").maybeSingle();
  return !!(data && data.sleutel === sleutel);
};

// ---------- 9. Wie kocht de wijnen van een producent? ----------
// Zoekt in alle verkoopfacturen naar regels met een product van die producent: een product dat aan een
// van zijn wijnen is gekoppeld, of een product of regel waarin de naam van de producent of een cuvée staat.
// Geeft per cuvée de klanten met het aantal flessen, het aantal facturen en de laatste datum (geen bedragen),
// en of de klant zakelijk is (zie hieronder bij "Zakelijk").
const gewoon = (v) => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const kopersVerzamelen = (facturen, productNaam, pastBij) => {
  const per = new Map();
  for (const f of facturen) {
    for (const r of f.items || []) {
      const naam = r.productId ? productNaam.get(r.productId) : null;
      if (!(r.productId && naam) && !pastBij(r.description)) continue;
      const cuvee = naam || String(r.description || "").split("\n")[0].trim() || "Onbekend";
      if (!per.has(cuvee)) per.set(cuvee, new Map());
      const klanten = per.get(cuvee);
      const k = klanten.get(f.relationId) || { relatie: f.relationId, flessen: 0, facturen: new Set(), laatst: "" };
      k.flessen += Number(r.quantity ?? r.amount ?? 0);
      k.facturen.add(f.invoiceNumber || f.id);
      if (String(f.date || "") > k.laatst) k.laatst = String(f.date || "").slice(0, 10);
      klanten.set(f.relationId, k);
    }
  }
  return [...per.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl")).map(([cuvee, klanten]) => ({
    cuvee,
    klanten: [...klanten.values()].map((k) => ({ ...k, facturen: k.facturen.size })).sort((a, b) => b.laatst.localeCompare(a.laatst))
  }));
};

const kopers = async (db, vraag, opdracht) => {
  const producent = schoon(opdracht.producent, 100);
  if (!producent) throw new Melding("Kies een producent.");
  const { data: wijnen, error } = await db.from("producten").select("naam, eb_product_id").eq("producent", producent);
  if (error) throw error;
  const woorden = [gewoon(producent), ...(wijnen || []).map((w) => gewoon(w.naam)).filter((w) => w.length >= 4)];
  const pastBij = (tekst) => { const t = gewoon(tekst); return !!t && woorden.some((w) => t.includes(w)); };
  const gekoppeld = new Set((wijnen || []).map((w) => w.eb_product_id).filter(Boolean));
  const productNaam = new Map();
  for (const p of await alles(vraag, "/v1/product")) {
    if (gekoppeld.has(p.id) || pastBij(p.description) || pastBij(p.code)) productNaam.set(p.id, p.description || p.code || `Product ${p.id}`);
  }
  // Alle facturen met hun regels ophalen, een paar tegelijk
  const lijst = await alles(vraag, "/v1/invoice");
  const facturen = [];
  for (let i = 0; i < lijst.length; i += 6) {
    facturen.push(...(await Promise.all(lijst.slice(i, i + 6).map((f) => vraag("GET", `/v1/invoice/${f.id}`)))).filter(Boolean));
  }
  const uitkomst = kopersVerzamelen(facturen, productNaam, pastBij);
  // Zakelijk: gekoppeld aan een horecaklant uit het portaal, of in e-Boekhouden een bedrijf met een KvK- of
  // btw-nummer. Alleen "bedrijf" is niet genoeg: in e-Boekhouden staan ook particulieren vaak als bedrijf.
  const { data: horeca } = await db.from("klanten").select("eb_relatie_id").not("eb_relatie_id", "is", null);
  const portaal = new Set((horeca || []).map((k) => k.eb_relatie_id));
  const namen = new Map();
  for (const id of new Set(uitkomst.flatMap((c) => c.klanten.map((k) => k.relatie)))) {
    const r = id ? await vraag("GET", `/v1/relation/${id}`) : null;
    const zakelijk = !!r && (portaal.has(id) || (r.type !== "P" && !!(schoon(r.companyRegistrationNumber, 40) || schoon(r.vatNumber, 40))));
    namen.set(id, r ? { naam: r.name || `Relatie ${id}`, plaats: r.city || "", zakelijk } : { naam: "Onbekende klant", plaats: "", zakelijk: false });
  }
  return {
    producent, facturen: facturen.length,
    cuvees: uitkomst.map((c) => ({ cuvee: c.cuvee, klanten: c.klanten.map((k) => ({ ...namen.get(k.relatie), flessen: k.flessen, facturen: k.facturen, laatst: k.laatst })) }))
  };
};

// ---------- 10. Inkoopfactuur inboeken (supabase/027) ----------
// Een inkoopfactuur als "Factuur ontvangen" in e-Boekhouden: één regel met het totaal van de wijnen
// (excl. btw) op de rekening Inkopen. Nieuwe wijnen worden daar ook product, met de inkoopprijs en zonder
// verkoopprijs; groep, omzetrekening, btw en voorraad zoals bij het product met het hoogste nummer.
// Accijns en transport boeken we niet: die zitten alleen als toeslag per fles in de verkoopprijzen.
// Verkoopprijzen (alleen getoond, niet opgeslagen in e-Boekhouden):
//   horeca excl. btw      = inkoop × markup horeca + toeslag, op de cent
//   particulier incl. btw = (inkoop × markup particulier + toeslag) × 1,21, naar boven op 50 cent
// De voorraad (aantallen) kan niet via de koppeling: dat doe je in e-Boekhouden met "Voorraad bewerken".
// Bijlagen kunnen ook niet via de koppeling: de pdf gaat per mail naar de inbox van e-Boekhouden.
const INKOOP_BTW = { BI_EU_INK: "Binnen de EU, 0%", HOOG_INK_21: "Nederland, 21%", BU_EU_INK: "Buiten de EU, 0%" };
const omhoog50 = (c) => Math.ceil(Math.round(c * 1000) / 1000 / 50 - 1e-9) * 50;
export const verkoopprijzen = (inkoop, mP, mH, toeslag) => ({
  horeca: Math.round((inkoop * mH + toeslag) * 100) / 100,
  particulier: omhoog50((inkoop * mP + toeslag) * 121) / 100
});

const leveranciersZoeken = async (db, vraag, opdracht) => {
  const { klanten } = await klantenZoeken(vraag, opdracht);
  const ids = klanten.map((k) => k.id);
  const { data } = ids.length ? await db.from("inkoop_leveranciers").select("*").in("eb_relatie_id", ids) : { data: [] };
  return {
    leveranciers: klanten.map((k) => {
      const m = (data || []).find((x) => Number(x.eb_relatie_id) === k.id);
      return { ...k, markup: m ? { particulier: m.markup_particulier, horeca: m.markup_horeca, toeslag: m.toeslag } : null };
    })
  };
};

const inkoopOpbouwen = async (db, vraag, opdracht) => {
  const problemen = [];
  const getal = (v) => (v === "" || v == null ? NaN : Number(v));
  const mP = getal(opdracht.markup_particulier), mH = getal(opdracht.markup_horeca), toeslag = getal(opdracht.toeslag);
  if (!(mP >= 1 && mP <= 10)) problemen.push("Vul de markup voor particulier in, bijvoorbeeld 1,45.");
  if (!(mH >= 1 && mH <= 10)) problemen.push("Vul de markup voor horeca in, bijvoorbeeld 1,45.");
  if (!(toeslag >= 0 && toeslag <= 100)) problemen.push("Vul de toeslag per fles in (accijns en transport), of 0.");
  const nummer = schoon(opdracht.factuurnummer, 50);
  if (!nummer) problemen.push("Vul het factuurnummer van de leverancier in.");
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(opdracht.datum || "")) ? opdracht.datum : null;
  if (!datum) problemen.push("Vul de factuurdatum in.");
  const termijn = Math.floor(Number(opdracht.termijn));
  if (!(termijn >= 0 && termijn <= 365)) problemen.push("Vul de betaaltermijn in dagen in.");
  const btwCode = opdracht.btw in INKOOP_BTW ? opdracht.btw : null;
  if (!btwCode) problemen.push("Kies de btw-code.");

  // De leverancier: een bestaande relatie, of (met het vinkje) een nieuwe
  let leverancier = null, nieuw = null;
  if (Number.isInteger(opdracht.relatie)) {
    const r = await vraag("GET", `/v1/relation/${opdracht.relatie}`);
    if (!r) problemen.push("Deze leverancier bestaat niet (meer) in e-Boekhouden. Zoek hem opnieuw.");
    else leverancier = relatieVan(r);
  } else if (opdracht.relatie === "nieuw") {
    const n = opdracht.nieuw || {};
    nieuw = {
      type: "B", name: schoon(n.naam, 100),
      address: schoon(n.adres, 100), postalCode: schoon(n.postcode, 10), city: schoon(n.plaats, 50), country: schoon(n.land, 50),
      emailAddress: schoon(n.email, 150),
      ...(schoon(n.btw, 20) ? { vatNumber: schoon(n.btw, 20).replace(/\s/g, "").toUpperCase() } : {}),
      ...(termijn >= 0 ? { termOfPayment: termijn } : {})
    };
    if (!nieuw.name) problemen.push("Vul de naam van de nieuwe leverancier in.");
    leverancier = { id: null, naam: nieuw.name, plaats: nieuw.city, nieuw: true };
  } else problemen.push("Kies de leverancier, of zet het vinkje voor een nieuwe leverancier aan.");

  // Is deze factuur al geboekt? (zelfde factuurnummer bij dezelfde leverancier)
  let alGeboekt = null;
  if (nummer && leverancier && leverancier.id) {
    const j = await vraag("GET", `/v1/mutation?limit=50&type=1&invoiceNumber=${encodeURIComponent(nummer)}`);
    alGeboekt = ((j && j.items) || []).find((m) => !m.relationId || m.relationId === leverancier.id) || null;
  }

  // De wijnen
  const invoer = Array.isArray(opdracht.regels) ? opdracht.regels.slice(0, 100) : [];
  if (!invoer.length) problemen.push("Voeg minstens één wijn toe.");
  const producten = await alles(vraag, "/v1/product");
  const opNaam = new Map(producten.map((p) => [gewoon(p.description), p]));
  // Het volgende productnummer: het hoogste nummer plus 1, met evenveel cijfers (041 → 042)
  const numeriek = producten.filter((p) => /^\d+$/.test(String(p.code || "").trim()));
  const hoogste = numeriek.sort((a, b) => parseInt(b.code, 10) - parseInt(a.code, 10))[0] || null;
  let volgende = hoogste ? parseInt(hoogste.code, 10) + 1 : 1;
  const breedte = hoogste ? String(hoogste.code).trim().length : 3;
  const voorbeeldProduct = hoogste ? await vraag("GET", `/v1/product/${hoogste.id}`) : null;
  const sjabloon = {
    groupId: voorbeeldProduct && voorbeeldProduct.groupId ? voorbeeldProduct.groupId : undefined,
    ledgerId: voorbeeldProduct ? voorbeeldProduct.ledgerId : null,
    vat: (voorbeeldProduct && voorbeeldProduct.vat) || "HOOG_VERK_21"
  };
  if (invoer.length && !sjabloon.ledgerId) problemen.push("Er staat nog geen product met een nummer in e-Boekhouden om groep en omzetrekening van over te nemen.");

  const regels = [];
  const gezien = new Set();
  for (const r of invoer) {
    const omschrijving = schoon(r.omschrijving, 200);
    const aantal = Math.floor(Number(r.aantal));
    const prijs = Math.round(Number(r.prijs) * 100) / 100;
    if (!omschrijving) { problemen.push("Vul bij elke wijn de omschrijving in."); continue; }
    if (!(aantal >= 1 && aantal <= 100000)) { problemen.push(`Vul bij ${omschrijving} het aantal flessen in.`); continue; }
    if (!(prijs > 0 && prijs <= 100000)) { problemen.push(`Vul bij ${omschrijving} de inkoopprijs per fles in.`); continue; }
    const sleutel = gewoon(omschrijving);
    if (gezien.has(sleutel)) { problemen.push(`${omschrijving} staat twee keer in de lijst. Tel de aantallen bij elkaar op.`); continue; }
    gezien.add(sleutel);
    const bestaand = opNaam.get(sleutel) || null;
    const code = bestaand ? (bestaand.code || "") : String(volgende++).padStart(breedte, "0");
    if (!bestaand && code.length > 20) { problemen.push("Het volgende productnummer is te lang voor e-Boekhouden."); continue; }
    const v = mP >= 1 && mH >= 1 && toeslag >= 0 ? verkoopprijzen(prijs, mP, mH, toeslag) : { horeca: null, particulier: null };
    // De wijn ook in de prijslijst van het portaal (op binnenkort), als dat is aangevinkt
    let lijst = null;
    if (r.prijslijst && opdracht.prijslijst !== false) {
      const l = r.prijslijst;
      lijst = {
        producent: schoon(l.producent, 100), producent_slug: schoon(l.producent_slug, 100), regio: schoon(l.regio, 60),
        naam: schoon(l.naam, 150), jaargang: schoon(l.jaargang, 10), formaat: schoon(l.formaat, 20) || "75 cl",
        kleur: ["wit", "rood", "rose"].includes(l.kleur) ? l.kleur : null
      };
      if (!lijst.producent || !lijst.naam) { problemen.push(`Voor de prijslijst mist bij ${omschrijving} de producent of de naam. Schrijf de omschrijving als "Producent - Wijn 2019 75cl", of zet het vinkje voor de prijslijst uit.`); continue; }
    }
    regels.push({ omschrijving, aantal, prijs, code, bestaand: !!bestaand, bestaandId: bestaand ? bestaand.id : null, lijst, ...v });
  }
  const totaal = regels.reduce((s, r) => s + centen(r.prijs) * r.aantal, 0) / 100;
  // Staat de wijn al in de prijslijst? (zelfde producent, naam, jaargang en formaat)
  if (regels.some((r) => r.lijst)) {
    const { data: bestaandeWijnen, error } = await db.from("producten").select("id, producent, naam, jaargang, formaat, eb_product_id").eq("soort", "wijn");
    if (error) throw error;
    const sleutelVan = (p) => [p.producent, p.naam, p.jaargang || "", p.formaat || "75 cl"].map((x) => gewoon(String(x).replace(/\s+cl$/i, "cl"))).join("|");
    const index = new Map((bestaandeWijnen || []).map((p) => [sleutelVan(p), p]));
    regels.forEach((r) => {
      if (!r.lijst) return;
      const p = index.get(sleutelVan(r.lijst));
      r.lijstId = p ? p.id : null;
      r.lijstGekoppeld = p ? p.eb_product_id || null : null;
      r.prijslijst = p ? "bestaat" : "nieuw";
    });
  }

  // Rekeningen: Inkopen (7000) voor de regel, Crediteuren voor de boeking
  const [inkopen] = await Promise.all([vraag("GET", "/v1/ledger?code=7000")]);
  const inkoopRekening = ((inkopen && inkopen.items) || [])[0] || null;
  if (!inkoopRekening) problemen.push("In e-Boekhouden staat geen grootboekrekening 7000 (Inkopen).");
  const cred = await alles(vraag, "/v1/ledger?category=CRED");
  const crediteuren = cred.length === 1 ? cred[0] : cred.find((l) => String(l.code) === "1600") || null;
  if (!crediteuren) problemen.push("Ik kan de rekening Crediteuren in e-Boekhouden niet vinden.");

  return {
    regels, nieuw, leverancier, sjabloon, problemen, btwCode, nummer, datum, termijn,
    inkoopRekening, crediteuren, alGeboekt,
    markup: { particulier: mP, horeca: mH, toeslag },
    voorbeeld: {
      leverancier, factuurnummer: nummer, datum, termijn, btw: btwCode ? INKOOP_BTW[btwCode] : "",
      rekening: inkoopRekening ? `${inkoopRekening.code} ${inkoopRekening.description || ""}`.trim() : "",
      alGeboekt: !!alGeboekt, totaal,
      regels: regels.map(({ bestaandId, lijstId, lijstGekoppeld, ...r }) => r),
      problemen
    }
  };
};

// Mailt de pdf via Resend (dezelfde sleutel en afzender als de functie bestelmail) naar het
// inbox-adres van e-Boekhouden. Het adres staat alleen in Supabase: secret EBOEKHOUDEN_INBOX.
const pdfNaarInbox = async (pdf, naam, o) => {
  const aan = Deno.env.get("EBOEKHOUDEN_INBOX"), sleutel = Deno.env.get("RESEND_API_KEY");
  if (!aan || !sleutel) throw new Melding("De pdf is niet gemaild: het inbox-adres van e-Boekhouden (EBOEKHOUDEN_INBOX) staat nog niet in Supabase.");
  if (!/^[A-Za-z0-9+/]+=*$/.test(pdf) || pdf.length > 14_000_000) throw new Melding("De pdf is niet gemaild: het bestand is ongeldig of groter dan 10 MB.");
  const bestand = (naam && /\.pdf$/i.test(naam) ? naam : `Inkoopfactuur ${o.nummer}.pdf`).replace(/[\\/:*?"<>|]/g, "-");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${sleutel}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("AFZENDER") || "VMV Wijnimport <onboarding@resend.dev>",
      to: [aan], subject: schoon(`Inkoopfactuur ${o.nummer} ${o.leverancier.naam}`, 200),
      text: `Inkoopfactuur ${o.nummer} van ${o.leverancier.naam}, ingeboekt vanuit de backoffice.`,
      attachments: [{ filename: bestand, content: pdf }]
    })
  });
  if (!r.ok) { console.error(`Resend ${r.status}: ${await r.text()}`); throw new Melding("De pdf kon niet naar e-Boekhouden worden gemaild."); }
};

const inkoopMaken = async (db, vraag, opdracht) => {
  const o = await inkoopOpbouwen(db, vraag, opdracht);
  if (o.problemen.length) throw new Melding(o.problemen[0]);
  // 1. De leverancier
  let relatie = o.leverancier.id;
  if (o.nieuw) relatie = (await vraag("POST", "/v1/relation", o.nieuw)).id;
  // 2. De boeking (niet als hij er al staat, bijvoorbeeld na een eerdere poging)
  let geboekt = false;
  if (!o.alGeboekt) {
    await vraag("POST", "/v1/mutation", {
      type: "1", date: o.datum, ledgerId: o.crediteuren.id, relationId: relatie,
      invoiceNumber: o.nummer, termOfPayment: o.termijn, inExVat: "EX",
      description: schoon(o.leverancier.naam, 200),
      rows: [{ ledgerId: o.inkoopRekening.id, vatCode: o.btwCode, amount: o.voorbeeld.totaal, description: schoon(`Wijn, factuur ${o.nummer}`, 200) }]
    });
    geboekt = true;
  }
  // 3. De nieuwe producten (bestaande met dezelfde omschrijving slaan we over)
  const gemaakt = [];
  for (const r of o.regels) {
    if (r.bestaand) { r.ebId = r.bestaandId; continue; }
    const nieuwProduct = await vraag("POST", "/v1/product", {
      // e-Boekhouden eist een verkoopprijs; 0 = leeg, zoals bij de producten die VMV zelf aanmaakt
      code: r.code, description: r.omschrijving, purchasePriceExcl: r.prijs, priceExcl: 0,
      vat: o.sjabloon.vat, ledgerId: o.sjabloon.ledgerId,
      ...(o.sjabloon.groupId ? { groupId: o.sjabloon.groupId } : {}),
      inStockManagement: true, active: true
    });
    r.ebId = nieuwProduct && nieuwProduct.id ? nieuwProduct.id : null;
    gemaakt.push(r.code);
  }
  // 3b. De wijnen in de prijslijst van het portaal: nieuw op binnenkort met de uitgerekende prijzen,
  //     of (staat hij er al) alleen koppelen aan het product in e-Boekhouden als dat nog niet zo was
  const inPrijslijst = [], nietInPrijslijst = [];
  for (const r of o.regels) {
    if (!r.lijst) continue;
    if (r.lijstId) {
      if (!r.lijstGekoppeld && r.ebId) await db.from("producten").update({ eb_product_id: r.ebId }).eq("id", r.lijstId);
      continue;
    }
    const { error } = await db.from("producten").insert({
      soort: "wijn", ...r.lijst, producent_slug: r.lijst.producent_slug || null, regio: r.lijst.regio || null,
      jaargang: r.lijst.jaargang || null, prijs_ex: r.horeca, prijs_particulier: r.particulier,
      beschikbaarheid: "binnenkort", actief: true, eb_product_id: r.ebId || null
    });
    if (error) { console.error(error); nietInPrijslijst.push(r.omschrijving); continue; }
    inPrijslijst.push(r.omschrijving);
  }
  // 4. De markup onthouden voor de volgende keer
  await db.from("inkoop_leveranciers").upsert({
    eb_relatie_id: relatie, naam: o.leverancier.naam,
    markup_particulier: o.markup.particulier, markup_horeca: o.markup.horeca, toeslag: o.markup.toeslag,
    bijgewerkt: new Date().toISOString()
  });
  // 5. De pdf van de factuur naar de inbox van e-Boekhouden mailen (ook bij een nieuwe poging, als de boeking er al stond)
  const pdf = String(opdracht.pdf || "").replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  let pdfGemaild = false, pdfFout = "";
  if (pdf) {
    try { await pdfNaarInbox(pdf, schoon(opdracht.pdfnaam, 120), o); pdfGemaild = true; }
    catch (e) { console.error(e); pdfFout = e instanceof Melding ? e.message : "De pdf kon niet naar e-Boekhouden worden gemaild."; }
  }
  return { geboekt, alGeboekt: !!o.alGeboekt, producten: gemaakt, prijslijst: inPrijslijst, nietInPrijslijst, regels: o.voorbeeld.regels, totaal: o.voorbeeld.totaal, pdfGemaild, pdfFout };
};

// ---------- Afhandelen ----------
const afhandelen = async (req, db) => {
  const opdracht = await req.json().catch(() => ({}));
  const soort = opdracht.opdracht;
  // De webwinkelfactuur mag ook de betaal-Worker aanvragen, met de koppelsleutel; al het andere alleen een beheerder
  const worker = soort === "webwinkel" && await isWorker(db, opdracht.sleutel);
  if (!worker && !(await beheerderUit(db, req))) return antwoord({ fout: "Geen toegang. Log opnieuw in op de backoffice." }, 401);
  if (!["gegevens", "koppelen", "voorbereiden", "maken", "klanten", "los_voorbereiden", "los_maken", "webwinkel", "cijfers", "kopers", "leveranciers", "inkoop_voorbereiden", "inkoop_maken"].includes(soort)) return antwoord({ fout: "Onbekende opdracht." }, 400);
  if (soort === "webwinkel" && !Number.isInteger(opdracht.bestelling) && !opdracht.bestelnummer) return antwoord({ fout: "Onbekende bestelling." }, 400);
  if ((soort === "voorbereiden" || soort === "maken") && !Number.isInteger(opdracht.bestelling)) return antwoord({ fout: "Onbekende bestelling." }, 400);
  let vraag = null;
  try {
    vraag = await ebSessie();
    if (soort === "gegevens") return antwoord(await gegevens(db, vraag));
    if (soort === "koppelen") return antwoord(await koppelen(db, vraag, opdracht));
    if (soort === "voorbereiden") return antwoord((await opbouwen(db, vraag, opdracht.bestelling)).voorbeeld);
    if (soort === "klanten") return antwoord(await klantenZoeken(vraag, opdracht));
    if (soort === "los_voorbereiden") return antwoord((await losOpbouwen(db, vraag, opdracht)).voorbeeld);
    if (soort === "los_maken") return antwoord(await losMaken(db, vraag, opdracht));
    if (soort === "webwinkel") return antwoord(await webwinkel(db, vraag, opdracht));
    if (soort === "cijfers") return antwoord(await cijfers(vraag));
    if (soort === "kopers") return antwoord(await kopers(db, vraag, opdracht));
    if (soort === "leveranciers") return antwoord(await leveranciersZoeken(db, vraag, opdracht));
    if (soort === "inkoop_voorbereiden") return antwoord((await inkoopOpbouwen(db, vraag, opdracht)).voorbeeld);
    if (soort === "inkoop_maken") return antwoord(await inkoopMaken(db, vraag, opdracht));
    return antwoord(await maken(db, vraag, opdracht));
  } catch (e) {
    if (e instanceof Melding) return antwoord({ fout: e.message }, e.status);
    console.error(e);
    return antwoord({ fout: "Er ging iets mis. Probeer het opnieuw." }, 500);
  } finally {
    if (vraag) await vraag.sluit();
  }
};

if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("niet gevonden", { status: 404, headers: CORS });
  try {
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    return await afhandelen(req, db);
  } catch (e) {
    console.error(e);
    return antwoord({ fout: "Er ging iets mis. Probeer het opnieuw." }, 500);
  }
});
