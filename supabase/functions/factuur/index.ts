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
// Factuurregels verwijzen naar het product in e-Boekhouden (productId), zodat de voorraad daar meeloopt.
// Bedragen komen uit de bestelling zoals VMV hem heeft bevestigd (prijs per stuk na korting).
//
// Instellingen in Supabase → Edge Functions → Secrets (niets hiervan staat in de repository):
//   EBOEKHOUDEN_TOKEN  het API-token uit e-Boekhouden (Beheer → Inrichting → Koppelingen → e-Boekhouden API)

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
    db.from("instellingen").select("eb_sjabloon_id, eb_verwerken").maybeSingle()
  ]);
  return {
    producten: producten.map((p) => ({ id: p.id, code: p.code || "", omschrijving: p.description || "", actief: p.active !== false })),
    sjablonen: sjablonen.filter((s) => s.active !== false).map((s) => ({ id: s.id, naam: s.name || `Sjabloon ${s.id}` })),
    sjabloon: inst ? inst.eb_sjabloon_id : null,
    verwerken: inst ? inst.eb_verwerken !== false : true
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
  const { error } = await db.from("instellingen")
    .update({ eb_sjabloon_id: Number.isInteger(opdracht.sjabloon) ? opdracht.sjabloon : null, eb_verwerken: opdracht.verwerken !== false })
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

// ---------- Afhandelen ----------
const afhandelen = async (req, db) => {
  const be = await beheerderUit(db, req);
  if (!be) return antwoord({ fout: "Geen toegang. Log opnieuw in op de backoffice." }, 401);
  const opdracht = await req.json().catch(() => ({}));
  const soort = opdracht.opdracht;
  if (!["gegevens", "koppelen", "voorbereiden", "maken", "klanten", "los_voorbereiden", "los_maken"].includes(soort)) return antwoord({ fout: "Onbekende opdracht." }, 400);
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
