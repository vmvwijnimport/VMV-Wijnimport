// Backoffice, alleen voor VMV: bestellingen bevestigen (eventueel met andere aantallen), afkeuren
// en op geleverd zetten, en aanvragen van horecazaken goedkeuren of afwijzen.
// Je logt in met een beheerdersaccount. De database controleert bij alles of je beheerder bent
// (supabase/008-backoffice.sql); deze code toont alleen wat de database teruggeeft.
// Na bevestigen of afkeuren krijgt de klant automatisch een mail (supabase/006 en de functie bestelmail),
// na goedkeuren een welkomstmail.
(function () {
  var pagina = document.getElementById("beheer");
  if (!pagina) return;

  var toestanden = pagina.querySelectorAll("[data-toestand]");
  var toon = function (naam) { toestanden.forEach(function (t) { t.hidden = t.dataset.toestand !== naam; }); };
  var fout = function (tekst) { toon("fout"); pagina.querySelector("[data-toestand=fout]").textContent = tekst; };
  if (!window.supabase || !pagina.dataset.url || !pagina.dataset.sleutel) {
    fout("De backoffice is nu niet bereikbaar. Probeer het later opnieuw.");
    return;
  }
  var db = window.supabase.createClient(pagina.dataset.url, pagina.dataset.sleutel);

  var euro = function (n) { return "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var centen = function (n) { return Math.round(Number(n) * 100); };
  var datum = function (d, kort) {
    return new Date(d).toLocaleDateString("nl-NL", kort ? { day: "numeric", month: "short" } : { day: "numeric", month: "long", year: "numeric" });
  };
  var el = function (tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  };
  // Afleveradres als link naar Google Maps (opent op de telefoon de kaarten-app)
  var kaart = function (k) {
    var adres = k.straat + ", " + k.postcode + " " + k.plaats;
    var a = el("a", null, adres);
    a.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(adres);
    a.target = "_blank"; a.rel = "noopener";
    return a;
  };
  var veld = function (naam) { return pagina.querySelector("[data-veld=" + naam + "]"); };
  var melding = function (plek, tekst, soort) {
    plek.className = "formulier__status" + (soort ? " " + soort : "");
    plek.textContent = tekst || "";
  };
  var vertaal = function (e) {
    var m = (e && e.message) || "";
    if (/invalid login credentials/i.test(m)) return "Je e-mailadres of wachtwoord klopt niet.";
    if (/rate limit|too many/i.test(m)) return "Te veel pogingen. Probeer het over een paar minuten opnieuw.";
    if (/geen toegang/i.test(m)) return "Dit account heeft geen toegang tot de backoffice.";
    // Meldingen uit de database (supabase/008) zijn al in gewoon Nederlands
    if (/afgehandeld|leveren|levert|geleverd|bestaat niet|aantal/i.test(m)) return m.replace(/\.?$/, ".");
    return "Er ging iets mis. Probeer het opnieuw.";
  };

  var STATUS_BESTELLING = { ontvangen: "Nieuw", bevestigd: "Bevestigd", geleverd: "Geleverd", geannuleerd: "Afgekeurd" };
  var STATUS_KLANT = { in_afwachting: "Aanvraag", goedgekeurd: "Goedgekeurd", afgewezen: "Afgewezen" };
  var TYPE_ZAAK = { restaurant: "Restaurant", bar: "Bar", wijnbar: "Wijnbar", slijterij: "Slijterij", overig: "Overig" };

  // ---------- Gegevens ----------
  var data = { bestellingen: [], klanten: [], inst: null };
  var laadAlles = function () {
    return Promise.all([
      db.from("bestellingen")
        .select("*, klanten(id, bedrijfsnaam, contactpersoon, email, telefoon, straat, postcode, plaats), bestelregels(*, producten(soort, prijs_ex))")
        .order("besteld_op", { ascending: false }).limit(1000),
      db.from("klanten").select("*").order("aangemaakt_op", { ascending: false }),
      db.from("instellingen").select("*").maybeSingle()
    ]).then(function (r) {
      r.forEach(function (x) { if (x.error) throw x.error; });
      data.bestellingen = r[0].data;
      data.bestellingen.forEach(function (b) { b.bestelregels.sort(function (x, y) { return x.id - y.id; }); });
      data.klanten = r[1].data;
      data.inst = r[2].data;
    });
  };
  var afgehandeld = function (b) { return b.status !== "ontvangen"; };
  // Wat er geleverd wordt (of is), en het bedrag daarvan
  var getoond = function (b, r) { return afgehandeld(b) && r.toegewezen != null ? r.toegewezen : r.aantal; };
  var totaalVan = function (b) {
    if (b.status === "ontvangen" || b.status === "geannuleerd") return Number(b.totaal_ex);
    return b.bestelregels.reduce(function (som, r) { return som + Math.round(r.prijs_ex * 100) * getoond(b, r); }, 0) / 100;
  };

  // ---------- Inloggen en uitloggen ----------
  var inlog = document.getElementById("beheer-inlog");
  var controleer = function (invoer, tekst) {
    var f = document.getElementById(invoer.id + "-fout");
    var leeg = !invoer.value.trim();
    f.textContent = leeg ? tekst : "";
    f.hidden = !leeg;
    if (leeg) invoer.setAttribute("aria-invalid", "true"); else invoer.removeAttribute("aria-invalid");
    return !leeg;
  };
  inlog.addEventListener("submit", function (e) {
    e.preventDefault();
    var goed = controleer(inlog.email, "Vul je e-mailadres in") & controleer(inlog.wachtwoord, "Vul je wachtwoord in");
    if (!goed) { inlog.querySelector("[aria-invalid=true]").focus(); return; }
    var knop = inlog.querySelector("button[type=submit]");
    var status = inlog.querySelector(".formulier__status");
    melding(status);
    knop.disabled = true; knop.textContent = "Inloggen…";
    db.auth.signInWithPassword({ email: inlog.email.value.trim(), password: inlog.wachtwoord.value })
      .then(function (r) { if (r.error) throw r.error; inlog.reset(); return start(); })
      .catch(function (err) { melding(status, vertaal(err), "fout"); })
      .finally(function () { knop.disabled = false; knop.textContent = "Inloggen"; });
  });
  pagina.querySelectorAll("[data-actie=uitloggen]").forEach(function (k) {
    k.addEventListener("click", function () { db.auth.signOut().then(function () { toon("uit"); }); });
  });

  // ---------- Schermen (via het adres: #bestellingen, #klanten, #bestelling-12, #klant-…) ----------
  var schermen = pagina.querySelectorAll("[data-scherm]");
  var filter = { bestellingen: "ontvangen", klanten: "in_afwachting" };
  var startModus = null;
  var route = function () {
    melding(veld("lijstmelding"));
    var h = location.hash.slice(1) || "bestellingen";
    var m = /^(bestelling|klant)-(.+)$/.exec(h);
    var scherm = m ? m[1] : (h === "klanten" ? "klanten" : "bestellingen");
    schermen.forEach(function (s) { s.hidden = s.dataset.scherm !== scherm; });
    var tab = scherm === "klant" || scherm === "klanten" ? "klanten" : "bestellingen";
    pagina.querySelectorAll("[data-tab]").forEach(function (a) {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (scherm === "bestellingen" || scherm === "klanten") toonLijst(scherm);
    if (scherm === "bestelling") toonBestelling(Number(m[2]));
    if (scherm === "klant") toonKlant(m[2]);
  };
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });

  var tellers = function () {
    var nieuw = data.bestellingen.filter(function (b) { return b.status === "ontvangen"; }).length;
    var aanvragen = data.klanten.filter(function (k) { return k.status === "in_afwachting"; }).length;
    pagina.querySelector("[data-teller=bestellingen]").textContent = nieuw ? "(" + nieuw + " nieuw)" : "";
    pagina.querySelector("[data-teller=klanten]").textContent = aanvragen ? "(" + aanvragen + (aanvragen === 1 ? " aanvraag)" : " aanvragen)") : "";
  };

  // ---------- Lijsten ----------
  pagina.querySelectorAll("[data-scherm=bestellingen], [data-scherm=klanten]").forEach(function (scherm) {
    var soort = scherm.dataset.scherm;
    scherm.querySelectorAll("[data-filter]").forEach(function (k) {
      k.addEventListener("click", function () { filter[soort] = k.dataset.filter; toonLijst(soort); });
    });
  });

  var rijBestelling = function (b) {
    var a = el("a", "beheer__rij");
    a.href = "#bestelling-" + b.id;
    var c1 = el("span", "beheer__cel");
    c1.appendChild(el("strong", null, b.bestelnummer));
    c1.appendChild(el("small", null, datum(b.besteld_op, true)));
    var c2 = el("span", "beheer__cel");
    c2.appendChild(el("span", null, b.klanten ? b.klanten.bedrijfsnaam : "Onbekende klant"));
    var stuks = b.bestelregels.reduce(function (s, r) { return s + getoond(b, r); }, 0);
    var wijnen = b.bestelregels.length + (b.bestelregels.length === 1 ? " wijn" : " wijnen") + ", " + stuks + " stuks";
    // Bij bevestigde bestellingen het afleveradres, om de leveringen te plannen
    if (b.status === "bevestigd" && b.klanten) {
      c2.appendChild(el("small", "beheer__adres", b.klanten.straat + ", " + b.klanten.postcode + " " + b.klanten.plaats));
    }
    c2.appendChild(el("small", null, wijnen));
    var c3 = el("span", "beheer__cel beheer__labels");
    if (b.spoed && (b.status === "ontvangen" || b.status === "bevestigd")) c3.appendChild(el("span", "label label--spoed", "Spoed"));
    if (b.bevat_aanvraag && b.status === "ontvangen") c3.appendChild(el("span", "label", "Allocatie"));
    c3.appendChild(el("span", "label label--" + b.status, STATUS_BESTELLING[b.status] || b.status));
    a.appendChild(c1); a.appendChild(c2); a.appendChild(c3);
    a.appendChild(el("span", "beheer__cel beheer__bedrag", euro(totaalVan(b))));
    return a;
  };
  var rijKlant = function (k) {
    var a = el("a", "beheer__rij beheer__rij--klant");
    a.href = "#klant-" + k.id;
    var c1 = el("span", "beheer__cel");
    c1.appendChild(el("strong", null, k.bedrijfsnaam));
    c1.appendChild(el("small", null, k.contactpersoon + ", " + k.plaats));
    var c2 = el("span", "beheer__cel");
    c2.appendChild(el("span", null, TYPE_ZAAK[k.type_zaak] || k.type_zaak));
    c2.appendChild(el("small", null, "aangevraagd " + datum(k.aangemaakt_op, true)));
    var c3 = el("span", "beheer__cel beheer__labels");
    c3.appendChild(el("span", "label label--" + k.status, STATUS_KLANT[k.status] || k.status));
    a.appendChild(c1); a.appendChild(c2); a.appendChild(c3);
    return a;
  };

  var toonLijst = function (soort) {
    var scherm = pagina.querySelector("[data-scherm=" + soort + "]");
    var alle = data[soort];
    var namen = soort === "bestellingen" ? STATUS_BESTELLING : STATUS_KLANT;
    scherm.querySelectorAll("[data-filter]").forEach(function (k) {
      var f = k.dataset.filter;
      var n = f ? alle.filter(function (x) { return x.status === f; }).length : alle.length;
      var naam = f ? (soort === "klanten" && f === "in_afwachting" ? "Aanvragen" : namen[f]) : "Alle";
      k.textContent = naam + " (" + n + ")";
      k.setAttribute("aria-pressed", f === filter[soort] ? "true" : "false");
    });
    var lijst = scherm.querySelector("[data-lijst]");
    lijst.textContent = "";
    var gekozen = alle.filter(function (x) { return !filter[soort] || x.status === filter[soort]; });
    // Te leveren bestellingen op postcode, zodat bestellingen in dezelfde buurt bij elkaar staan
    var opPostcode = soort === "bestellingen" && filter.bestellingen === "bevestigd";
    if (opPostcode) {
      var pc = function (b) { return b.klanten ? b.klanten.postcode.replace(/\s/g, "").toUpperCase() : "~"; };
      gekozen = gekozen.slice().sort(function (x, y) { return pc(x) < pc(y) ? -1 : pc(x) > pc(y) ? 1 : x.id - y.id; });
    }
    var uitleg = scherm.querySelector("[data-uitleg]");
    if (uitleg) uitleg.hidden = !opPostcode || !gekozen.length;
    gekozen.forEach(function (x) {
      var li = el("li");
      li.appendChild(soort === "bestellingen" ? rijBestelling(x) : rijKlant(x));
      lijst.appendChild(li);
    });
    var leeg = scherm.querySelector("[data-leeg]");
    leeg.hidden = gekozen.length > 0;
    leeg.textContent = soort === "bestellingen"
      ? (filter.bestellingen === "ontvangen" ? "Er zijn geen nieuwe bestellingen. Alles is afgehandeld." : "Geen bestellingen.")
      : (filter.klanten === "in_afwachting" ? "Er zijn geen nieuwe aanvragen." : "Geen klanten.");
  };

  // ---------- Eén bestelling ----------
  var bestelling = null;
  var modus = "bevestigen";
  var lijstRegels = pagina.querySelector(".beheer__regels");
  var form = document.getElementById("beheerformulier");
  var geleverdForm = document.getElementById("geleverdformulier");
  var verwijderForm = document.getElementById("verwijderformulier");
  var keuze = pagina.querySelector(".beheer__keuze");

  var TEKST = {
    bevestigen: {
      uitleg: "Je levert alles zoals besteld. De klant krijgt een bevestigingsmail.",
      label: "Bericht aan de klant", toelichting: "Komt in de bevestigingsmail, bijvoorbeeld de leverdag.",
      knop: "Bestelling bevestigen"
    },
    wijzigen: {
      uitleg: "Vul per wijn in hoeveel je levert (0 = niet leverbaar). De klant krijgt een bevestigingsmail met deze aantallen en de nieuwe totalen.",
      label: "Bericht aan de klant", toelichting: "Komt in de bevestigingsmail, bijvoorbeeld waarom je minder levert of de leverdag.",
      knop: "Bevestigen met deze aantallen"
    },
    afkeuren: {
      uitleg: "De bestelling gaat niet door. De klant krijgt een mail dat we de bestelling niet kunnen leveren.",
      label: "Reden voor de klant", toelichting: "Komt in de mail aan de klant.",
      knop: "Bestelling afkeuren"
    }
  };

  var leveren = function (r) {
    if (afgehandeld(bestelling)) return getoond(bestelling, r);
    if (modus !== "wijzigen") return r.aantal;
    var invoer = lijstRegels.querySelector("[data-regel='" + r.id + "']");
    var n = invoer ? parseInt(invoer.value, 10) : r.aantal;
    return isNaN(n) ? 0 : Math.max(0, Math.min(r.aantal, n));
  };
  // Prijs per stuk bij het aantal dat je levert. De korting vervalt als dat aantal er geen recht meer
  // op geeft: schenkkorting vanaf schenk_vanaf flessen, staffelprijs vanaf glas_staffel_vanaf glazen.
  // De database rekent bij het bevestigen precies zo (supabase/007-korting-bij-bevestigen.sql).
  var isGlas = function (r) { return !!(r.producten && r.producten.soort === "glas"); };
  var isStaffel = function (r) { return isGlas(r) && centen(r.prijs_ex) === centen(data.inst.glas_staffel_prijs_ex); };
  var prijsNormaal = function (r) {
    var p = r.producten, k = Number(r.korting_pct);
    if (isGlas(r)) return Number(p.prijs_ex);
    if (!(k > 0)) return Number(r.prijs_ex);
    if (p && centen(p.prijs_ex * (1 - k / 100)) === centen(r.prijs_ex)) return Number(p.prijs_ex);
    return centen(r.prijs_ex / (1 - k / 100)) / 100;
  };
  var glazen = function () {
    return bestelling.bestelregels.reduce(function (som, r) { return som + (isGlas(r) ? leveren(r) : 0); }, 0);
  };
  var vervalt = function (r, n) {
    if (afgehandeld(bestelling) || modus === "afkeuren") return "";
    if (isStaffel(r) && glazen() < data.inst.glas_staffel_vanaf) return "geen staffelprijs meer (minder dan " + data.inst.glas_staffel_vanaf + " glazen)";
    if (r.korting_pct > 0 && n < data.inst.schenk_vanaf) return "geen schenkkorting meer (minder dan " + data.inst.schenk_vanaf + " flessen)";
    return "";
  };
  var bedrag = function (r, n) {
    if (afgehandeld(bestelling)) return Math.round(r.prijs_ex * 100) * n / 100;
    var weg = vervalt(r, n);
    if (!weg && n === r.aantal) return Number(r.regel_ex);
    return Math.round((weg ? prijsNormaal(r) : r.prijs_ex) * 100) * n / 100;
  };

  var totalen = function () {
    var c = 0;
    bestelling.bestelregels.forEach(function (r) {
      var n = leveren(r), b = bedrag(r, n);
      c += Math.round(b * 100);
      var cel = lijstRegels.querySelector("[data-bedrag='" + r.id + "']");
      if (cel) cel.textContent = euro(b);
      var noot = lijstRegels.querySelector("[data-vervalt='" + r.id + "']");
      if (noot) noot.textContent = vervalt(r, n);
    });
    var btw = Math.round(c * 0.21);
    pagina.querySelector("[data-totaal=ex]").textContent = euro(c / 100);
    pagina.querySelector("[data-totaal=btw]").textContent = euro(btw / 100);
    pagina.querySelector("[data-totaal=incl]").textContent = euro((c + btw) / 100);
  };

  var toonRegels = function () {
    lijstRegels.textContent = "";
    var klaar = afgehandeld(bestelling);
    var weg = modus === "afkeuren" || bestelling.status === "geannuleerd";
    bestelling.bestelregels.forEach(function (r) {
      var li = el("li", "beheer__regel" + (weg ? " beheer__regel--weg" : ""));
      var tekst = el("span", "beheer__tekst");
      var n = getoond(bestelling, r);
      tekst.appendChild(el("span", null, (modus === "wijzigen" && !klaar ? "" : n + " × ") + r.omschrijving));
      var extra = [];
      if (r.korting_pct > 0) extra.push(String(r.korting_pct).replace(".", ",") + "% schenkkorting");
      if (r.allocatie) extra.push("op allocatie");
      if ((modus === "wijzigen" && !klaar) || (klaar && n !== r.aantal)) extra.push("besteld: " + r.aantal);
      if (extra.length) tekst.appendChild(el("small", null, extra.join(", ")));
      var noot = el("small", "beheer__vervalt");
      noot.dataset.vervalt = r.id;
      tekst.appendChild(noot);
      li.appendChild(tekst);

      var vak = el("span", "beheer__leveren");
      if (modus === "wijzigen" && !klaar) {
        var label = el("label", "visueel-verborgen", "Aantal leveren: " + r.omschrijving);
        label.htmlFor = "leveren-" + r.id;
        var invoer = el("input", "beheer__invoer");
        invoer.type = "number"; invoer.min = "0"; invoer.max = String(r.aantal); invoer.inputMode = "numeric";
        invoer.id = "leveren-" + r.id;
        invoer.dataset.regel = r.id;
        invoer.value = r.aantal;
        invoer.addEventListener("input", totalen);
        vak.appendChild(label);
        vak.appendChild(invoer);
        vak.appendChild(el("span", "beheer__van", "van " + r.aantal));
      }
      li.appendChild(vak);
      var bed = el("span", "beheer__bedrag");
      bed.dataset.bedrag = r.id;
      li.appendChild(bed);
      lijstRegels.appendChild(li);
    });
    totalen();
  };

  var knoppen = pagina.querySelectorAll("[data-modus]");
  var kiesModus = function (nieuw) {
    modus = nieuw;
    knoppen.forEach(function (k) { k.setAttribute("aria-pressed", k.dataset.modus === modus ? "true" : "false"); });
    var t = TEKST[modus];
    veld("uitleg").textContent = t.uitleg;
    veld("berichtlabel").firstChild.textContent = t.label + " ";
    veld("berichtuitleg").textContent = t.toelichting;
    veld("knop").textContent = t.knop;
    melding(form.querySelector(".formulier__status"));
    toonRegels();
  };
  knoppen.forEach(function (k) { k.addEventListener("click", function () { kiesModus(k.dataset.modus); }); });

  var STATUSTEKST = {
    bevestigd: "Bevestigd. Is de bestelling bezorgd, zet hem dan hieronder op geleverd.",
    geleverd: "Geleverd. Er hoeft niets meer te gebeuren.",
    geannuleerd: "Afgekeurd. Er hoeft niets meer te gebeuren."
  };
  var naMelding = "";   // melding na een actie, getoond boven de bijgewerkte bestelling of klant

  var toonBestelling = function (id) {
    bestelling = data.bestellingen.filter(function (b) { return b.id === id; })[0];
    if (!bestelling) {
      veld("nummer").textContent = "Deze bestelling bestaat niet (meer).";
      [keuze, form, geleverdForm, veld("uitleg"), veld("status")].forEach(function (x) { x.hidden = true; });
      lijstRegels.textContent = "";
      return;
    }
    var b = bestelling, k = b.klanten || {};
    veld("nummer").textContent = b.bestelnummer + " van " + (k.bedrijfsnaam || "onbekende klant");
    var dl = veld("klant");
    dl.textContent = "";
    [
      ["Zaak", k.bedrijfsnaam], ["Contact", k.contactpersoon], ["Telefoon", k.telefoon], ["E-mail", k.email],
      ["Afleveradres", k.straat ? kaart(k) : ""],
      ["Besteld op", datum(b.besteld_op)],
      ["Spoed", b.spoed ? "Ja" : ""], ["Opmerking", b.opmerking || ""],
      [b.status === "geannuleerd" ? "Reden aan de klant" : "Bericht aan de klant", afgehandeld(b) ? b.bericht_klant || "" : ""]
    ].forEach(function (p) {
      if (!p[1]) return;
      var rij = el("div");
      rij.appendChild(el("dt", null, p[0]));
      var dd = el("dd");
      if (typeof p[1] === "string") dd.textContent = p[1]; else dd.appendChild(p[1]);
      rij.appendChild(dd);
      dl.appendChild(rij);
    });
    veld("klantlink").href = "#klant-" + b.klant_id;

    var klaar = afgehandeld(b);
    keuze.hidden = klaar;
    form.hidden = klaar;
    veld("uitleg").hidden = klaar;
    veld("status").hidden = !klaar;
    geleverdForm.hidden = b.status !== "bevestigd";
    melding(geleverdForm.querySelector(".formulier__status"));
    melding(verwijderForm.querySelector(".formulier__status"));
    var vk = verwijderForm.querySelector("button[type=submit]");
    vk.textContent = "Bestelling verwijderen";
    delete vk.dataset.zeker;
    form.reset();
    if (klaar) {
      veld("status").textContent = naMelding || STATUSTEKST[b.status] || "";
      modus = "bevestigen";
      toonRegels();
    } else {
      kiesModus(startModus || "bevestigen");
    }
    startModus = null;
    naMelding = "";
    veld("nummer").focus({ preventScroll: true });
  };

  var bezig = function (knop, tekst) {
    if (tekst) { knop.dataset.tekst = knop.textContent; knop.textContent = tekst; knop.disabled = true; return; }
    if (knop.dataset.tekst) knop.textContent = knop.dataset.tekst;
    delete knop.dataset.tekst;
    knop.disabled = false;
  };
  // Na een actie: alles opnieuw laden en dezelfde bestelling of klant tonen, met een melding
  var vernieuw = function (tekst) {
    return laadAlles().then(function () { naMelding = tekst; tellers(); route(); });
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = form.querySelector(".formulier__status");
    var knop = veld("knop");
    var bericht = form.bericht.value.trim() || null;
    var b = bestelling, naam = (b.klanten || {}).bedrijfsnaam || "De klant";
    var verzoek;
    if (modus === "afkeuren") {
      verzoek = db.rpc("beheer_afkeur", { bestelling: b.id, bericht: bericht });
    } else {
      var regels = b.bestelregels.map(function (r) { return { id: r.id, leveren: leveren(r) }; });
      if (regels.every(function (x) { return x.leveren === 0; })) {
        melding(status, "Je levert niets. Kies Afkeuren als de bestelling niet doorgaat.", "fout");
        return;
      }
      verzoek = db.rpc("beheer_bevestig", { bestelling: b.id, leveren: regels, bericht: bericht });
    }
    var afkeuren = modus === "afkeuren";
    melding(status);
    bezig(knop, "Bezig…");
    verzoek
      .then(function (r) {
        if (r.error) throw r.error;
        bezig(knop);
        return vernieuw(afkeuren
          ? "Afgekeurd. " + naam + " krijgt automatisch een mail dat de bestelling niet doorgaat."
          : "Bevestigd. " + naam + " krijgt automatisch een bevestigingsmail. Vergeet niet de factuur te maken in e-Boekhouden.");
      })
      .catch(function (err) { bezig(knop); melding(status, vertaal(err), "fout"); });
  });

  geleverdForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = geleverdForm.querySelector(".formulier__status");
    var knop = geleverdForm.querySelector("button[type=submit]");
    melding(status);
    bezig(knop, "Bezig…");
    db.rpc("beheer_geleverd", { bestelling: bestelling.id })
      .then(function (r) { if (r.error) throw r.error; bezig(knop); return vernieuw("Op geleverd gezet."); })
      .catch(function (err) { bezig(knop); melding(status, vertaal(err), "fout"); });
  });

  // Verwijderen: eerst nogmaals klikken ter controle
  verwijderForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = verwijderForm.querySelector(".formulier__status");
    var knop = verwijderForm.querySelector("button[type=submit]");
    if (!knop.dataset.zeker) {
      knop.dataset.zeker = "1";
      knop.textContent = "Zeker weten? Klik nogmaals om te verwijderen";
      return;
    }
    var nummer = bestelling.bestelnummer;
    melding(status);
    bezig(knop, "Bezig…");
    db.rpc("beheer_verwijder", { bestelling: bestelling.id })
      .then(function (r) {
        if (r.error) throw r.error;
        bezig(knop);
        return laadAlles().then(function () {
          tellers();
          history.replaceState(null, "", "#bestellingen");
          route();
          melding(veld("lijstmelding"), "Bestelling " + nummer + " is verwijderd.", "goed");
        });
      })
      .catch(function (err) { bezig(knop); melding(status, vertaal(err), "fout"); });
  });

  // ---------- Eén klant ----------
  var klant = null;
  var notitieForm = document.getElementById("notitieformulier");
  var KLANTTEKST = {
    in_afwachting: "Nieuwe aanvraag. Controleer de gegevens en keur goed of wijs af.",
    goedgekeurd: "Goedgekeurd: deze zaak kan inloggen, ziet de horecaprijzen en kan bestellen.",
    afgewezen: "Afgewezen: deze zaak kan wel inloggen, maar ziet geen prijzen en kan niet bestellen."
  };

  var klantActie = function (status, tekst) {
    var plek = veld("klantmelding");
    var knoppenKlant = veld("klantknoppen").querySelectorAll("button");
    melding(plek);
    knoppenKlant.forEach(function (k) { k.disabled = true; });
    return db.rpc("beheer_klant", { klant: klant.id, status: status })
      .then(function (r) { if (r.error) throw r.error; return vernieuw(tekst); })
      .catch(function (err) { melding(plek, vertaal(err), "fout"); knoppenKlant.forEach(function (k) { k.disabled = false; }); });
  };
  // Knop die bij een ingrijpende keuze eerst om bevestiging vraagt (tweede klik)
  var klantKnop = function (tekst, primair, status, klaarTekst, zeker) {
    var k = el("button", "knop " + (primair ? "knop--primair" : "knop--secundair"), tekst);
    k.type = "button";
    k.addEventListener("click", function () {
      if (zeker && !k.dataset.zeker) {
        k.dataset.zeker = "1";
        k.textContent = zeker;
        return;
      }
      klantActie(status, klaarTekst);
    });
    return k;
  };

  var toonKlant = function (id) {
    klant = data.klanten.filter(function (k) { return k.id === id; })[0];
    var plekKnoppen = veld("klantknoppen");
    plekKnoppen.textContent = "";
    melding(veld("klantmelding"));
    if (!klant) {
      veld("klantnaam").textContent = "Deze klant bestaat niet (meer).";
      veld("klantstatus").hidden = true;
      veld("klantgegevens").textContent = "";
      veld("controle").textContent = "";
      return;
    }
    var k = klant;
    veld("klantnaam").textContent = k.bedrijfsnaam;
    veld("klantstatus").hidden = false;
    veld("klantstatus").textContent = naMelding || KLANTTEKST[k.status] || "";
    naMelding = "";

    var dl = veld("klantgegevens");
    dl.textContent = "";
    [
      ["Contactpersoon", k.contactpersoon], ["E-mail", k.email], ["Telefoon", k.telefoon],
      ["Type zaak", TYPE_ZAAK[k.type_zaak] || k.type_zaak],
      ["KvK-nummer", k.kvk], ["Btw-nummer", k.btw],
      ["Afleveradres", kaart(k)],
      ["Aangevraagd op", datum(k.aangemaakt_op)],
      ["Welkomstmail verstuurd", k.mail_welkom_op ? datum(k.mail_welkom_op) : ""]
    ].forEach(function (p) {
      if (!p[1]) return;
      var rij = el("div");
      rij.appendChild(el("dt", null, p[0]));
      var dd = el("dd");
      if (typeof p[1] === "string") dd.textContent = p[1]; else dd.appendChild(p[1]);
      rij.appendChild(dd);
      dl.appendChild(rij);
    });

    // Snel controleren of de zaak bestaat en bij de aanvrager hoort
    var controle = veld("controle");
    controle.textContent = "Controleer de zaak: ";
    var kvk = el("a", null, "KvK-nummer opzoeken");
    kvk.href = "https://www.kvk.nl/zoeken/?source=all&q=" + encodeURIComponent(k.kvk);
    kvk.target = "_blank"; kvk.rel = "noopener";
    var vies = el("a", null, "btw-nummer controleren (VIES)");
    vies.href = "https://ec.europa.eu/taxation_customs/vies/#/vat-validation";
    vies.target = "_blank"; vies.rel = "noopener";
    controle.appendChild(kvk);
    controle.appendChild(document.createTextNode(", "));
    controle.appendChild(vies);
    controle.appendChild(document.createTextNode("."));

    var welkom = k.mail_welkom_op ? " kan weer inloggen." : " krijgt automatisch een welkomstmail en kan nu inloggen.";
    if (k.status === "in_afwachting") {
      plekKnoppen.appendChild(klantKnop("Goedkeuren", true, "goedgekeurd", "Goedgekeurd. " + k.bedrijfsnaam + welkom));
      plekKnoppen.appendChild(klantKnop("Afwijzen", false, "afgewezen", "Afgewezen. " + k.bedrijfsnaam + " ziet bij het inloggen dat de aanvraag niet is goedgekeurd. Er gaat geen mail.", "Zeker weten? Klik nogmaals om af te wijzen"));
    } else if (k.status === "goedgekeurd") {
      plekKnoppen.appendChild(klantKnop("Toegang intrekken", false, "afgewezen", "Toegang ingetrokken. " + k.bedrijfsnaam + " ziet geen prijzen meer en kan niet bestellen.", "Zeker weten? Klik nogmaals om de toegang in te trekken"));
    } else {
      plekKnoppen.appendChild(klantKnop("Alsnog goedkeuren", true, "goedgekeurd", "Goedgekeurd. " + k.bedrijfsnaam + welkom));
    }

    notitieForm.notitie.value = k.notitie || "";
    melding(notitieForm.querySelector(".formulier__status"));

    var mini = veld("klantbestellingen");
    mini.textContent = "";
    var eigen = data.bestellingen.filter(function (b) { return b.klant_id === k.id; });
    if (!eigen.length) mini.appendChild(el("li", "beheer__klein", "Nog geen bestellingen."));
    eigen.forEach(function (b) {
      var li = el("li");
      var a = el("a", null, b.bestelnummer);
      a.href = "#bestelling-" + b.id;
      li.appendChild(a);
      li.appendChild(el("span", null, datum(b.besteld_op, true) + ", " + (STATUS_BESTELLING[b.status] || b.status).toLowerCase()));
      mini.appendChild(li);
    });
    veld("klantnaam").focus({ preventScroll: true });
  };

  notitieForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = notitieForm.querySelector(".formulier__status");
    var knop = notitieForm.querySelector("button[type=submit]");
    var tekst = notitieForm.notitie.value;
    melding(status);
    bezig(knop, "Opslaan…");
    db.rpc("beheer_klant", { klant: klant.id, notitie: tekst })
      .then(function (r) {
        if (r.error) throw r.error;
        klant.notitie = tekst.trim() || null;
        melding(status, "Opgeslagen.", "goed");
      })
      .catch(function (err) { melding(status, vertaal(err), "fout"); })
      .finally(function () { bezig(knop); });
  });

  // ---------- Start ----------
  // Via een knop in de mail: ?id=12&actie=wijzigen → die bestelling, in die modus
  var zoek = new URLSearchParams(location.search);
  if (zoek.get("id")) {
    if (["bevestigen", "wijzigen", "afkeuren"].indexOf(zoek.get("actie")) >= 0) startModus = zoek.get("actie");
    history.replaceState(null, "", location.pathname + "#bestelling-" + parseInt(zoek.get("id"), 10));
  }

  var start = function () {
    return db.auth.getSession().then(function (r) {
      var sessie = r.data && r.data.session;
      if (!sessie) { toon("uit"); return; }
      return db.from("beheerders").select("naam").eq("id", sessie.user.id).maybeSingle().then(function (be) {
        if (be.error) throw be.error;
        if (!be.data) { veld("account").textContent = sessie.user.email || "onbekend"; toon("geen-toegang"); return; }
        veld("naam").textContent = be.data.naam;
        return laadAlles().then(function () { tellers(); toon("backoffice"); route(); });
      });
    }).catch(function () { fout("De backoffice kon niet worden geladen. Probeer het opnieuw."); });
  };
  start();
})();
