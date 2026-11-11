// ------------------------------------------------------------------
//  VMV Wijnimport — koppeling tussen de website en Mollie
//  Draait als Cloudflare Worker. Zie betalen/INSTELLEN.md.
//
//  Instellingen in Cloudflare (Settings → Variables and Secrets):
//    MOLLIE_API_KEY  (geheim)  test_... of live_...
//    SITE_URL                  https://vmvwijnimport.com (zonder / aan het eind)
//    RESEND_API_KEY  (geheim)  sleutel uit Resend, voor de mails na betaling
//    AFZENDER                  standaard "VMV Wijnimport <bestellingen@vmvwijnimport.com>"
//    VMV_MAIL                  standaard info@vmvwijnimport.com
//    HEDONIST_SLEUTEL (geheim) sleutel uit supabase/015-hedonist.sql; zet betaalde bestellingen
//                              in de backoffice. Zonder deze sleutel komen ze alleen per mail,
//                              en kan er geen wijn (drops) worden besteld.
//
//  Endpoints:
//    POST /betaling        maakt een Mollie-betaling aan, geeft de betaallink terug
//    POST /drop/betaling   hetzelfde voor een mandje met wijn uit een drop, eventueel met glazen
//                          (supabase/022-drops.sql)
//    GET  /status?id=tr_…  geeft de status van een betaling terug
//    POST /webhook         Mollie meldt een statuswijziging; is de betaling binnen,
//                          dan krijgen de klant en VMV een mail in de huisstijl en komt
//                          de bestelling in de backoffice
// ------------------------------------------------------------------

const MOLLIE = "https://api.mollie.com/v2";
// Horecaportaal (Supabase): openbare gegevens, staan ook in _config.yml. De beveiliging zit in de sleutel.
const SUPABASE_URL = "https://iemduldvpylppckpttja.supabase.co";
const SUPABASE_KEY = "sb_publishable_w0sVLgS2_qy-HdTgVyvfqw_xpahvjXV";

export default {
  async fetch(request, env) {
    const site = (env.SITE_URL || "").replace(/\/$/, "");
    const herkomst = new URL(site).origin;
    const cors = {
      "Access-Control-Allow-Origin": herkomst,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const antwoord = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const pad = url.pathname;
    try {
      if (pad === "/betaling" && request.method === "POST") {
        return antwoord(await maakBetaling(await request.json(), env, site, `${url.origin}/webhook`));
      }
      if (pad === "/drop/betaling" && request.method === "POST") {
        return antwoord(await maakDropBetaling(await request.json(), env, site, `${url.origin}/webhook`));
      }
      if (pad === "/webhook" && request.method === "POST") {
        // Mollie stuurt alleen het id; de status halen we zelf bij Mollie op, dus dit is niet te vervalsen
        const id = String((await request.formData()).get("id") || "");
        if (!/^tr_[A-Za-z0-9]+$/.test(id)) return new Response("Onbekende betaling", { status: 400 });
        const betaling = await mollie(`/payments/${id}`, env);
        if (betaling.metadata?.soort === "drop") await naDropBetaling(betaling, env, site);
        else await naBetaling(betaling, env, site);
        return new Response("OK");
      }
      if (pad === "/status" && request.method === "GET") {
        const id = new URL(request.url).searchParams.get("id") || "";
        if (!/^tr_[A-Za-z0-9]+$/.test(id)) return antwoord({ fout: "Onbekende betaling" }, 400);
        const betaling = await mollie(`/payments/${id}`, env);
        return antwoord({ status: betaling.status, bestelnummer: betaling.metadata?.bestelnummer || "" });
      }
      return antwoord({ fout: "Niet gevonden" }, 404);
    } catch (e) {
      return antwoord({ fout: e.message || "Er ging iets mis" }, e.status || 500);
    }
  },
};

class Fout extends Error {
  constructor(bericht, status = 400) { super(bericht); this.status = status; }
}

async function mollie(pad, env, body) {
  const r = await fetch(MOLLIE + pad, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${env.MOLLIE_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Fout(data.detail || "Mollie gaf een fout", 502);
  return data;
}

// Prijzen en regels komen van de website zelf (winkel.json), dus er is maar één plek om ze aan te passen.
// De prijs wordt hier opnieuw berekend; wat de browser stuurt aan bedragen wordt genegeerd.
// Per model: elke 6 glazen voor de setprijs, de rest per glas
export function glasRegels(winkel, aantallen) {
  let n = 0, glazen = 0;
  const lijst = [];
  for (const [id, naam] of Object.entries(winkel.modellen)) {
    const a = Math.floor(Number(aantallen?.[id] || 0));
    if (!Number.isFinite(a) || a < 0 || a > 120) throw new Fout("Ongeldig aantal");
    if (a === 0) continue;
    const prijs = Math.floor(a / 6) * winkel.prijsZes + (a % 6) * winkel.prijsGlas;
    n += a; glazen += prijs;
    lijst.push({ naam, aantal: a, bedrag: Math.round(prijs * 100) / 100 });
  }
  return { n, glazen, lijst };
}

export function bereken(winkel, aantallen, bezorging) {
  const { n, glazen, lijst } = glasRegels(winkel, aantallen);
  const regels = lijst.map((r) => `${r.aantal} × ${r.naam}`);
  if (n === 0) throw new Fout("Je winkelmandje is leeg");
  const amsterdam = bezorging === "amsterdam";
  const gratis = bezorging === "ophalen" || n >= winkel.gratisVanaf || (amsterdam && n >= winkel.gratisAmsterdamVanaf);
  const verzending = gratis ? 0 : winkel.verzendkosten;
  const totaal = Math.round((glazen + verzending) * 100) / 100;
  return { n, regels, glazen, verzending, totaal };
}

export function isAmsterdam(postcode) {
  const cijfers = parseInt(String(postcode || "").replace(/\D/g, "").slice(0, 4), 10);
  return cijfers >= 1011 && cijfers <= 1109;
}

async function maakBetaling(invoer, env, site, webhook) {
  const r = await fetch(`${site}/winkel.json`, { cf: { cacheTtl: 60 } });
  if (!r.ok) throw new Fout("Kon de prijzen niet ophalen", 502);
  const winkel = await r.json();
  if (!winkel.open) throw new Fout("De pre-order is gesloten");

  const k = invoer.klant || {};
  const bezorging = ["amsterdam", "ophalen"].includes(invoer.bezorging) ? invoer.bezorging : "verzenden";
  const verplicht = bezorging === "ophalen" ? ["naam", "email", "telefoon"] : ["naam", "email", "telefoon", "adres", "postcode", "plaats"];
  for (const veld of verplicht) {
    if (!String(k[veld] || "").trim()) throw new Fout("Vul alle verplichte velden in");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email)) throw new Fout("Vul een geldig e-mailadres in");
  if (bezorging === "amsterdam" && !isAmsterdam(k.postcode)) {
    throw new Fout("Bezorgen in Amsterdam kan alleen bij een Amsterdamse postcode");
  }

  const b = bereken(winkel, invoer.aantallen, bezorging);
  const nu = new Date();
  const bestelnummer = `VMV-${nu.toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const kort = (s, max = 200) => String(s || "").trim().slice(0, max);

  const betaling = await mollie("/payments", env, {
    amount: { currency: "EUR", value: b.totaal.toFixed(2) },
    description: `Pre-order Hedonist ${bestelnummer}`,
    redirectUrl: `${site}/bestelling/`,
    webhookUrl: webhook,
    locale: "nl_NL",
    method: ["ideal", "banktransfer"],
    billingEmail: kort(k.email),
    metadata: {
      bestelnummer,
      bestelling: b.regels.join(", "),
      bezorging: { amsterdam: "Bezorgen in Amsterdam", ophalen: "Ophalen bij Oocker" }[bezorging] || "Verzenden",
      verzending: b.verzending.toFixed(2),
      glazen: b.glazen.toFixed(2),
      naam: kort(k.naam), email: kort(k.email), telefoon: kort(k.telefoon, 40),
      adres: bezorging === "ophalen" ? "Ophalen" : `${kort(k.adres)}, ${kort(k.postcode, 12)} ${kort(k.plaats, 80)}`,
      opmerking: kort(k.opmerking, 500),
    },
  });

  return {
    id: betaling.id,
    betaallink: betaling._links.checkout.href,
    bestelnummer,
    totaal: b.totaal,
  };
}

// ---------- Mails na betaling (Resend), in dezelfde opmaak als de horecamails ----------

const KLEUR = { zwart: "#000000", tekst: "#3A3A3A", zacht: "#6B6B6B", wit: "#FFFFFF", donkerTekst: "#CFCFCF", rood: "#731515", champagneLicht: "#F8F7E6", lijn: "#E6E4DC" };
const LETTER = "'Jost', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const KOPBAND = "https://iemduldvpylppckpttja.supabase.co/functions/v1/bestelmail?beeld=kop";

const html = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const euro = (n) => "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const alinea = (tekst) => `<p style="margin:0 0 16px;font-family:${LETTER};font-size:16px;line-height:1.55;color:${KLEUR.tekst};">${tekst}</p>`;
const vlak = (inhoud) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
  <td style="background:${KLEUR.champagneLicht};padding:16px 20px;font-family:${LETTER};font-size:15px;line-height:1.55;color:${KLEUR.zwart};">${inhoud}</td></tr></table>`;

const gegevens = (paren) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${paren
  .filter((p) => p[1])
  .map(([k, v]) => `<tr>
    <td valign="top" style="padding:6px 16px 6px 0;font-family:${LETTER};font-size:14px;color:${KLEUR.zacht};white-space:nowrap;width:1%;">${k}</td>
    <td valign="top" style="padding:6px 0;font-family:${LETTER};font-size:15px;line-height:1.45;color:${KLEUR.zwart};">${v}</td></tr>`)
  .join("")}</table>`;

// De glazen, verzending en het totaal (incl. btw)
const regelTabel = (m, totaal) => {
  const cel = `font-family:${LETTER};font-size:15px;color:${KLEUR.zwart};border-bottom:1px solid ${KLEUR.lijn};`;
  const rijen = String(m.bestelling || "").split(", ").filter(Boolean)
    .map((r) => `<tr><td colspan="2" style="${cel}padding:12px 0;line-height:1.45;">${html(r)}</td></tr>`).join("");
  const regel = (label, bedrag, vet) => {
    const st = `font-family:${LETTER};font-size:${vet ? 16 : 14}px;${vet ? "font-weight:500;" : ""}color:${vet ? KLEUR.zwart : KLEUR.tekst};border-bottom:1px solid ${KLEUR.lijn};`;
    return `<tr><td style="${st}padding:8px 12px 8px 0;">${label}</td><td align="right" style="${st}padding:8px 0;white-space:nowrap;">${bedrag}</td></tr>`;
  };
  const verzending = Number(m.verzending || 0);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid ${KLEUR.zwart};">
    ${rijen}${m.glazen ? regel("Glazen", euro(m.glazen)) : ""}${regel("Verzending", verzending ? euro(verzending) : "Gratis")}${regel("Totaal incl. btw", euro(totaal), true)}
  </table>`;
};

const omhulsel = (kop, voorvertoning, inhoud) => `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${html(kop)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>:root{color-scheme:light;supported-color-schemes:light}@media (max-width:600px){.vak{padding:32px 20px !important}}</style>
</head>
<body style="margin:0;padding:0;background:${KLEUR.wit};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${html(voorvertoning)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${KLEUR.wit};"><tr><td align="center" style="padding:24px 8px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border:1px solid ${KLEUR.lijn};">
    <tr><td bgcolor="${KLEUR.zwart}" style="background:${KLEUR.zwart};line-height:0;font-size:0;">
      <img src="${KOPBAND}" width="600" alt="VMV wijnimport" style="display:block;border:0;width:100%;max-width:600px;height:auto;">
    </td></tr>
    <tr><td class="vak" style="padding:40px 32px 40px;">
      <h1 style="margin:0 0 24px;font-family:${LETTER};font-size:30px;line-height:1.2;font-weight:300;color:${KLEUR.zwart};">${html(kop)}</h1>
      ${inhoud}
    </td></tr>
    <tr><td class="vak" bgcolor="${KLEUR.zwart}" style="background:${KLEUR.zwart};padding:28px 32px;font-family:${LETTER};font-size:13px;line-height:1.7;color:${KLEUR.donkerTekst};">
      <span style="color:${KLEUR.wit};font-weight:500;">VMV Wijnimport B.V.</span><br>
      <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.donkerTekst};">info@vmvwijnimport.com</a><br>
      WhatsApp 06 15 74 23 32<br>
      KvK 99082918, btw NL868786901B01
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

const isOphalen = (m) => m.adres === "Ophalen";
const bezorgregel = (m) => isOphalen(m) ? "Ophalen bij Oocker, Frederiksplein 29h, Amsterdam" : `${html(m.bezorging)}<br>${html(m.adres)}`;

// Naar de klant, zodra de betaling binnen is
export const mailKlant = (betaling, levering, site) => {
  const m = betaling.metadata || {};
  const inhoud =
    alinea(`Beste ${html(m.naam)},`) +
    alinea(`Bedankt voor je pre-order van Hedonist glazen. Je betaling is binnen. Hieronder staat je bestelling.`) +
    regelTabel(m, betaling.amount.value) +
    gegevens([
      ["Bestelnummer", html(m.bestelnummer)],
      ["Levering", levering ? `Verwacht in ${html(levering)}` : ""],
      [isOphalen(m) ? "Ophalen" : "Bezorging", bezorgregel(m)],
      ["Opmerking", m.opmerking ? html(m.opmerking) : ""]
    ]) +
    alinea(isOphalen(m) ? "We laten je weten wanneer je je glazen kunt ophalen. De factuur sturen we je apart per mail." : "De factuur sturen we je apart per mail.") +
    alinea(`Je hebt 14 dagen bedenktijd. Lees meer over het <a href="${site}/algemene-voorwaarden/#herroepingsrecht" style="color:${KLEUR.rood};">herroepingsrecht</a> en de <a href="${site}/algemene-voorwaarden/" style="color:${KLEUR.rood};">algemene voorwaarden</a>.`) +
    alinea(`Vragen? Mail ons op <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.rood};">info@vmvwijnimport.com</a> of stuur een WhatsApp naar 06 15 74 23 32.`);
  return {
    onderwerp: `Bedankt voor je bestelling ${m.bestelnummer}`,
    html: omhulsel("Bedankt voor je bestelling", "Je betaling is binnen.", inhoud)
  };
};

// Naar VMV, zodra de betaling binnen is
export const mailVmv = (betaling, levering) => {
  const m = betaling.metadata || {};
  const methode = { ideal: "iDEAL", banktransfer: "Bankoverschrijving" }[betaling.method] || betaling.method || "";
  const inhoud =
    vlak(`<strong style="font-weight:500;">Betaald via ${html(methode)}.</strong> Maak de factuur in e-Boekhouden.`) +
    regelTabel(m, betaling.amount.value) +
    gegevens([
      ["Bestelnummer", html(m.bestelnummer)],
      ["Klant", html(m.naam)],
      ["E-mail", `<a href="mailto:${html(m.email)}" style="color:${KLEUR.rood};">${html(m.email)}</a>`],
      ["Telefoon", `<a href="tel:${html(String(m.telefoon || "").replace(/[^\d+]/g, ""))}" style="color:${KLEUR.rood};">${html(m.telefoon)}</a>`],
      [isOphalen(m) ? "Ophalen" : "Bezorging", bezorgregel(m)],
      ["Opmerking", m.opmerking ? html(m.opmerking) : ""],
      ["Levering", levering ? html(levering) : ""],
      ["Mollie", html(betaling.id)]
    ]) +
    alinea("De klant heeft een bevestiging gekregen. Antwoorden op deze mail gaan naar de klant.");
  return {
    onderwerp: `Betaald: Hedonist ${m.bestelnummer}, ${m.naam}`,
    html: omhulsel("Nieuwe pre-order Hedonist", `Betaald, ${m.bestelling || ""}`, inhoud)
  };
};

async function verstuur(env, sleutel, aan, antwoordAan, mail) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      // Stuurt Mollie de melding nog een keer, dan verstuurt Resend de mail niet opnieuw
      "Idempotency-Key": sleutel
    },
    body: JSON.stringify({
      from: env.AFZENDER || "VMV Wijnimport <bestellingen@vmvwijnimport.com>",
      to: [aan], reply_to: antwoordAan, subject: mail.onderwerp, html: mail.html
    })
  });
  if (!r.ok) throw new Fout(`Mail versturen mislukt (${r.status})`, 502);
}

// Alleen bij een betaalde pre-order; andere statussen (open, mislukt, verlopen) krijgen geen mail.
// Lukt een mail niet, dan geven we een fout terug; Mollie probeert het later opnieuw.
async function naBetaling(betaling, env, site) {
  if (betaling.status !== "paid" || !betaling.metadata?.bestelnummer) return;
  if (!env.RESEND_API_KEY) throw new Fout("RESEND_API_KEY ontbreekt", 500);
  let levering = "";
  try { levering = (await (await fetch(`${site}/winkel.json`)).json()).levering || ""; } catch (e) {}
  const vmv = env.VMV_MAIL || "info@vmvwijnimport.com";
  const m = betaling.metadata;
  await verstuur(env, `hedonist-vmv-${betaling.id}`, vmv, m.email, mailVmv(betaling, levering));
  await verstuur(env, `hedonist-klant-${betaling.id}`, m.email, vmv, mailKlant(betaling, levering, site));
  await opslaan(betaling, env);
}

// De betaalde bestelling in de backoffice zetten. Een tweede melding van Mollie slaat de database over.
async function opslaan(betaling, env) {
  if (!env.HEDONIST_SLEUTEL) return;
  const m = betaling.metadata;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hedonist_opslaan`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sleutel: env.HEDONIST_SLEUTEL,
      gegevens: {
        mollie_id: betaling.id, bestelnummer: m.bestelnummer, methode: betaling.method || "",
        naam: m.naam, email: m.email, telefoon: m.telefoon, bezorging: m.bezorging, adres: m.adres,
        opmerking: m.opmerking || "", bestelling: m.bestelling || "",
        glazen: m.glazen || "", verzending: m.verzending || "", totaal: betaling.amount.value
      }
    })
  });
  if (!r.ok) throw new Fout(`Opslaan in de backoffice mislukt (${r.status})`, 502);
}

// ---------- Drops: wijn, eventueel samen met glazen (supabase/022-drops.sql) ----------
// De wijn, de prijzen, de voorraad en de bezorgkosten komen uit de database; de glazen uit winkel.json.
// Wat de browser stuurt aan bedragen wordt genegeerd. De database houdt de flessen vast tijdens het
// betalen; mislukt of verloopt de betaling, dan komen ze weer vrij.

async function rpc(functie, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const tekst = await r.text();
  let data = null;
  try { data = tekst ? JSON.parse(tekst) : null; } catch (e) {}
  if (!r.ok) {
    // Een melding uit de database (bijv. "… is uitverkocht") is voor de klant bedoeld
    if (data?.code === "P0001" && data.message) throw new Fout(data.message, 409);
    throw new Fout(`Database gaf een fout (${r.status})`, 502);
  }
  return data;
}

async function maakDropBetaling(invoer, env, site, webhook) {
  const taal = invoer.taal === "en" ? "en" : "nl";
  const en = taal === "en";
  if (!env.HEDONIST_SLEUTEL) throw new Fout(en ? "Ordering isn’t possible right now" : "Bestellen lukt nu niet", 500);

  const k = invoer.klant || {};
  const bezorging = ["verzenden", "amsterdam", "ophalen"].includes(invoer.bezorging) ? invoer.bezorging : "";
  if (!bezorging) throw new Fout(en ? "Choose how you’d like to receive your order" : "Kies hoe je je bestelling wilt ontvangen");
  const verplicht = bezorging === "ophalen" ? ["naam", "email", "telefoon"] : ["naam", "email", "telefoon", "adres", "postcode", "plaats"];
  for (const veld of verplicht) {
    if (!String(k[veld] || "").trim()) throw new Fout(en ? "Please fill in all required fields" : "Vul alle verplichte velden in");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email)) throw new Fout(en ? "Please enter a valid email address" : "Vul een geldig e-mailadres in");
  if (bezorging === "amsterdam" && !isAmsterdam(k.postcode)) {
    throw new Fout(en ? "Delivery in Amsterdam is only possible with an Amsterdam postcode" : "Bezorgen in Amsterdam kan alleen bij een Amsterdamse postcode");
  }
  if (!invoer.achttien) throw new Fout(en ? "You must be 18 or over to order wine" : "Je moet 18 jaar of ouder zijn om wijn te bestellen");

  const wijnen = {};
  for (const [code, aantal] of Object.entries(invoer.wijnen || {})) {
    const a = Math.floor(Number(aantal));
    if (!/^[a-z0-9]{4,16}$/.test(code) || !Number.isFinite(a) || a < 0 || a > 50) throw new Fout("Ongeldig aantal");
    if (a > 0) wijnen[code] = a;
  }
  if (!Object.keys(wijnen).length) throw new Fout(en ? "Your basket is empty" : "Je winkelmandje is leeg");

  // Glazen uit de Hedonist-pre-order mogen mee in dezelfde bestelling
  let glazen = [], glasLevering = "";
  if (Object.values(invoer.glazen || {}).some((a) => Number(a) > 0)) {
    const r = await fetch(`${site}/winkel.json`, { cf: { cacheTtl: 60 } });
    if (!r.ok) throw new Fout("Kon de prijzen niet ophalen", 502);
    const winkel = await r.json();
    if (!winkel.open) throw new Fout(en ? "The Hedonist pre-order is closed" : "De pre-order van de glazen is gesloten");
    glazen = glasRegels(winkel, invoer.glazen).lijst;
    glasLevering = winkel.levering || "";
  }

  const nu = new Date();
  const bestelnummer = `VMV-D${nu.toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const kort = (s, max = 200) => String(s || "").trim().slice(0, max);
  const sleutel = env.HEDONIST_SLEUTEL;

  const b = await rpc("drop_reserveren", {
    sleutel,
    gegevens: {
      bestelnummer, taal, wijnen, glazen, glas_levering: glasLevering, bezorging,
      bezorging_tekst: { verzenden: "Verzenden", amsterdam: "Bezorgen in Amsterdam", ophalen: "Ophalen bij Oocker" }[bezorging],
      naam: kort(k.naam), email: kort(k.email), telefoon: kort(k.telefoon, 40),
      adres: bezorging === "ophalen" ? "Ophalen" : `${kort(k.adres)}, ${kort(k.postcode, 12)} ${kort(k.plaats, 80)}`,
      opmerking: kort(k.opmerking, 500)
    }
  });

  let betaling;
  try {
    betaling = await mollie("/payments", env, {
      amount: { currency: "EUR", value: Number(b.totaal).toFixed(2) },
      description: `${en ? "Order" : "Bestelling"} ${bestelnummer}`,
      redirectUrl: `${site}/bestelling/`,
      webhookUrl: webhook,
      locale: en ? "en_US" : "nl_NL",
      // Alleen iDEAL: die betaling is binnen een kwartier rond, zodat de flessen niet dagen vastliggen
      method: ["ideal"],
      billingEmail: kort(k.email),
      metadata: { soort: "drop", bestelnummer }
    });
  } catch (e) {
    await rpc("drop_vervallen", { bestelnummer, sleutel }).catch(() => {});
    throw e;
  }
  // Lukt dit niet, dan vindt de webhook de bestelling alsnog via het bestelnummer
  await rpc("drop_koppelen", { bestelnummer, mollie: betaling.id, sleutel }).catch(() => {});

  return { id: betaling.id, betaallink: betaling._links.checkout.href, bestelnummer, totaal: Number(b.totaal) };
}

// De regels, de bezorgkosten en het totaal (incl. btw)
const dropTabel = (b, en) => {
  const cel = `font-family:${LETTER};font-size:15px;color:${KLEUR.zwart};border-bottom:1px solid ${KLEUR.lijn};`;
  const rijen = (b.regels || []).map((r) => `<tr><td style="${cel}padding:12px 12px 12px 0;line-height:1.45;">${r.aantal} × ${html(r.naam)}</td>
    <td align="right" style="${cel}padding:12px 0;white-space:nowrap;">${euro(r.bedrag)}</td></tr>`).join("");
  const regel = (label, bedrag, vet) => {
    const st = `font-family:${LETTER};font-size:${vet ? 16 : 14}px;${vet ? "font-weight:500;" : ""}color:${vet ? KLEUR.zwart : KLEUR.tekst};border-bottom:1px solid ${KLEUR.lijn};`;
    return `<tr><td style="${st}padding:8px 12px 8px 0;">${label}</td><td align="right" style="${st}padding:8px 0;white-space:nowrap;">${bedrag}</td></tr>`;
  };
  const verzending = Number(b.verzending || 0);
  const label = isOphalen(b) ? (en ? "Pick-up" : "Ophalen") : b.bezorging === "Bezorgen in Amsterdam" ? (en ? "Delivery" : "Bezorgen") : (en ? "Shipping" : "Verzending");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid ${KLEUR.zwart};">
    ${rijen}${regel(label, verzending ? euro(verzending) : (en ? "Free" : "Gratis"))}${regel(en ? "Total incl. VAT" : "Totaal incl. btw", euro(b.totaal), true)}
  </table>`;
};

// Wanneer de wijn en de glazen komen, zoals bij de drop en in winkel.json staat
const dropLevering = (b, en) => (b.regels || [])
  .map((r) => {
    const tekst = en && r.soort === "wijn" ? (r.levering_en || r.levering) : r.levering;
    if (!tekst) return "";
    if (r.soort === "glas") return en ? `Hedonist glasses: expected in ${tekst}` : `Hedonist-glazen: verwacht in ${tekst}`;
    return `${r.naam}: ${tekst}`;
  })
  .filter((t, i, lijst) => t && lijst.indexOf(t) === i)
  .map(html).join("<br>");

export const dropMailKlant = (b, site) => {
  const en = b.taal === "en";
  const bezorging = isOphalen(b) ? (en ? "Pick-up at Oocker, Frederiksplein 29h, Amsterdam" : bezorgregel(b))
    : en ? `${b.bezorging === "Bezorgen in Amsterdam" ? "Delivery in Amsterdam" : "Shipping"}<br>${html(b.adres)}` : bezorgregel(b);
  const inhoud = en
    ? alinea(`Dear ${html(b.naam)},`) +
      alinea("Thank you for your order. Your payment has come in. Below is what you ordered.") +
      dropTabel(b, true) +
      gegevens([
        ["Order number", html(b.bestelnummer)],
        ["Delivery", dropLevering(b, true)],
        [isOphalen(b) ? "Pick-up" : "Address", bezorging],
        ["Note", b.opmerking ? html(b.opmerking) : ""]
      ]) +
      alinea(isOphalen(b) ? "We’ll let you know when your order is ready for pick-up. We’ll send you the invoice separately by email." : "We’ll let you know when we deliver or ship your order. We’ll send you the invoice separately by email.") +
      alinea("We may ask for ID on delivery or pick-up: we only deliver wine to people aged 18 or over.") +
      alinea(`You have a 14-day cooling-off period. Read more in our <a href="${site}/algemene-voorwaarden/" style="color:${KLEUR.rood};">terms and conditions</a> (in Dutch).`) +
      alinea(`Any questions? Email us at <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.rood};">info@vmvwijnimport.com</a> or send a WhatsApp to +31 6 15 74 23 32.`)
    : alinea(`Beste ${html(b.naam)},`) +
      alinea("Bedankt voor je bestelling. Je betaling is binnen. Hieronder staat wat je hebt besteld.") +
      dropTabel(b) +
      gegevens([
        ["Bestelnummer", html(b.bestelnummer)],
        ["Levering", dropLevering(b)],
        [isOphalen(b) ? "Ophalen" : "Bezorging", bezorging],
        ["Opmerking", b.opmerking ? html(b.opmerking) : ""]
      ]) +
      alinea(isOphalen(b) ? "We laten je weten wanneer je je bestelling kunt ophalen. De factuur sturen we je apart per mail." : "We laten je weten wanneer we je bestelling brengen of versturen. De factuur sturen we je apart per mail.") +
      alinea("Bij de bezorging of het ophalen kunnen we om je legitimatie vragen: we leveren wijn alleen aan mensen van 18 jaar en ouder.") +
      alinea(`Je hebt 14 dagen bedenktijd. Lees meer over het <a href="${site}/algemene-voorwaarden/#herroepingsrecht" style="color:${KLEUR.rood};">herroepingsrecht</a> en de <a href="${site}/algemene-voorwaarden/" style="color:${KLEUR.rood};">algemene voorwaarden</a>.`) +
      alinea(`Vragen? Mail ons op <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.rood};">info@vmvwijnimport.com</a> of stuur een WhatsApp naar 06 15 74 23 32.`);
  const kop = en ? "Thank you for your order" : "Bedankt voor je bestelling";
  const mail = omhulsel(kop, en ? "Your payment has come in." : "Je betaling is binnen.", inhoud);
  return {
    onderwerp: `${kop} ${b.bestelnummer}`,
    html: en ? mail.replace('<html lang="nl">', '<html lang="en">') : mail
  };
};

export const dropMailVmv = (b, mollieId) => {
  const naam = { ideal: "iDEAL", banktransfer: "Bankoverschrijving" }[b.methode] || b.methode || "";
  const inhoud =
    vlak(`<strong style="font-weight:500;">Betaald via ${html(naam)}.</strong> Maak de factuur in e-Boekhouden. De bestelling staat in de backoffice onder Webwinkel.`) +
    (b.te_veel ? vlak(`<strong style="font-weight:500;color:${KLEUR.rood};">Let op: van deze drop is nu meer verkocht dan het aantal flessen.</strong> De betaling kwam binnen nadat de reservering was verlopen. Neem contact op met de klant.`) : "") +
    dropTabel(b) +
    gegevens([
      ["Bestelnummer", html(b.bestelnummer)],
      ["Klant", html(b.naam)],
      ["E-mail", `<a href="mailto:${html(b.email)}" style="color:${KLEUR.rood};">${html(b.email)}</a>`],
      ["Telefoon", `<a href="tel:${html(String(b.telefoon || "").replace(/[^\d+]/g, ""))}" style="color:${KLEUR.rood};">${html(b.telefoon)}</a>`],
      [isOphalen(b) ? "Ophalen" : "Bezorging", bezorgregel(b)],
      ["Levering", dropLevering(b)],
      ["Opmerking", b.opmerking ? html(b.opmerking) : ""],
      ["Mollie", html(mollieId)]
    ]) +
    alinea("De klant heeft een bevestiging gekregen. Antwoorden op deze mail gaan naar de klant.");
  const wat = (b.regels || []).map((r) => `${r.aantal} × ${r.naam}`).join(", ");
  return {
    onderwerp: `Betaald: ${b.te_veel ? "LET OP te veel verkocht, " : ""}bestelling ${b.bestelnummer}, ${b.naam}${b.taal === "en" ? " (Engelse site)" : ""}`,
    html: omhulsel("Nieuwe bestelling", `Betaald, ${wat}`, inhoud)
  };
};

// Betaald: vastleggen en mailen. Mislukt, afgebroken of verlopen: de flessen komen vrij.
// Lukt iets niet, dan geven we een fout terug; Mollie probeert het later opnieuw.
async function naDropBetaling(betaling, env, site) {
  const bestelnummer = betaling.metadata?.bestelnummer;
  if (!bestelnummer) return;
  if (!env.HEDONIST_SLEUTEL) throw new Fout("HEDONIST_SLEUTEL ontbreekt", 500);
  if (["expired", "canceled", "failed"].includes(betaling.status)) {
    await rpc("drop_vervallen", { bestelnummer, sleutel: env.HEDONIST_SLEUTEL });
    return;
  }
  if (betaling.status !== "paid") return;
  if (!env.RESEND_API_KEY) throw new Fout("RESEND_API_KEY ontbreekt", 500);
  const b = await rpc("drop_betaald", { bestelnummer, mollie: betaling.id, methode: betaling.method || "", sleutel: env.HEDONIST_SLEUTEL });
  if (!b) throw new Fout("Bestelling niet gevonden", 404);
  const vmv = env.VMV_MAIL || "info@vmvwijnimport.com";
  await verstuur(env, `drop-vmv-${betaling.id}`, vmv, b.email, dropMailVmv(b, betaling.id));
  await verstuur(env, `drop-klant-${betaling.id}`, b.email, vmv, dropMailKlant(b, site));
}
