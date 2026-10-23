// Bestelmails voor het horecaportaal (Supabase Edge Function "bestelmail").
//
// 1. Bestelmails. De database roept deze functie aan (supabase/005 en 006) met alleen het id van een
//    bestelling: bij een nieuwe bestelling, en wanneer de status "bevestigd" of "geannuleerd" wordt.
// 2. Welkomstmail. De database roept deze functie aan (supabase/008) met het id van een klant
//    zodra zijn account is goedgekeurd.
//    De functie leest alles zelf uit de database en verstuurt elke mail maar één keer.
// 3. Weekoverzicht. Elke zondagavond roept de database deze functie aan (supabase/009) voor een mail
//    aan VMV met de bevestigde bestellingen die nog geleverd moeten worden. Hooguit één per 20 uur.
// 4. GET ?beeld=kop geeft de kopband van de mails (zwart met het witte logo).
// Bestellingen afhandelen gebeurt in de backoffice op /horeca/beheer/ (inloggen als beheerder);
// de knoppen in de mail aan VMV openen die pagina.
//
// Instellingen in Supabase → Edge Functions → Secrets (niets hiervan staat in de repository):
//   RESEND_API_KEY  de sleutel uit Resend (verplicht)
//   VMV_MAIL        het adres van VMV; standaard info@vmvwijnimport.com
//   AFZENDER        standaard "VMV Wijnimport <onboarding@resend.dev>";
//                   met eigen domein: "VMV Wijnimport <bestellingen@vmvwijnimport.com>"
//   KLANTMAIL       "aan": mails gaan naar de klant zelf. Anders gaan ze naar VMV om door te sturen.
//   BEHEER_URL      alleen om te testen; standaard de backoffice op de site

const SITE = "https://vmvwijnimport.com";
const KLEUR = {
  zwart: "#000000", tekst: "#3A3A3A", zacht: "#6B6B6B", wit: "#FFFFFF", donkerTekst: "#CFCFCF",
  rood: "#731515", champagneLicht: "#F8F7E6", lijn: "#E6E4DC"
};
const LETTER = "'Jost', 'Helvetica Neue', Helvetica, Arial, sans-serif";

// ---------- Hulpjes ----------
export const euro = (n) =>
  "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const centen = (n) => Math.round(Number(n) * 100);
const html = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const datum = (d) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
const adres = (k) => `${k.straat}, ${k.postcode} ${k.plaats}`;
const kopband = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/bestelmail?beeld=kop`;
const beheerUrl = () => Deno.env.get("BEHEER_URL") || `${SITE}/horeca/beheer/`;

// Bedragen van een bestelling. Bij een bevestiging telt het aantal dat VMV levert
// (toegewezen; leeg = het bestelde aantal); de prijs per stuk blijft die van de bestelling.
export const reken = (regels, bevestigd) => {
  let totaal = 0;
  const rijen = regels.map((r) => {
    const aantal = bevestigd && r.toegewezen != null ? r.toegewezen : r.aantal;
    const bedrag = bevestigd ? centen(r.prijs_ex) * aantal / 100 : Number(r.regel_ex);
    totaal += centen(bedrag);
    return { ...r, getoond: aantal, bedrag };
  });
  const btw = Math.round(totaal * 0.21);
  return { rijen, ex: totaal / 100, btw: btw / 100, incl: (totaal + btw) / 100 };
};

// ---------- Bouwstenen van de mail ----------
const alinea = (tekst, stijl = "") =>
  `<p style="margin:0 0 16px;font-family:${LETTER};font-size:16px;line-height:1.55;color:${KLEUR.tekst};${stijl}">${tekst}</p>`;

const vlak = (inhoud) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
     <td style="background:${KLEUR.champagneLicht};padding:16px 20px;font-family:${LETTER};font-size:15px;line-height:1.55;color:${KLEUR.zwart};">${inhoud}</td>
   </tr></table>`;

const kopje = (tekst) =>
  `<p style="margin:32px 0 8px;font-family:${LETTER};font-size:17px;font-weight:500;color:${KLEUR.zwart};">${tekst}</p>`;

// Knop die in alle mailprogramma's werkt: een tabelcel met een link erin
const knop = (tekst, link, primair) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:0 8px 8px 0;"><tr>
     <td style="background:${primair ? KLEUR.zwart : KLEUR.wit};border:1px solid ${primair ? KLEUR.zwart : KLEUR.rood};">
       <a href="${html(link)}" style="display:inline-block;padding:14px 28px;font-family:${LETTER};font-size:15px;font-weight:500;line-height:1;text-decoration:none;color:${primair ? KLEUR.wit : KLEUR.rood};">${tekst}</a>
     </td></tr></table>`;

const regelTabel = (berekend, notitie) => {
  const cel = `font-family:${LETTER};font-size:15px;color:${KLEUR.zwart};border-bottom:1px solid ${KLEUR.lijn};`;
  const rijen = berekend.rijen.map((r) => {
    const n = notitie(r);
    return `<tr>
      <td valign="top" style="${cel}padding:12px 12px 12px 0;white-space:nowrap;">${r.getoond} ×</td>
      <td valign="top" style="${cel}padding:12px 12px 12px 0;line-height:1.45;">${html(r.omschrijving)}${n ? `<br><span style="font-size:13px;color:${KLEUR.zacht};">${n}</span>` : ""}</td>
      <td valign="top" align="right" style="${cel}padding:12px 0;white-space:nowrap;">${euro(r.bedrag)}</td>
    </tr>`;
  }).join("");
  const totaal = (label, bedrag, vet) => {
    const s = `font-family:${LETTER};font-size:${vet ? 16 : 14}px;${vet ? "font-weight:500;" : ""}color:${vet ? KLEUR.zwart : KLEUR.tekst};border-bottom:1px solid ${KLEUR.lijn};`;
    return `<tr><td></td><td style="${s}padding:8px 12px 8px 0;">${label}</td><td align="right" style="${s}padding:8px 0;white-space:nowrap;">${euro(bedrag)}</td></tr>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border-top:1px solid ${KLEUR.zwart};">
    ${rijen}${totaal("Totaal excl. btw", berekend.ex)}${totaal("Btw 21%", berekend.btw)}${totaal("Totaal incl. btw", berekend.incl, true)}
  </table>`;
};

const gegevens = (paren) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${paren
    .filter((p) => p[1])
    .map(([k, v]) => `<tr>
      <td valign="top" style="padding:6px 16px 6px 0;font-family:${LETTER};font-size:14px;color:${KLEUR.zacht};white-space:nowrap;width:1%;">${k}</td>
      <td valign="top" style="padding:6px 0;font-family:${LETTER};font-size:15px;line-height:1.45;color:${KLEUR.zwart};">${v}</td></tr>`)
    .join("")}</table>`;

// De hele mail: zwarte kopband met logo, inhoud, zwarte voet (zonder adres: dat staat alleen in de voorwaarden).
// De kopband is een afbeelding zonder doorzichtige delen, zodat het logo ook in donkere modus zichtbaar blijft.
const omhulsel = ({ voorvertoning, kop, inhoud, doorsturen }, ctx) => `<!doctype html>
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
      <a href="${SITE}/"><img src="${ctx.kopband}" width="600" alt="VMV wijnimport" style="display:block;border:0;width:100%;max-width:600px;height:auto;"></a>
    </td></tr>
    ${doorsturen ? `<tr><td class="vak" style="padding:32px 32px 0;">${vlak(`<strong style="font-weight:500;">Nog niet naar de klant verstuurd.</strong><br>Stuur deze mail door naar <a href="mailto:${html(doorsturen)}" style="color:${KLEUR.rood};">${html(doorsturen)}</a>.`)}</td></tr>` : ""}
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

const korting = (r) => r.korting_pct > 0 ? `${String(Number(r.korting_pct)).replace(".", ",")}% schenkkorting` : "";

const bestelGegevens = (b, k) => gegevens([
  ["Bestelnummer", html(b.bestelnummer)],
  ["Besteld op", datum(b.besteld_op)],
  ["Afleveren bij", `${html(k.bedrijfsnaam)}<br>${html(adres(k))}`],
  ["Spoed", b.spoed ? "Ja" : ""],
  ["Opmerking", b.opmerking ? html(b.opmerking) : ""]
]);

const contactRegel = `Vragen? Mail ons op <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.rood};">info@vmvwijnimport.com</a> of stuur een WhatsApp naar 06 15 74 23 32.`;

// ---------- De mails ----------

// Naar de klant, direct na het bestellen: een overzicht, nog géén bevestiging
export const mailAanvraag = (b, k, termijn, doorsturen, ctx) => {
  const berekend = reken(b.bestelregels, false);
  const inhoud =
    alinea(`Beste ${html(k.contactpersoon)},`) +
    alinea("Bedankt voor je bestelling bij VMV Wijnimport. Hieronder staat een overzicht van wat je hebt aangevraagd.") +
    vlak(`<strong style="font-weight:500;">Dit is nog geen bevestiging.</strong><br>We controleren eerst de voorraad. Zodra je bestelling definitief is, sturen we je een bevestiging.${b.bevat_aanvraag ? " Voor wijnen op allocatie bevestigen we dan ook het aantal dat we kunnen leveren." : ""}`) +
    regelTabel(berekend, (r) => [korting(r), r.allocatie ? "op allocatie: we bevestigen het aantal dat we kunnen leveren" : ""].filter(Boolean).join(", ")) +
    alinea("Prijzen excl. btw.", `font-size:13px;color:${KLEUR.zacht};margin-top:8px;`) +
    kopje("Je bestelling") + bestelGegevens(b, k) +
    alinea(`Klopt er iets niet? Mail ons op <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.rood};">info@vmvwijnimport.com</a> en vermeld je bestelnummer. Na levering ontvang je een factuur met een betaaltermijn van ${termijn} dagen.`, "margin:24px 0 0;");
  return {
    onderwerp: `Overzicht van je bestelaanvraag ${b.bestelnummer} (nog niet bevestigd)`,
    html: omhulsel({ voorvertoning: "Dit is nog geen bevestiging. We controleren eerst de voorraad.", kop: "We hebben je bestelaanvraag ontvangen", inhoud, doorsturen }, ctx)
  };
};

// Naar VMV, direct na het bestellen, met knoppen om de bestelling af te handelen
export const mailVmv = (b, k, ctx) => {
  const berekend = reken(b.bestelregels, false);
  const inhoud =
    (b.spoed ? vlak(`<strong style="font-weight:500;color:${KLEUR.rood};">Deze bestelling heeft spoed.</strong>`) : "") +
    `<div style="margin:0 0 24px;">${knop("Bevestigen", ctx.beheer("bevestigen"), true)}${knop("Bevestigen met wijziging", ctx.beheer("wijzigen"))}${knop("Afkeuren", ctx.beheer("afkeuren"))}</div>` +
    regelTabel(berekend, (r) => [korting(r), r.allocatie ? "allocatie: kies hoeveel je levert via Bevestigen met wijziging" : ""].filter(Boolean).join(", ")) +
    kopje("Klant") +
    gegevens([
      ["Zaak", html(k.bedrijfsnaam)],
      ["Contact", html(k.contactpersoon)],
      ["Telefoon", `<a href="tel:${html(k.telefoon.replace(/\s/g, ""))}" style="color:${KLEUR.zwart};">${html(k.telefoon)}</a>`],
      ["E-mail", `<a href="mailto:${html(k.email)}" style="color:${KLEUR.zwart};">${html(k.email)}</a>`],
      ["Afleveradres", html(adres(k))],
      ["KvK / btw", `${html(k.kvk)} / ${html(k.btw)}`]
    ]) +
    kopje("Bestelling") +
    gegevens([
      ["Bestelnummer", html(b.bestelnummer)],
      ["Besteld op", datum(b.besteld_op)],
      ["Opmerking", b.opmerking ? html(b.opmerking) : ""]
    ]) +
    alinea("De klant krijgt na je keuze automatisch een mail. Na het bevestigen maak je de factuur in e-Boekhouden.", `font-size:14px;color:${KLEUR.zacht};margin:24px 0 0;`);
  return {
    onderwerp: `Nieuwe bestelling ${b.bestelnummer} – ${k.bedrijfsnaam}${b.spoed ? " – SPOED" : ""}`,
    html: omhulsel({ voorvertoning: `${k.bedrijfsnaam}: ${euro(berekend.ex)} excl. btw`, kop: `Nieuwe bestelling van ${k.bedrijfsnaam}`, inhoud }, ctx)
  };
};

// Naar de klant, wanneer VMV de bestelling bevestigt
export const mailBevestiging = (b, k, termijn, doorsturen, ctx) => {
  const berekend = reken(b.bestelregels, true);
  const aangepast = berekend.rijen.some((r) => r.getoond !== r.aantal);
  const inhoud =
    alinea(`Beste ${html(k.contactpersoon)},`) +
    alinea(`We hebben je bestelling ${html(b.bestelnummer)} bevestigd. Hieronder staat wat we leveren.${aangepast ? " Van een of meer wijnen kunnen we minder leveren dan je had besteld; dat staat erbij." : ""}`) +
    (b.bericht_klant ? vlak(html(b.bericht_klant).replace(/\n/g, "<br>")) : "") +
    regelTabel(berekend, (r) =>
      r.getoond === 0 ? `niet leverbaar (besteld: ${r.aantal})`
        : r.getoond !== r.aantal ? `besteld: ${r.aantal}, we leveren: ${r.getoond}` : "") +
    alinea("Prijzen excl. btw.", `font-size:13px;color:${KLEUR.zacht};margin-top:8px;`) +
    kopje("Levering") + bestelGegevens(b, k) +
    alinea(`Na levering ontvang je een factuur met een betaaltermijn van ${termijn} dagen. ${contactRegel}`, "margin:24px 0 0;");
  return {
    onderwerp: `Je bestelling ${b.bestelnummer} is bevestigd`,
    html: omhulsel({ voorvertoning: "Je bestelling is bevestigd.", kop: "Je bestelling is bevestigd", inhoud, doorsturen }, ctx)
  };
};

// Naar de klant, wanneer VMV de bestelling afkeurt
export const mailAfgekeurd = (b, k, doorsturen, ctx) => {
  const inhoud =
    alinea(`Beste ${html(k.contactpersoon)},`) +
    alinea(`Helaas kunnen we je bestelling ${html(b.bestelnummer)} van ${datum(b.besteld_op)} niet leveren. Je hoeft niets te betalen.`) +
    (b.bericht_klant ? vlak(html(b.bericht_klant).replace(/\n/g, "<br>")) : "") +
    alinea(`Wil je iets anders bestellen, of overleggen wat wel kan? Mail ons op <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.rood};">info@vmvwijnimport.com</a> of stuur een WhatsApp naar 06 15 74 23 32.`);
  return {
    onderwerp: `Je bestelling ${b.bestelnummer} kan niet doorgaan`,
    html: omhulsel({ voorvertoning: "We kunnen je bestelling niet leveren.", kop: "We kunnen je bestelling niet leveren", inhoud, doorsturen }, ctx)
  };
};

// Naar de klant, zodra VMV het account heeft goedgekeurd
export const mailWelkom = (k, doorsturen, ctx) => {
  const inhoud =
    alinea(`Beste ${html(k.contactpersoon)},`) +
    alinea(`Je account voor het horecaportaal van VMV Wijnimport is goedgekeurd. Log in met je e-mailadres en wachtwoord. Je ziet dan onze horecaprijzen en kunt direct bestellen voor ${html(k.bedrijfsnaam)}.`) +
    `<div style="margin:8px 0 24px;">${knop("Naar het horecaportaal", `${SITE}/horeca/`, true)}</div>` +
    alinea("Je bestelt op factuur. Elke bestelling bevestigen we eerst; je krijgt daarvan een mail.") +
    alinea(contactRegel);
  return {
    onderwerp: "Je account voor het horecaportaal is goedgekeurd",
    html: omhulsel({ voorvertoning: "Je kunt nu inloggen en bestellen.", kop: "Welkom bij VMV Wijnimport", inhoud, doorsturen }, ctx)
  };
};

// Naar VMV, elke zondagavond: wat er nog geleverd moet worden, op postcode, met een laadlijst
const postcode = (b) => (b.klanten ? b.klanten.postcode : "").replace(/\s/g, "").toUpperCase();
export const mailWeekoverzicht = (teLeveren, nieuw, ctx) => {
  const lijst = [...teLeveren].sort((x, y) => postcode(x) < postcode(y) ? -1 : postcode(x) > postcode(y) ? 1 : x.id - y.id);
  const aantal = (r) => r.toegewezen != null ? r.toegewezen : r.aantal;
  const laden = new Map();
  const blokken = lijst.map((b) => {
    const k = b.klanten;
    const regels = b.bestelregels.filter((r) => aantal(r) > 0);
    regels.forEach((r) => laden.set(r.omschrijving, (laden.get(r.omschrijving) || 0) + aantal(r)));
    const kaart = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres(k))}`;
    return kopje(`${html(k.bedrijfsnaam)}${b.spoed ? ` <span style="color:${KLEUR.rood};">· spoed</span>` : ""}`) +
      gegevens([
        ["Adres", `<a href="${kaart}" style="color:${KLEUR.zwart};">${html(adres(k))}</a>`],
        ["Contact", `${html(k.contactpersoon)}, <a href="tel:${html(k.telefoon.replace(/\s/g, ""))}" style="color:${KLEUR.zwart};">${html(k.telefoon)}</a>`],
        ["Bestelling", `<a href="${html(ctx.beheer(b.id))}" style="color:${KLEUR.zwart};">${html(b.bestelnummer)}</a>, ${datum(b.besteld_op)}`],
        ["Leveren", regels.map((r) => `${aantal(r)} × ${html(r.omschrijving)}`).join("<br>")],
        ["Bericht aan klant", b.bericht_klant ? html(b.bericht_klant) : ""]
      ]);
  }).join("");
  const laadlijst = [...laden.entries()].sort((x, y) => x[0].localeCompare(y[0], "nl"))
    .map(([oms, n]) => `${n} × ${html(oms)}`).join("<br>");
  const inhoud =
    alinea(lijst.length
      ? `Er ${lijst.length === 1 ? "staat 1 bevestigde bestelling" : `staan ${lijst.length} bevestigde bestellingen`} klaar om te leveren, gesorteerd op postcode. Zet ze na het bezorgen op geleverd in de backoffice.`
      : "Er staan geen bevestigde bestellingen klaar om te leveren.") +
    (nieuw ? vlak(`<strong style="font-weight:500;">${nieuw === 1 ? "Er wacht nog 1 nieuwe bestelling" : `Er wachten nog ${nieuw} nieuwe bestellingen`} op bevestiging.</strong>`) : "") +
    `<div style="margin:8px 0 8px;">${knop("Open de backoffice", ctx.backoffice, true)}</div>` +
    blokken +
    (laadlijst ? kopje("Laadlijst (alles bij elkaar)") + alinea(laadlijst, "font-size:15px;color:" + KLEUR.zwart + ";") : "");
  return {
    onderwerp: lijst.length ? `Te leveren: ${lijst.length} ${lijst.length === 1 ? "bestelling" : "bestellingen"}` : `${nieuw} ${nieuw === 1 ? "bestelling wacht" : "bestellingen wachten"} op bevestiging`,
    html: omhulsel({ voorvertoning: lijst.map((b) => b.klanten.bedrijfsnaam).join(", ") || "Nieuwe bestellingen wachten op bevestiging", kop: "Weekoverzicht leveringen", inhoud }, ctx)
  };
};

// ---------- Versturen ----------
const verstuur = async (aan, antwoordAan, mail) => {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("AFZENDER") || "VMV Wijnimport <onboarding@resend.dev>",
      to: [aan], reply_to: antwoordAan, subject: mail.onderwerp, html: mail.html
    })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
};

// Zet een tijdstempel als "verstuurd"; lukt dat niet (al gezet), dan is de mail al eens verstuurd
const claim = async (db, id, kolom) => {
  const { data } = await db.from("bestellingen").update({ [kolom]: new Date().toISOString() })
    .eq("id", id).is(kolom, null).select("id");
  return !!(data && data.length);
};

const metClaim = async (db, id, kolom, verstuurFn) => {
  if (!(await claim(db, id, kolom))) return false;
  try { await verstuurFn(); return true; } catch (e) {
    await db.from("bestellingen").update({ [kolom]: null }).eq("id", id);
    throw e;
  }
};

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const antwoord = (data, status = 200) => Response.json(data, { status, headers: CORS });

const laadBestelling = async (db, id) => {
  const { data, error } = await db.from("bestellingen")
    .select("*, klanten(*), bestelregels(*)").eq("id", id)
    .order("id", { referencedTable: "bestelregels" }).maybeSingle();
  if (error) throw error;
  return data;
};

// ---------- Mails versturen (aanroep door de database) ----------
const mailsVoor = async (db, id) => {
  const b = await laadBestelling(db, id);
  if (!b) return antwoord({ fout: "onbekende bestelling" }, 404);
  const { data: inst } = await db.from("instellingen").select("betaaltermijn_dagen").maybeSingle();
  const termijn = inst ? inst.betaaltermijn_dagen : 14;
  const k = b.klanten;
  const vmv = Deno.env.get("VMV_MAIL") || "info@vmvwijnimport.com";
  const naarKlant = Deno.env.get("KLANTMAIL") === "aan";
  const klantAdres = naarKlant ? k.email : vmv;
  const doorsturen = naarKlant ? null : k.email;
  const ctx = {
    kopband: kopband(),
    beheer: (actie) => `${beheerUrl()}?id=${id}&actie=${actie}`
  };
  const verstuurd = [];

  if (await metClaim(db, id, "mail_aanvraag_op", async () => {
    await verstuur(vmv, k.email, mailVmv(b, k, ctx));
    // Zonder eigen domein gaat het overzicht niet naar de klant: die krijgt dan de mail van FormSubmit
    if (naarKlant) await verstuur(klantAdres, vmv, mailAanvraag(b, k, termijn, doorsturen, ctx));
  })) verstuurd.push("aanvraag");
  if (b.status === "bevestigd" && await metClaim(db, id, "mail_bevestiging_op",
    () => verstuur(klantAdres, vmv, mailBevestiging(b, k, termijn, doorsturen, ctx)))) verstuurd.push("bevestiging");
  if (b.status === "geannuleerd" && await metClaim(db, id, "mail_annulering_op",
    () => verstuur(klantAdres, vmv, mailAfgekeurd(b, k, doorsturen, ctx)))) verstuurd.push("afgekeurd");
  return antwoord({ verstuurd });
};

// ---------- Welkomstmail (aanroep door de database bij goedkeuring) ----------
const welkomVoor = async (db, id) => {
  const { data: k, error } = await db.from("klanten").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!k) return antwoord({ fout: "onbekende klant" }, 404);
  if (k.status !== "goedgekeurd") return antwoord({ verstuurd: [] });
  // Tijdstempel zetten; lukt dat niet (al gezet), dan is de mail al eens verstuurd
  const { data: gezet } = await db.from("klanten").update({ mail_welkom_op: new Date().toISOString() })
    .eq("id", id).is("mail_welkom_op", null).select("id");
  if (!(gezet && gezet.length)) return antwoord({ verstuurd: [] });
  const vmv = Deno.env.get("VMV_MAIL") || "info@vmvwijnimport.com";
  const naarKlant = Deno.env.get("KLANTMAIL") === "aan";
  try {
    await verstuur(naarKlant ? k.email : vmv, vmv, mailWelkom(k, naarKlant ? null : k.email, { kopband: kopband() }));
  } catch (e) {
    await db.from("klanten").update({ mail_welkom_op: null }).eq("id", id);
    throw e;
  }
  return antwoord({ verstuurd: ["welkom"] });
};

// ---------- Weekoverzicht (aanroep door de database, elke zondagavond) ----------
const weekoverzicht = async (db) => {
  // Tijdstempel zetten; lukt dat niet, dan is er de afgelopen 20 uur al een verstuurd
  const grens = new Date(Date.now() - 20 * 3600e3).toISOString();
  const { data: gezet, error: fout } = await db.from("instellingen").update({ weekoverzicht_op: new Date().toISOString() })
    .eq("id", 1).or(`weekoverzicht_op.is.null,weekoverzicht_op.lt.${grens}`).select("id");
  if (fout) throw fout;
  if (!(gezet && gezet.length)) return antwoord({ verstuurd: [] });
  const { data: teLeveren, error } = await db.from("bestellingen")
    .select("*, klanten(*), bestelregels(*)").eq("status", "bevestigd").order("id", { referencedTable: "bestelregels" });
  if (error) throw error;
  const { count: nieuw } = await db.from("bestellingen").select("id", { count: "exact", head: true }).eq("status", "ontvangen");
  if (!teLeveren.length && !nieuw) return antwoord({ verstuurd: [] });
  const vmv = Deno.env.get("VMV_MAIL") || "info@vmvwijnimport.com";
  try {
    await verstuur(vmv, vmv, mailWeekoverzicht(teLeveren, nieuw || 0, {
      kopband: kopband(),
      backoffice: `${beheerUrl()}#bestellingen`,
      beheer: (id) => `${beheerUrl()}#bestelling-${id}`
    }));
  } catch (e) {
    await db.from("instellingen").update({ weekoverzicht_op: null }).eq("id", 1);
    throw e;
  }
  return antwoord({ verstuurd: ["weekoverzicht"] });
};

if (typeof Deno !== "undefined") Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method === "GET") {
    if (new URL(req.url).searchParams.get("beeld") === "kop") {
      return new Response(Uint8Array.from(atob(KOPBAND), (c) => c.charCodeAt(0)), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000" }
      });
    }
    return new Response("niet gevonden", { status: 404 });
  }
  try {
    const vraag = await req.json();
    const klant = typeof vraag.klant === "string" && /^[0-9a-f-]{36}$/i.test(vraag.klant);
    const week = vraag.weekoverzicht === true;
    if (!klant && !week && !Number.isInteger(vraag.id)) return antwoord({ fout: "geen geldig id" }, 400);
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (week) return await weekoverzicht(db);
    return klant ? await welkomVoor(db, vraag.klant) : await mailsVoor(db, vraag.id);
  } catch (e) {
    console.error(e);
    return antwoord({ fout: "Er ging iets mis. Probeer het opnieuw." }, 500);
  }
});

// Kopband van de mails: 1200 × 200 pixels, zwart met het witte logo (brand/logo/png/vmv-mailkop-1200.png)
const KOPBAND = "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";
