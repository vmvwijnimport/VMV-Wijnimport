// Bestelmails voor het horecaportaal, in de huisstijl van VMV (Supabase Edge Function "bestelmail").
//
// De database roept deze functie aan (supabase/005-bestelmails.sql) met alleen het id van een
// bestelling: bij een nieuwe bestelling en wanneer VMV de status op "bevestigd" zet. De functie
// leest alles zelf uit de database en verstuurt elke mail maar één keer. Een losse aanroep van
// buitenaf kan dus geen extra of valse mails veroorzaken.
//
// Instellingen in Supabase → Edge Functions → Secrets (niets hiervan staat in de repository):
//   RESEND_API_KEY  de sleutel uit Resend (verplicht)
//   VMV_MAIL        het adres van VMV; standaard info@vmvwijnimport.com
//   AFZENDER        standaard "VMV Wijnimport <onboarding@resend.dev>";
//                   na de DNS-records: "VMV Wijnimport <bestellingen@vmvwijnimport.com>"
//   KLANTMAIL       "aan": mails gaan naar de klant zelf. Anders gaan ze naar VMV, met bovenaan
//                   het adres van de klant om ze door te sturen (Resend mailt zonder eigen
//                   domein alleen naar het adres van het eigen account).

const SITE = "https://vmvwijnimport.github.io/VMV-Wijnimport";
const KLEUR = {
  zwart: "#000000", tekst: "#3A3A3A", zacht: "#6B6B6B", wit: "#FFFFFF",
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

// Bedragen van een bestelling. Bij een bevestiging telt het aantal dat VMV heeft
// toegewezen (leeg = het bestelde aantal); de prijs per stuk blijft die van de bestelling.
export const reken = (regels, bevestigd) => {
  let totaal = 0;
  const rijen = regels.map((r) => {
    const aantal = bevestigd && r.toegewezen != null ? r.toegewezen : r.aantal;
    const bedrag = bevestigd ? centen(r.prijs_ex) * aantal / 100 : Number(r.regel_ex);
    totaal += centen(bedrag);
    return { ...r, getoond: aantal, bedrag };
  });
  const ex = totaal / 100;
  const btw = Math.round(totaal * 0.21) / 100;
  return { rijen, ex, btw, incl: Math.round(totaal + btw * 100) / 100 };
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

const regelTabel = (berekend, notitie) => {
  const rijen = berekend.rijen.map((r) => {
    const n = notitie(r);
    return `<tr>
      <td valign="top" style="padding:12px 12px 12px 0;border-bottom:1px solid ${KLEUR.lijn};font-family:${LETTER};font-size:15px;color:${KLEUR.zwart};white-space:nowrap;">${r.getoond} ×</td>
      <td valign="top" style="padding:12px 12px 12px 0;border-bottom:1px solid ${KLEUR.lijn};font-family:${LETTER};font-size:15px;line-height:1.45;color:${KLEUR.zwart};">${html(r.omschrijving)}${n ? `<br><span style="font-size:13px;color:${KLEUR.zacht};">${n}</span>` : ""}</td>
      <td valign="top" align="right" style="padding:12px 0;border-bottom:1px solid ${KLEUR.lijn};font-family:${LETTER};font-size:15px;color:${KLEUR.zwart};white-space:nowrap;">${euro(r.bedrag)}</td>
    </tr>`;
  }).join("");
  const totaal = (label, bedrag, vet) =>
    `<tr><td></td>
      <td style="padding:8px 12px 8px 0;border-bottom:1px solid ${KLEUR.lijn};font-family:${LETTER};font-size:${vet ? 16 : 14}px;${vet ? "font-weight:500;" : ""}color:${vet ? KLEUR.zwart : KLEUR.tekst};">${label}</td>
      <td align="right" style="padding:8px 0;border-bottom:1px solid ${KLEUR.lijn};font-family:${LETTER};font-size:${vet ? 16 : 14}px;${vet ? "font-weight:500;" : ""}color:${vet ? KLEUR.zwart : KLEUR.tekst};white-space:nowrap;">${euro(bedrag)}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border-top:1px solid ${KLEUR.zwart};">
    ${rijen}
    ${totaal("Totaal excl. btw", berekend.ex)}
    ${totaal("Btw 21%", berekend.btw)}
    ${totaal("Totaal incl. btw", berekend.incl, true)}
  </table>`;
};

const gegevens = (paren) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${paren
    .filter((p) => p[1])
    .map(([k, v]) => `<tr>
      <td valign="top" style="padding:6px 16px 6px 0;font-family:${LETTER};font-size:14px;color:${KLEUR.zacht};white-space:nowrap;width:1%;">${k}</td>
      <td valign="top" style="padding:6px 0;font-family:${LETTER};font-size:15px;line-height:1.45;color:${KLEUR.zwart};">${v}</td></tr>`)
    .join("")}</table>`;

// De hele mail: logo, kop, inhoud en de vaste voet (zonder adres: dat staat alleen in de voorwaarden)
const omhulsel = ({ voorvertoning, kop, inhoud, doorsturen }) => `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${html(kop)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${KLEUR.wit};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${html(voorvertoning)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${KLEUR.wit};"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
    ${doorsturen ? `<tr><td style="padding:0 0 24px;">${vlak(`<strong style="font-weight:500;">Nog niet naar de klant verstuurd.</strong><br>Stuur deze mail door naar <a href="mailto:${html(doorsturen)}" style="color:${KLEUR.rood};">${html(doorsturen)}</a>. Zodra Resend ons domein kent, gaat hij vanzelf naar de klant.`)}</td></tr>` : ""}
    <tr><td style="padding:0 0 32px;border-bottom:1px solid ${KLEUR.lijn};">
      <a href="${SITE}/"><img src="${SITE}/brand/logo/png/vmv-logo-horizontaal-512.png" width="160" height="62" alt="VMV wijnimport" style="display:block;border:0;width:160px;height:auto;"></a>
    </td></tr>
    <tr><td style="padding:40px 0 0;">
      <h1 style="margin:0 0 24px;font-family:${LETTER};font-size:30px;line-height:1.2;font-weight:300;color:${KLEUR.zwart};">${html(kop)}</h1>
      ${inhoud}
    </td></tr>
    <tr><td style="padding:40px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${KLEUR.zwart};"><tr>
        <td style="padding:20px 0 0;font-family:${LETTER};font-size:13px;line-height:1.7;color:${KLEUR.zacht};">
          <span style="color:${KLEUR.zwart};font-weight:500;">VMV Wijnimport B.V.</span><br>
          <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.zacht};">info@vmvwijnimport.com</a><br>
          WhatsApp 06 15 74 23 32<br>
          KvK 99082918, btw NL868786901B01
        </td></tr></table>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

const notitieAanvraag = (r) => [
  r.korting_pct > 0 ? `${String(Number(r.korting_pct)).replace(".", ",")}% schenkkorting` : "",
  r.allocatie ? "op allocatie: we bevestigen het aantal dat we kunnen leveren" : ""
].filter(Boolean).join(", ");

const bestelGegevens = (b, k) => gegevens([
  ["Bestelnummer", html(b.bestelnummer)],
  ["Besteld op", datum(b.besteld_op)],
  ["Afleveren bij", `${html(k.bedrijfsnaam)}<br>${html(adres(k))}`],
  ["Spoed", b.spoed ? "Ja" : ""],
  ["Opmerking", b.opmerking ? html(b.opmerking) : ""]
]);

// ---------- De drie mails ----------

// 1. Naar de klant, direct na het bestellen: een overzicht, nog géén bevestiging
export const mailAanvraag = (b, k, termijn, doorsturen) => {
  const berekend = reken(b.bestelregels, false);
  const inhoud =
    alinea(`Beste ${html(k.contactpersoon)},`) +
    alinea(`Bedankt voor je bestelling bij VMV Wijnimport. Hieronder staat een overzicht van wat je hebt aangevraagd.`) +
    vlak(`<strong style="font-weight:500;">Dit is nog geen bevestiging.</strong><br>We controleren eerst de voorraad. Zodra je bestelling definitief is, sturen we je een bevestiging.${b.bevat_aanvraag ? " Voor wijnen op allocatie bevestigen we dan ook het aantal dat we kunnen leveren." : ""}`) +
    regelTabel(berekend, notitieAanvraag) +
    alinea("Prijzen excl. btw.", `font-size:13px;color:${KLEUR.zacht};margin-top:8px;`) +
    kopje("Je bestelling") + bestelGegevens(b, k) +
    alinea(`Klopt er iets niet? Mail ons op <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.rood};">info@vmvwijnimport.com</a> en vermeld je bestelnummer. Na levering ontvang je een factuur met een betaaltermijn van ${termijn} dagen.`, "margin-top:24px;");
  return {
    onderwerp: `Overzicht van je bestelaanvraag ${b.bestelnummer} (nog niet bevestigd)`,
    html: omhulsel({ voorvertoning: "Dit is nog geen bevestiging. We controleren eerst de voorraad.", kop: "We hebben je bestelaanvraag ontvangen", inhoud, doorsturen })
  };
};

// 2. Naar VMV, direct na het bestellen
export const mailVmv = (b, k) => {
  const berekend = reken(b.bestelregels, false);
  const inhoud =
    (b.spoed ? vlak(`<strong style="font-weight:500;color:${KLEUR.rood};">Deze bestelling heeft spoed.</strong>`) : "") +
    regelTabel(berekend, (r) => [
      r.korting_pct > 0 ? `${String(Number(r.korting_pct)).replace(".", ",")}% schenkkorting` : "",
      r.allocatie ? "allocatie: vul het toegewezen aantal in" : ""
    ].filter(Boolean).join(", ")) +
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
    kopje("Bevestigen") +
    alinea(`Supabase → Table Editor → <strong style="font-weight:500;">bestellingen</strong> → zet bij ${html(b.bestelnummer)} de status op <strong style="font-weight:500;">bevestigd</strong>. Kun je minder leveren, of staan er allocatiewijnen in? Vul dan eerst in <strong style="font-weight:500;">bestelregels</strong> bij <em>toegewezen</em> het aantal in dat je levert. Een bericht voor de klant, zoals de leverdag, zet je bij <em>bericht_klant</em>. De klant krijgt daarna automatisch de bevestiging.`);
  return {
    onderwerp: `Nieuwe bestelling ${b.bestelnummer} – ${k.bedrijfsnaam}${b.spoed ? " – SPOED" : ""}`,
    html: omhulsel({ voorvertoning: `${k.bedrijfsnaam}: ${euro(berekend.ex)} excl. btw`, kop: `Nieuwe bestelling van ${k.bedrijfsnaam}`, inhoud })
  };
};

// 3. Naar de klant, wanneer VMV de status op "bevestigd" zet
export const mailBevestiging = (b, k, termijn, doorsturen) => {
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
    alinea(`Na levering ontvang je een factuur met een betaaltermijn van ${termijn} dagen. Vragen? Mail ons op <a href="mailto:info@vmvwijnimport.com" style="color:${KLEUR.rood};">info@vmvwijnimport.com</a> of stuur een WhatsApp naar 06 15 74 23 32.`, "margin-top:24px;");
  return {
    onderwerp: `Je bestelling ${b.bestelnummer} is bevestigd`,
    html: omhulsel({ voorvertoning: "Je bestelling is bevestigd.", kop: "Je bestelling is bevestigd", inhoud, doorsturen })
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

if (typeof Deno !== "undefined") Deno.serve(async (req) => {
  try {
    const { id } = await req.json();
    if (!Number.isInteger(id)) return new Response("geen geldig id", { status: 400 });
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: b, error } = await db.from("bestellingen")
      .select("*, klanten(*), bestelregels(*)").eq("id", id)
      .order("id", { referencedTable: "bestelregels" }).maybeSingle();
    if (error) throw error;
    if (!b) return new Response("onbekende bestelling", { status: 404 });
    const { data: inst } = await db.from("instellingen").select("betaaltermijn_dagen").maybeSingle();
    const termijn = inst ? inst.betaaltermijn_dagen : 14;
    const k = b.klanten;
    const vmv = Deno.env.get("VMV_MAIL") || "info@vmvwijnimport.com";
    const naarKlant = Deno.env.get("KLANTMAIL") === "aan";
    const klantAdres = naarKlant ? k.email : vmv;
    const doorsturen = naarKlant ? null : k.email;
    const verstuurd = [];

    if (await claim(db, id, "mail_aanvraag_op")) {
      try {
        await verstuur(vmv, k.email, mailVmv(b, k));
        // Zonder eigen domein gaat het overzicht niet naar de klant: die krijgt dan nog de mail van FormSubmit
        if (naarKlant) await verstuur(klantAdres, vmv, mailAanvraag(b, k, termijn, doorsturen));
        verstuurd.push("aanvraag");
      } catch (e) {
        await db.from("bestellingen").update({ mail_aanvraag_op: null }).eq("id", id);
        throw e;
      }
    }
    if (b.status === "bevestigd" && await claim(db, id, "mail_bevestiging_op")) {
      try {
        await verstuur(klantAdres, vmv, mailBevestiging(b, k, termijn, doorsturen));
        verstuurd.push("bevestiging");
      } catch (e) {
        await db.from("bestellingen").update({ mail_bevestiging_op: null }).eq("id", id);
        throw e;
      }
    }
    return Response.json({ verstuurd });
  } catch (e) {
    console.error(e);
    return new Response("mail niet verstuurd", { status: 500 });
  }
});
