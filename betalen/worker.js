// ------------------------------------------------------------------
//  VMV Wijnimport — koppeling tussen de website en Mollie
//  Draait als Cloudflare Worker. Zie betalen/INSTELLEN.md.
//
//  Instellingen in Cloudflare (Settings → Variables and Secrets):
//    MOLLIE_API_KEY  (geheim)  test_... of live_...
//    SITE_URL                  bijv. https://vmvwijnimport.github.io/VMV-Wijnimport
//
//  Endpoints:
//    POST /betaling        maakt een Mollie-betaling aan, geeft de betaallink terug
//    GET  /status?id=tr_…  geeft de status van een betaling terug
// ------------------------------------------------------------------

const MOLLIE = "https://api.mollie.com/v2";

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

    const pad = new URL(request.url).pathname;
    try {
      if (pad === "/betaling" && request.method === "POST") {
        return antwoord(await maakBetaling(await request.json(), env, site));
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
export function bereken(winkel, aantallen, bezorging) {
  let n = 0, glazen = 0;
  const regels = [];
  for (const [id, naam] of Object.entries(winkel.modellen)) {
    const a = Math.floor(Number(aantallen?.[id] || 0));
    if (!Number.isFinite(a) || a < 0 || a > 120) throw new Fout("Ongeldig aantal");
    if (a === 0) continue;
    const prijs = Math.floor(a / 6) * winkel.prijsZes + (a % 6) * winkel.prijsGlas;
    n += a; glazen += prijs;
    regels.push(`${a} × ${naam}`);
  }
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

async function maakBetaling(invoer, env, site) {
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
    locale: "nl_NL",
    method: ["ideal", "banktransfer"],
    billingEmail: kort(k.email),
    metadata: {
      bestelnummer,
      bestelling: b.regels.join(", "),
      bezorging: { amsterdam: "Bezorgen in Amsterdam", ophalen: "Ophalen bij Oocker" }[bezorging] || "Verzenden",
      verzending: b.verzending.toFixed(2),
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
