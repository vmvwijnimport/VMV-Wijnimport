// Backoffice, alleen voor VMV: bestellingen bevestigen (eventueel met andere aantallen), afkeuren
// en op geleverd zetten, aanvragen van horecazaken goedkeuren of afwijzen, en wijnen, prijzen,
// voorraad en instellingen beheren (supabase/012-wijnen-beheren.sql).
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
    if (/afgehandeld|leveren|levert|geleverd|bestaat niet|aantal|^vul |^kies /i.test(m)) return m.replace(/\.?$/, ".");
    return "Er ging iets mis. Probeer het opnieuw.";
  };

  var STATUS_BESTELLING = { ontvangen: "Nieuw", bevestigd: "Bevestigd", geleverd: "Geleverd", geannuleerd: "Afgekeurd" };
  var STATUS_KLANT = { in_afwachting: "Aanvraag", goedgekeurd: "Goedgekeurd", afgewezen: "Afgewezen" };
  var TYPE_ZAAK = { restaurant: "Restaurant", bar: "Bar", wijnbar: "Wijnbar", slijterij: "Slijterij", overig: "Overig" };

  // ---------- Gegevens ----------
  var data = { bestellingen: [], klanten: [], inst: null, producten: [], hedonist: [], nieuws: [] };
  var laadAlles = function () {
    return Promise.all([
      db.from("bestellingen")
        .select("*, klanten(id, bedrijfsnaam, contactpersoon, email, telefoon, straat, postcode, plaats), bestelregels(*, producten(soort, prijs_ex))")
        .order("besteld_op", { ascending: false }).limit(1000),
      db.from("klanten").select("*").order("aangemaakt_op", { ascending: false }),
      db.from("instellingen").select("*").maybeSingle(),
      db.from("producten").select("*").order("volgorde").order("id"),
      db.from("hedonist_bestellingen").select("*").order("betaald_op", { ascending: false }),
      db.from("nieuwsbrieven").select("id, verstuurd_op, door, onderwerp, aantal").order("verstuurd_op", { ascending: false })
    ]).then(function (r) {
      // De Hedonist-tabel bestaat pas na supabase/015; zonder die tabel werkt de rest gewoon
      r.slice(0, 4).forEach(function (x) { if (x.error) throw x.error; });
      data.hedonist = r[4].error ? [] : r[4].data;
      data.nieuws = r[5].error ? [] : r[5].data;   // bestaat pas na supabase/016
      data.bestellingen = r[0].data;
      data.bestellingen.forEach(function (b) { b.bestelregels.sort(function (x, y) { return x.id - y.id; }); });
      data.klanten = r[1].data;
      data.inst = r[2].data;
      data.producten = r[3].data;
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
    var m = /^(bestelling|klant|wijn)-(.+)$/.exec(h);
    var scherm = m ? m[1] : (["klanten", "wijnen", "overzicht", "hedonist", "nieuwsmail", "prijslijst"].indexOf(h) >= 0 ? h : "bestellingen");
    schermen.forEach(function (s) { s.hidden = s.dataset.scherm !== scherm; });
    var tab = scherm === "klant" || scherm === "klanten" ? "klanten" : scherm === "wijn" || scherm === "wijnen" ? "wijnen" : ["overzicht", "hedonist", "nieuwsmail", "prijslijst"].indexOf(scherm) >= 0 ? scherm : "bestellingen";
    // Bij afdrukken alleen de prijslijst (zie stijl.css, @media print)
    document.body.classList.toggle("drukt-prijslijst", scherm === "prijslijst");
    pagina.querySelectorAll("[data-tab]").forEach(function (a) {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (scherm === "bestellingen" || scherm === "klanten") toonLijst(scherm);
    if (scherm === "bestelling") toonBestelling(Number(m[2]));
    if (scherm === "klant") toonKlant(m[2]);
    if (scherm === "wijnen") toonWijnen();
    if (scherm === "wijn") toonWijn(m[2]);
    if (scherm === "overzicht") toonOverzicht();
    if (scherm === "hedonist") toonHedonist();
    if (scherm === "nieuwsmail") toonNieuws();
    if (scherm === "prijslijst") toonPrijslijst();
  };
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });

  var tellers = function () {
    var nieuw = data.bestellingen.filter(function (b) { return b.status === "ontvangen"; }).length;
    var aanvragen = data.klanten.filter(function (k) { return k.status === "in_afwachting"; }).length;
    pagina.querySelector("[data-teller=bestellingen]").textContent = nieuw ? "(" + nieuw + " nieuw)" : "";
    pagina.querySelector("[data-teller=klanten]").textContent = aanvragen ? "(" + aanvragen + (aanvragen === 1 ? " aanvraag)" : " aanvragen)") : "";
    var teLeveren = data.hedonist.filter(function (h) { return h.status === "te_leveren"; }).length;
    pagina.querySelector("[data-teller=hedonist]").textContent = teLeveren ? "(" + teLeveren + " te leveren)" : "";
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
    veld("geennieuws").checked = !!k.geen_nieuwsmail;
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

  // ---------- Hedonist-bestellingen ----------
  // De betaal-Worker zet betaalde bestellingen in de database (supabase/015); hier zet je ze op geleverd.
  var hfilter = "te_leveren";
  pagina.querySelectorAll("[data-hfilter]").forEach(function (k) {
    k.addEventListener("click", function () { hfilter = k.dataset.hfilter; toonHedonist(); });
  });
  var hedonistActie = function (h, status, knop) {
    var plek = veld("hedonistmelding");
    melding(plek);
    bezig(knop, "Bezig…");
    db.rpc("beheer_hedonist", { bestelling: h.id, status: status })
      .then(function (r) {
        if (r.error) throw r.error;
        h.status = status;
        h.geleverd_op = status === "geleverd" ? new Date().toISOString() : null;
        tellers();
        toonHedonist();
        melding(veld("hedonistmelding"), h.bestelnummer + (status === "geleverd" ? " staat op geleverd." : " staat weer op te leveren."), "goed");
      })
      .catch(function (err) { bezig(knop); melding(plek, vertaal(err), "fout"); });
  };
  var toonHedonist = function () {
    var namen = { te_leveren: "Te leveren", geleverd: "Geleverd" };
    pagina.querySelectorAll("[data-hfilter]").forEach(function (k) {
      var f = k.dataset.hfilter;
      var n = data.hedonist.filter(function (h) { return !f || h.status === f; }).length;
      k.textContent = (f ? namen[f] : "Alle") + " (" + n + ")";
      k.setAttribute("aria-pressed", f === hfilter ? "true" : "false");
    });
    var doel = veld("hedonistlijst");
    doel.textContent = "";
    var gekozen = data.hedonist.filter(function (h) { return !hfilter || h.status === hfilter; });
    gekozen.forEach(function (h) {
      var d = el("details", "bestelling");
      var s = el("summary", "bestelling__kop beheer__hkop");
      var c1 = el("span", "beheer__cel");
      c1.appendChild(el("strong", null, h.bestelnummer));
      c1.appendChild(el("small", null, datum(h.betaald_op, true)));
      var c2 = el("span", "beheer__cel");
      c2.appendChild(el("span", null, h.naam));
      c2.appendChild(el("small", null, h.bestelling));
      var c3 = el("span", "beheer__cel beheer__labels");
      if (h.status === "te_leveren") c3.appendChild(el("span", "label", h.bezorging || "Te leveren"));
      c3.appendChild(el("span", "label label--" + (h.status === "geleverd" ? "geleverd" : "ontvangen"), namen[h.status]));
      s.appendChild(c1); s.appendChild(c2); s.appendChild(c3);
      s.appendChild(el("span", "beheer__cel beheer__bedrag", euro(h.totaal)));
      d.appendChild(s);
      var dl = el("dl", "beheer__gegevens beheer__gegevens--breed");
      var kaartlink = function (adres) {
        var a = el("a", null, adres);
        a.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(adres);
        a.target = "_blank"; a.rel = "noopener";
        return a;
      };
      var mail = el("a", null, h.email); mail.href = "mailto:" + h.email;
      var tel = el("a", null, h.telefoon); tel.href = "tel:" + String(h.telefoon || "").replace(/[^\d+]/g, "");
      [
        ["Bestelling", h.bestelling], ["Bezorging", h.bezorging],
        ["Adres", h.adres && h.adres !== "Ophalen" ? kaartlink(h.adres) : ""],
        ["E-mail", h.email ? mail : ""], ["Telefoon", h.telefoon ? tel : ""], ["Opmerking", h.opmerking || ""],
        ["Glazen", h.glazen != null ? euro(h.glazen) : ""], ["Verzending", h.verzending != null ? euro(h.verzending) : ""],
        ["Totaal incl. btw", euro(h.totaal)],
        ["Betaald", datum(h.betaald_op) + ({ ideal: ", iDEAL", banktransfer: ", overschrijving" }[h.methode] || "")],
        ["Geleverd", h.geleverd_op ? datum(h.geleverd_op) : ""],
        ["Mollie", h.mollie_id]
      ].forEach(function (p) {
        if (!p[1]) return;
        var rij = el("div");
        rij.appendChild(el("dt", null, p[0]));
        var dd = el("dd");
        if (typeof p[1] === "string") dd.textContent = p[1]; else dd.appendChild(p[1]);
        rij.appendChild(dd);
        dl.appendChild(rij);
      });
      d.appendChild(dl);
      var knop = el("button", "knop " + (h.status === "te_leveren" ? "knop--primair" : "knop--secundair"),
        h.status === "te_leveren" ? (h.adres === "Ophalen" ? "Opgehaald" : "Op geleverd zetten") : "Terug naar te leveren");
      knop.type = "button";
      knop.addEventListener("click", function () { hedonistActie(h, h.status === "te_leveren" ? "geleverd" : "te_leveren", knop); });
      var vak = el("div", "beheer__hknop");
      vak.appendChild(knop);
      d.appendChild(vak);
      doel.appendChild(d);
    });
    var leeg = veld("hedonistleeg");
    leeg.hidden = gekozen.length > 0;
    leeg.textContent = hfilter === "te_leveren" ? "Er zijn geen Hedonist-bestellingen om te leveren." : "Geen Hedonist-bestellingen.";
  };

  // ---------- Nieuwsmail ----------
  // Opstellen, voorbeeld en proef gaan via de functie bestelmail, die controleert of je beheerder bent
  // en in twee stappen bent ingelogd. Versturen kan alleen na een tweede klik.
  var nieuwsForm = document.getElementById("nieuwsformulier");
  var NIEUWS_CONCEPT = "vmv-nieuwsmail-concept";
  var nieuwsVelden = ["onderwerp", "kop", "tekst", "knoptekst", "knoplink"];
  try {
    var concept = JSON.parse(localStorage.getItem(NIEUWS_CONCEPT) || "{}");
    nieuwsVelden.forEach(function (n) { if (concept[n]) nieuwsForm.elements[n].value = concept[n]; });
  } catch (e) {}
  var nieuwsGegevens = function () {
    var g = {};
    nieuwsVelden.forEach(function (n) { g[n] = nieuwsForm.elements[n].value.trim(); });
    return g;
  };
  var versturenKnop = veld("nieuwsknop");
  var nieuwsKlaar = function () { delete versturenKnop.dataset.zeker; telOntvangers(); };
  nieuwsForm.addEventListener("input", function () {
    try { localStorage.setItem(NIEUWS_CONCEPT, JSON.stringify(nieuwsGegevens())); } catch (e) {}
    nieuwsKlaar();
  });
  var gekozenOntvangers = function () {
    return [].map.call(veld("ontvangers").querySelectorAll("input:checked"), function (i) { return i.value; });
  };
  var telOntvangers = function () {
    var n = gekozenOntvangers().length;
    if (!versturenKnop.dataset.zeker) versturenKnop.textContent = "Versturen naar " + n + (n === 1 ? " klant" : " klanten");
    var alle = veld("ontvangers").querySelectorAll("input:not(:disabled)");
    nieuwsForm.querySelector("[data-actie=allen]").checked = alle.length > 0 && n === alle.length;
  };
  nieuwsForm.querySelector("[data-actie=allen]").addEventListener("change", function (e) {
    veld("ontvangers").querySelectorAll("input:not(:disabled)").forEach(function (i) { i.checked = e.target.checked; });
    nieuwsKlaar();
  });
  var toonNieuws = function () {
    var plek = veld("ontvangers");
    var eerder = gekozenOntvangers();
    var eersteKeer = !plek.children.length;
    plek.textContent = "";
    data.klanten.filter(function (k) { return k.status === "goedgekeurd"; })
      .sort(function (x, y) { return x.bedrijfsnaam.localeCompare(y.bedrijfsnaam, "nl"); })
      .forEach(function (k) {
        var label = el("label", "akkoord");
        var vak = el("input");
        vak.type = "checkbox";
        vak.value = k.id;
        vak.disabled = !!k.geen_nieuwsmail;
        vak.checked = !k.geen_nieuwsmail && (eersteKeer || eerder.indexOf(k.id) >= 0);
        vak.addEventListener("change", nieuwsKlaar);
        label.appendChild(vak);
        label.appendChild(document.createTextNode(" " + k.bedrijfsnaam + " (" + k.contactpersoon + ")" + (k.geen_nieuwsmail ? ": wil geen nieuwsmail" : "")));
        plek.appendChild(label);
      });
    if (!plek.children.length) plek.appendChild(el("p", "beheer__klein", "Er zijn nog geen goedgekeurde klanten."));
    telOntvangers();
    var lijst = veld("nieuwsgeschiedenis");
    lijst.textContent = "";
    data.nieuws.forEach(function (n) {
      var li = el("li");
      li.appendChild(el("strong", null, n.onderwerp));
      li.appendChild(el("span", null, datum(n.verstuurd_op, true) + ", " + n.aantal + (n.aantal === 1 ? " klant" : " klanten")));
      lijst.appendChild(li);
    });
    if (!data.nieuws.length) lijst.appendChild(el("li", null, "Nog geen nieuwsmail verstuurd."));
  };
  var nieuwsFout = function (naam, tekst) {
    var invoer = nieuwsForm.elements[naam];
    var f = document.getElementById(invoer.id + "-fout");
    f.textContent = tekst || "";
    f.hidden = !tekst;
    if (tekst) invoer.setAttribute("aria-invalid", "true"); else invoer.removeAttribute("aria-invalid");
    return !tekst;
  };
  var nieuwsControle = function (voorbeeld) {
    var g = nieuwsGegevens();
    var goed = [
      nieuwsFout("onderwerp", voorbeeld || g.onderwerp ? "" : "Vul een onderwerp in"),
      nieuwsFout("tekst", voorbeeld || g.tekst ? "" : "Vul de tekst van de mail in"),
      nieuwsFout("knoplink", !g.knoplink || /^https:\/\/\S+$/.test(g.knoplink) ? (g.knoptekst && !g.knoplink ? "Vul de link van de knop in" : "") : "De link moet met https:// beginnen")
    ].every(Boolean);
    if (!goed) nieuwsForm.querySelector("[aria-invalid=true]").focus();
    return goed ? g : null;
  };
  // Aanroep van de functie; een foutmelding van de functie zelf tonen we zoals hij is
  var nieuwsFunctie = function (body) {
    return db.functions.invoke("bestelmail", { body: body }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      return (ctx && ctx.json ? ctx.json() : Promise.reject(r.error)).then(function (j) {
        throw new Error((j && j.fout) || "Er ging iets mis. Probeer het opnieuw.");
      });
    });
  };
  var nieuwsStatus = function (tekst, soort) { melding(nieuwsForm.querySelector(".formulier__status"), tekst, soort); };
  var nieuwsMis = function (err) { nieuwsStatus((err && err.message) || "Er ging iets mis. Probeer het opnieuw.", "fout"); };

  nieuwsForm.querySelector("[data-actie=voorbeeld]").addEventListener("click", function () {
    var g = nieuwsControle(true), knop = this;
    if (!g) return;
    nieuwsStatus();
    bezig(knop, "Bezig…");
    nieuwsFunctie({ nieuwsmail: g, soort: "voorbeeld" })
      .then(function (d) {
        var vak = veld("nieuwsvoorbeeld");
        vak.hidden = false;
        vak.querySelector("iframe").srcdoc = d.html;
        vak.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(nieuwsMis)
      .finally(function () { bezig(knop); });
  });
  nieuwsForm.querySelector("[data-actie=proef]").addEventListener("click", function () {
    var g = nieuwsControle(false), knop = this;
    if (!g) return;
    nieuwsStatus();
    bezig(knop, "Versturen…");
    nieuwsFunctie({ nieuwsmail: g, soort: "proef" })
      .then(function () { nieuwsStatus("Proefmail verstuurd naar info@. Kijk hoe hij eruitziet voordat je hem naar de klanten stuurt.", "goed"); })
      .catch(nieuwsMis)
      .finally(function () { bezig(knop); });
  });
  nieuwsForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var g = nieuwsControle(false);
    if (!g) return;
    var ids = gekozenOntvangers();
    if (!ids.length) { nieuwsStatus("Kies minstens één klant.", "fout"); return; }
    if (!versturenKnop.dataset.zeker) {
      versturenKnop.dataset.zeker = "1";
      versturenKnop.textContent = "Zeker weten? Klik nogmaals om naar " + ids.length + (ids.length === 1 ? " klant" : " klanten") + " te sturen";
      return;
    }
    nieuwsStatus();
    bezig(versturenKnop, "Versturen…");
    nieuwsFunctie({ nieuwsmail: g, soort: "versturen", klanten: ids })
      .then(function (d) {
        bezig(versturenKnop);
        nieuwsForm.reset();
        try { localStorage.removeItem(NIEUWS_CONCEPT); } catch (e) {}
        veld("nieuwsvoorbeeld").hidden = true;
        return laadAlles().then(function () {
          delete versturenKnop.dataset.zeker;
          toonNieuws();
          nieuwsStatus("Verstuurd naar " + d.verstuurd + (d.verstuurd === 1 ? " klant." : " klanten."), "goed");
        });
      })
      .catch(function (err) { bezig(versturenKnop); delete versturenKnop.dataset.zeker; telOntvangers(); nieuwsMis(err); });
  });

  // Op het klantscherm: wil geen nieuwsmail
  veld("geennieuws").addEventListener("change", function (e) {
    var vak = e.target, plek = veld("klantmelding");
    vak.disabled = true;
    melding(plek);
    db.rpc("beheer_nieuwsmail", { klant: klant.id, geen: vak.checked })
      .then(function (r) {
        if (r.error) throw r.error;
        klant.geen_nieuwsmail = vak.checked;
        melding(plek, vak.checked ? "Deze klant krijgt geen nieuwsmail meer." : "Deze klant krijgt weer nieuwsmail.", "goed");
      })
      .catch(function (err) { vak.checked = !vak.checked; melding(plek, vertaal(err), "fout"); })
      .finally(function () { vak.disabled = false; });
  });

  // ---------- Prijslijst: afdrukken of als PDF bewaren ----------
  // Horeca: prijzen excl. btw, met de voorwaarden uit de instellingen. Particulier: de particuliere
  // prijs incl. btw (supabase/017); wijnen zonder particuliere prijs staan er niet op.
  var lijstsoort = "horeca";
  var REGIONAAM = { Franken: "Duitsland", "Piëmont": "Italië" };
  var REGIOVOLGORDE = ["Champagne", "Bourgogne", "Duitsland", "Italië", "Glaswerk"];
  pagina.querySelectorAll("[data-lijstsoort]").forEach(function (k) {
    k.addEventListener("click", function () { lijstsoort = k.dataset.lijstsoort; toonPrijslijst(); });
  });
  veld("metuitverkocht").addEventListener("change", function () { toonPrijslijst(); });
  pagina.querySelector("[data-actie=afdrukken]").addEventListener("click", function () {
    var oud = document.title;
    // De titel wordt de bestandsnaam van de PDF
    document.title = "VMV Wijnimport prijslijst " + (lijstsoort === "horeca" ? "horeca " : "") + new Date().toISOString().slice(0, 10);
    window.print();
    document.title = oud;
  });
  var procent = function (n) { return String(Number(n)).replace(".", ",") + "%"; };
  var toonPrijslijst = function () {
    pagina.querySelectorAll("[data-lijstsoort]").forEach(function (k) { k.setAttribute("aria-pressed", k.dataset.lijstsoort === lijstsoort ? "true" : "false"); });
    var horeca = lijstsoort === "horeca";
    var metUit = veld("metuitverkocht").checked;
    var inst = data.inst || {};
    var wijnen = data.producten.filter(function (p) {
      if (p.actief === false) return false;
      if (!metUit && p.beschikbaarheid === "uitverkocht") return false;
      return horeca || p.prijs_particulier != null;
    });
    var doel = veld("prijslijst");
    doel.textContent = "";

    var kop = el("header", "prijslijst__kop");
    var logo = el("img", "prijslijst__logo");
    logo.src = pagina.dataset.logo; logo.alt = "VMV Wijnimport"; logo.width = 200;
    kop.appendChild(logo);
    var titel = el("div", "prijslijst__titel");
    titel.appendChild(el("h2", null, horeca ? "Prijslijst horeca" : "Prijslijst"));
    titel.appendChild(el("p", null, (horeca ? "Prijzen per fles, excl. btw" : "Prijzen per fles, incl. btw") + ". Geldig vanaf " + datum(new Date()) + "."));
    kop.appendChild(titel);
    doel.appendChild(kop);

    // Per regio, dan per producent, in de volgorde van het portaal
    var regios = [], perRegio = {};
    wijnen.forEach(function (p) {
      var regio = p.soort === "glas" ? "Glaswerk" : REGIONAAM[p.regio] || p.regio || "Overig";
      if (!perRegio[regio]) { perRegio[regio] = { naam: regio, producenten: [], index: {} }; regios.push(regio); }
      var r = perRegio[regio];
      var sleutel = p.soort === "glas" ? "Hedonist" : p.producent;
      if (!r.index[sleutel]) { r.index[sleutel] = { naam: sleutel, p: p, items: [] }; r.producenten.push(r.index[sleutel]); }
      r.index[sleutel].items.push(p);
    });
    var plek = function (r) { var i = REGIOVOLGORDE.indexOf(r); return i < 0 ? 50 : i; };
    regios.sort(function (a, b) { return plek(a) - plek(b); });
    regios.forEach(function (rnaam) {
      var sectie = el("section", "prijslijst__regio");
      sectie.appendChild(el("h3", "prijslijst__regionaam", rnaam));
      perRegio[rnaam].producenten.forEach(function (g) {
        var blok = el("div", "prijslijst__producent");
        var h = el("h4", null, g.naam);
        var sp = siteProducenten.filter(function (x) { return x.slug && x.slug === g.p.producent_slug; })[0];
        var waar = g.p.soort === "glas" ? "handgeblazen, loodvrij" : [sp && sp.plaats, g.p.regio].filter(Boolean).join(", ");
        if (waar) h.appendChild(el("small", null, waar));
        blok.appendChild(h);
        var ul = el("ul", "prijslijst__wijnen");
        g.items.forEach(function (p) {
          var li = el("li");
          li.appendChild(el("span", "stip stip--" + (p.kleur || "leeg")));
          var t = el("span", "prijslijst__wijn");
          t.appendChild(el("span", "prijslijst__naam", wijnNaam(p)));
          var meer = [p.druif, p.formaat && p.formaat !== "75 cl" ? p.formaat : null, p.soort === "glas" ? "per glas" : null].filter(Boolean).join(", ");
          if (meer) t.appendChild(el("small", null, meer));
          li.appendChild(t);
          var lab = [];
          if (horeca && p.allocatie) lab.push("allocatie");
          if (p.beschikbaarheid === "binnenkort") lab.push("binnenkort");
          if (p.beschikbaarheid === "uitverkocht") lab.push("uitverkocht");
          li.appendChild(el("span", "prijslijst__label", lab.join(", ")));
          li.appendChild(el("span", "prijslijst__prijs", euro(horeca ? p.prijs_ex : p.prijs_particulier)));
          ul.appendChild(li);
        });
        blok.appendChild(ul);
        sectie.appendChild(blok);
      });
      doel.appendChild(sectie);
    });
    if (!wijnen.length) doel.appendChild(el("p", "beheer__leeg", horeca ? "Er staan geen wijnen op deze lijst." : "Nog geen wijnen met een particuliere prijs. Vul die in bij Wijnen."));

    var voet = el("footer", "prijslijst__voet");
    if (horeca) {
      var regels = [];
      if (inst.schenk_vanaf) regels.push("Schenkkorting: " + procent(inst.schenk_korting_pct) + " vanaf " + inst.schenk_vanaf + " flessen van dezelfde wijn, niet voor wijnen op allocatie.");
      if (wijnen.some(function (p) { return p.allocatie; })) regels.push("Allocatie: je vraagt een aantal aan, wij bevestigen wat we kunnen leveren.");
      if (inst.glas_staffel_vanaf && wijnen.some(function (p) { return p.soort === "glas"; })) regels.push("Hedonist-glazen: " + euro(inst.glas_staffel_prijs_ex) + " per glas vanaf " + inst.glas_staffel_vanaf + " glazen (modellen gemengd).");
      if (inst.minimale_bestelling_ex) regels.push("Minimale bestelling: " + euro(inst.minimale_bestelling_ex) + " excl. btw.");
      regels.push("Bestellen via het horecaportaal op vmvwijnimport.com/horeca. Elke bestelling bevestigen we eerst. Betaling op factuur binnen " + (inst.betaaltermijn_dagen || 14) + " dagen.");
      var ul2 = el("ul", "prijslijst__voorwaarden");
      regels.forEach(function (r) { ul2.appendChild(el("li", null, r)); });
      voet.appendChild(ul2);
    }
    var contact = el("p", "prijslijst__contact");
    ["VMV Wijnimport B.V.", "info@vmvwijnimport.com", "WhatsApp 06 15 74 23 32", "vmvwijnimport.com"].forEach(function (t) { contact.appendChild(el("span", null, t)); });
    voet.appendChild(contact);
    voet.appendChild(el("p", "prijslijst__klein", "KvK 99082918, btw NL868786901B01"));
    doel.appendChild(voet);
  };

  // ---------- Overzicht: best bestellende klanten en meest bestelde wijnen ----------
  // Alleen bevestigde en geleverde bestellingen, met het aantal dat VMV levert. Geen omzet:
  // het portaal ziet alleen de horecabestellingen, dus een omzetcijfer zou een vertekend beeld geven.
  var periode = "jaar";
  var PERIODES = { jaar: "Dit jaar", vorig: "Vorig jaar", twaalf: "Afgelopen 12 maanden", alles: "Alles" };
  var inPeriode = function (d) {
    var t = new Date(d), nu = new Date();
    if (periode === "jaar") return t.getFullYear() === nu.getFullYear();
    if (periode === "vorig") return t.getFullYear() === nu.getFullYear() - 1;
    if (periode === "twaalf") return t >= new Date(nu.getFullYear() - 1, nu.getMonth(), nu.getDate());
    return true;
  };
  var tabel = function (doel, koppen, rijen, leeg) {
    doel.textContent = "";
    if (!rijen.length) {
      var c = el("caption", "beheer__leeg", leeg);
      doel.appendChild(c);
      return;
    }
    var thead = el("thead"), tr = el("tr");
    koppen.forEach(function (k, i) { var th = el("th", i ? "beheer__getal" : null, k); th.scope = "col"; tr.appendChild(th); });
    thead.appendChild(tr);
    var tbody = el("tbody");
    rijen.forEach(function (r) {
      var rij = el("tr");
      r.forEach(function (v, i) {
        var td = el(i ? "td" : "th", i ? "beheer__getal" : null);
        if (!i) td.scope = "row";
        if (v && v.nodeType) td.appendChild(v); else td.textContent = v;
        rij.appendChild(td);
      });
      tbody.appendChild(rij);
    });
    doel.appendChild(thead);
    doel.appendChild(tbody);
  };
  var toonOverzicht = function () {
    var knoppen = veld("periodes");
    if (!knoppen.children.length) {
      Object.keys(PERIODES).forEach(function (p) {
        var k = el("button", null, PERIODES[p]);
        k.type = "button";
        k.dataset.periode = p;
        k.addEventListener("click", function () { periode = p; toonOverzicht(); });
        knoppen.appendChild(k);
      });
    }
    knoppen.querySelectorAll("button").forEach(function (k) { k.setAttribute("aria-pressed", k.dataset.periode === periode ? "true" : "false"); });

    var klanten = {}, wijnen = {};
    data.bestellingen.forEach(function (b) {
      if ((b.status !== "bevestigd" && b.status !== "geleverd") || !inPeriode(b.besteld_op)) return;
      var naam = b.klanten ? b.klanten.bedrijfsnaam : "Onbekende klant";
      var k = klanten[b.klant_id] || (klanten[b.klant_id] = { id: b.klant_id, naam: naam, bestellingen: 0, flessen: 0, glazen: 0, laatst: b.besteld_op });
      k.bestellingen++;
      if (b.besteld_op > k.laatst) k.laatst = b.besteld_op;
      b.bestelregels.forEach(function (r) {
        var n = getoond(b, r);
        if (!n) return;
        if (isGlas(r)) k.glazen += n; else k.flessen += n;
        var w = wijnen[r.omschrijving] || (wijnen[r.omschrijving] = { naam: r.omschrijving, glas: isGlas(r), aantal: 0, klanten: {} });
        w.aantal += n;
        w.klanten[b.klant_id] = true;
      });
    });
    var topKlanten = Object.keys(klanten).map(function (id) { return klanten[id]; })
      .sort(function (x, y) { return (y.flessen - x.flessen) || (y.bestellingen - x.bestellingen); });
    tabel(veld("topklanten"), ["Zaak", "Bestellingen", "Flessen", "Glazen", "Laatste"], topKlanten.map(function (k) {
      var a = el("a", null, k.naam);
      a.href = "#klant-" + k.id;
      return [a, k.bestellingen, k.flessen, k.glazen || "", datum(k.laatst, true)];
    }), "Nog geen bevestigde bestellingen in deze periode.");
    var topWijnen = Object.keys(wijnen).map(function (n) { return wijnen[n]; })
      .sort(function (x, y) { return (y.aantal - x.aantal) || x.naam.localeCompare(y.naam, "nl"); });
    tabel(veld("topwijnen"), ["Wijn", "Aantal", "Klanten"], topWijnen.map(function (w) {
      return [w.naam, w.aantal + (w.glas ? " glazen" : " fl."), Object.keys(w.klanten).length];
    }), "Nog geen bevestigde bestellingen in deze periode.");
  };

  // ---------- Wijnen, prijzen en voorraad ----------
  // Opslaan gaat via de databasefuncties beheer_product en beheer_instellingen (supabase/012),
  // die zelf controleren of je beheerder bent en de invoer nakijken.
  var BESCHIKBAAR = { op_voorraad: "Op voorraad", binnenkort: "Binnenkort", uitverkocht: "Uitverkocht" };
  var siteProducenten = [];
  try { siteProducenten = JSON.parse(document.getElementById("beheer-producenten").textContent); } catch (e) { siteProducenten = []; }
  var wfilter = "";
  var wijnZoek = document.getElementById("wijn-zoek");
  var wijnForm = document.getElementById("wijnformulier");
  var instForm = document.getElementById("instellingenformulier");
  var wijn = null;            // de wijn die open staat; null = nieuwe wijn
  var wijnKopie = null;       // gegevens voor "Nieuwe jaargang van deze wijn"
  var wijnMelding = "";       // melding na opslaan, getoond boven de lijst

  // "12,50" of "12.50" → 12.5; leeg of onzin → NaN
  var getal = function (tekst) {
    var t = String(tekst == null ? "" : tekst).trim().replace(/\s|€/g, "");
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "");
    t = t.replace(",", ".");
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  };
  var kaal = function (n) { return n == null ? "" : String(Number(n)).replace(".", ","); };
  var zoekTekst = function (s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };
  var wijnNaam = function (p) { return [p.naam, p.jaargang].filter(Boolean).join(" "); };
  var naarDb = function (p) {
    return {
      id: p.id || null, soort: p.soort, producent: p.producent, producent_slug: p.producent_slug || "",
      regio: p.regio || "", naam: p.naam, druif: p.druif || "", jaargang: p.jaargang || "", formaat: p.formaat || "",
      kleur: p.kleur || "", prijs_ex: String(p.prijs_ex), beschikbaarheid: p.beschikbaarheid, allocatie: !!p.allocatie,
      max_per_bestelling: p.max_per_bestelling == null ? "" : String(p.max_per_bestelling), actief: p.actief !== false,
      prijs_particulier: p.prijs_particulier == null ? "" : String(p.prijs_particulier)
    };
  };

  pagina.querySelectorAll("[data-wfilter]").forEach(function (k) {
    k.addEventListener("click", function () { wfilter = k.dataset.wfilter; toonWijnen(); });
  });
  wijnZoek.addEventListener("input", function () { toonWijnen(); });

  // Beschikbaarheid direct in de lijst wijzigen
  var snelStatus = function (p, keuze) {
    var plek = veld("wijnmelding");
    keuze.disabled = true;
    melding(plek);
    var nieuw = naarDb(p);
    nieuw.beschikbaarheid = keuze.value;
    db.rpc("beheer_product", { product: nieuw })
      .then(function (r) {
        if (r.error) throw r.error;
        p.beschikbaarheid = keuze.value;
        melding(plek, p.producent + ", " + wijnNaam(p) + ": " + BESCHIKBAAR[p.beschikbaarheid].toLowerCase() + ". Opgeslagen.", "goed");
        toonWijnen(true);
      })
      .catch(function (err) { keuze.value = p.beschikbaarheid; melding(plek, vertaal(err), "fout"); })
      .finally(function () { keuze.disabled = false; });
  };

  var rijWijn = function (p) {
    var li = el("li", "beheer__wijn" + (p.actief === false ? " beheer__wijn--verborgen" : ""));
    var a = el("a", "beheer__cel beheer__wijnnaam");
    a.href = "#wijn-" + p.id;
    a.appendChild(el("strong", null, wijnNaam(p)));
    var meer = [p.druif, p.formaat].filter(Boolean).join(", ");
    if (meer) a.appendChild(el("small", null, meer));
    var labels = el("span", "beheer__cel beheer__labels");
    if (p.allocatie) labels.appendChild(el("span", "label", "Allocatie"));
    if (p.max_per_bestelling) labels.appendChild(el("span", "label", "max. " + p.max_per_bestelling));
    if (p.actief === false) labels.appendChild(el("span", "label label--geannuleerd", "Niet zichtbaar"));
    var prijs = el("span", "beheer__cel beheer__bedrag", euro(p.prijs_ex));
    if (p.prijs_particulier != null) prijs.appendChild(el("small", null, "part. " + euro(p.prijs_particulier)));
    var vak = el("span", "beheer__cel");
    var label = el("label", "visueel-verborgen", "Beschikbaarheid van " + p.producent + ", " + wijnNaam(p));
    label.htmlFor = "wb-" + p.id;
    var keuze = el("select", "beheer__keuzelijst");
    keuze.id = "wb-" + p.id;
    Object.keys(BESCHIKBAAR).forEach(function (w) {
      var o = el("option", null, BESCHIKBAAR[w]);
      o.value = w;
      keuze.appendChild(o);
    });
    keuze.value = p.beschikbaarheid;
    keuze.addEventListener("change", function () { snelStatus(p, keuze); });
    vak.appendChild(label);
    vak.appendChild(keuze);
    li.appendChild(a); li.appendChild(labels); li.appendChild(prijs); li.appendChild(vak);
    return li;
  };

  var toonWijnen = function (meldingHouden) {
    var plek = veld("wijnlijst");
    if (wijnMelding) { melding(veld("wijnmelding"), wijnMelding, "goed"); wijnMelding = ""; }
    else if (!meldingHouden && document.activeElement !== wijnZoek) melding(veld("wijnmelding"));
    var past = function (p, f) {
      if (f === "verborgen") return p.actief === false;
      return !f || p.beschikbaarheid === f;
    };
    pagina.querySelectorAll("[data-wfilter]").forEach(function (k) {
      var f = k.dataset.wfilter;
      var n = data.producten.filter(function (p) { return past(p, f); }).length;
      k.textContent = (f ? (f === "verborgen" ? "Niet zichtbaar" : BESCHIKBAAR[f]) : "Alle") + " (" + n + ")";
      k.setAttribute("aria-pressed", f === wfilter ? "true" : "false");
    });
    var woorden = zoekTekst(wijnZoek.value).split(/\s+/).filter(Boolean);
    var gekozen = data.producten.filter(function (p) {
      if (!past(p, wfilter)) return false;
      var tekst = zoekTekst([p.producent, p.naam, p.jaargang, p.druif, p.regio, p.formaat].join(" "));
      return woorden.every(function (w) { return tekst.indexOf(w) >= 0; });
    });
    // Groeperen per producent, in de volgorde van het portaal; glazen samen
    var groepen = [], index = {};
    gekozen.forEach(function (p) {
      var sleutel = p.soort === "glas" ? "Hedonist-glazen" : p.producent;
      if (!index[sleutel]) { index[sleutel] = { naam: sleutel, regio: p.soort === "glas" ? "" : p.regio, items: [] }; groepen.push(index[sleutel]); }
      index[sleutel].items.push(p);
    });
    plek.textContent = "";
    groepen.forEach(function (g) {
      var kop = el("h3", "beheer__producent", g.naam);
      if (g.regio) kop.appendChild(el("small", null, g.regio));
      var ul = el("ul", "beheer__wijnen");
      g.items.forEach(function (p) { ul.appendChild(rijWijn(p)); });
      plek.appendChild(kop);
      plek.appendChild(ul);
    });
    veld("wijnleeg").hidden = gekozen.length > 0;
    vulInstellingen();
  };

  // ---------- Eén wijn ----------
  var datalist = document.getElementById("w-producenten");
  var vulProducenten = function () {
    var namen = [];
    siteProducenten.forEach(function (p) { if (namen.indexOf(p.naam) < 0) namen.push(p.naam); });
    data.producten.forEach(function (p) { if (namen.indexOf(p.producent) < 0) namen.push(p.producent); });
    datalist.textContent = "";
    namen.sort(function (a, b) { return a.localeCompare(b, "nl"); }).forEach(function (n) {
      var o = el("option");
      o.value = n;
      datalist.appendChild(o);
    });
  };
  // Bekende producent gekozen: regio invullen als die nog leeg is
  var zoekProducent = function (naam) {
    var n = naam.trim().toLowerCase();
    return siteProducenten.filter(function (p) { return p.naam.toLowerCase() === n; })[0] || null;
  };
  wijnForm.producent.addEventListener("change", function () {
    var sp = zoekProducent(wijnForm.producent.value);
    var db_ = data.producten.filter(function (p) { return p.producent.toLowerCase() === wijnForm.producent.value.trim().toLowerCase(); })[0];
    if (!wijnForm.regio.value.trim()) wijnForm.regio.value = (sp && sp.regio) || (db_ && db_.regio) || "";
  });

  var wijnFout = function (naam, tekst) {
    var invoer = wijnForm.elements[naam];
    var f = document.getElementById(invoer.id + "-fout");
    f.textContent = tekst || "";
    f.hidden = !tekst;
    if (tekst) invoer.setAttribute("aria-invalid", "true"); else invoer.removeAttribute("aria-invalid");
    return !tekst;
  };

  var toonWijn = function (id) {
    vulProducenten();
    melding(wijnForm.querySelector(".formulier__status"));
    ["producent", "naam", "prijs_ex", "prijs_particulier", "max_per_bestelling"].forEach(function (n) { wijnFout(n); });
    var nieuw = id === "nieuw";
    wijn = nieuw ? null : data.producten.filter(function (p) { return String(p.id) === id; })[0];
    if (!nieuw && !wijn) {
      veld("wijnkop").textContent = "Deze wijn bestaat niet (meer).";
      wijnForm.hidden = true;
      return;
    }
    wijnForm.hidden = false;
    var p = wijn || wijnKopie || { soort: "wijn", formaat: "75 cl", beschikbaarheid: "op_voorraad", actief: true };
    veld("wijnkop").textContent = wijn ? wijn.producent + ", " + wijnNaam(wijn) : (wijnKopie ? "Nieuwe jaargang van " + wijnKopie.naam : "Nieuwe wijn");
    wijnForm.producent.value = p.producent || "";
    wijnForm.regio.value = p.regio || "";
    wijnForm.naam.value = p.naam || "";
    wijnForm.druif.value = p.druif || "";
    wijnForm.jaargang.value = p.jaargang || "";
    wijnForm.formaat.value = p.formaat || "";
    wijnForm.kleur.value = p.kleur || "";
    wijnForm.soort.value = p.soort || "wijn";
    wijnForm.prijs_ex.value = p.prijs_ex != null ? kaal(p.prijs_ex) : "";
    wijnForm.prijs_particulier.value = p.prijs_particulier != null ? kaal(p.prijs_particulier) : "";
    wijnForm.beschikbaarheid.value = p.beschikbaarheid || "op_voorraad";
    wijnForm.max_per_bestelling.value = p.max_per_bestelling || "";
    wijnForm.allocatie.checked = !!p.allocatie;
    wijnForm.actief.checked = p.actief !== false;
    veld("wijnknop").textContent = wijn ? "Wijzigingen opslaan" : "Wijn toevoegen";
    wijnForm.querySelector("[data-actie=jaargang]").hidden = !wijn;
    wijnKopie = null;
    veld("wijnkop").focus({ preventScroll: true });
  };

  wijnForm.querySelector("[data-actie=jaargang]").addEventListener("click", function () {
    wijnKopie = Object.assign({}, wijn, { id: null, jaargang: "", beschikbaarheid: "op_voorraad", actief: true });
    if (location.hash === "#wijn-nieuw") route(); else location.hash = "wijn-nieuw";
  });

  wijnForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = wijnForm.querySelector(".formulier__status");
    var prijs = getal(wijnForm.prijs_ex.value);
    var part = wijnForm.prijs_particulier.value.trim() ? getal(wijnForm.prijs_particulier.value) : null;
    var max = wijnForm.max_per_bestelling.value.trim();
    var goed = [
      wijnFout("producent", wijnForm.producent.value.trim() ? "" : "Vul de producent in"),
      wijnFout("naam", wijnForm.naam.value.trim() ? "" : "Vul de naam van de wijn in"),
      wijnFout("prijs_ex", isNaN(prijs) ? "Vul een prijs in, bijvoorbeeld 12,50" : ""),
      wijnFout("prijs_particulier", part !== null && isNaN(part) ? "Vul een prijs in, bijvoorbeeld 24,95, of laat het leeg" : ""),
      wijnFout("max_per_bestelling", max && !(/^\d+$/.test(max) && Number(max) > 0) ? "Vul een heel getal in, of laat het leeg" : "")
    ].every(Boolean);
    if (!goed) { wijnForm.querySelector("[aria-invalid=true]").focus(); return; }
    var sp = zoekProducent(wijnForm.producent.value);
    var gegevens = {
      id: wijn ? wijn.id : null,
      soort: wijnForm.soort.value,
      producent: wijnForm.producent.value.trim(),
      // Link naar de producentpagina: van de site, anders die van de wijn zelf (als de producent niet is veranderd)
      producent_slug: sp ? sp.slug : (wijn && wijn.producent === wijnForm.producent.value.trim() ? wijn.producent_slug : ""),
      regio: wijnForm.regio.value.trim(),
      naam: wijnForm.naam.value.trim(),
      druif: wijnForm.druif.value.trim(),
      jaargang: wijnForm.jaargang.value.trim(),
      formaat: wijnForm.formaat.value.trim(),
      kleur: wijnForm.kleur.value,
      prijs_ex: prijs,
      beschikbaarheid: wijnForm.beschikbaarheid.value,
      allocatie: wijnForm.allocatie.checked,
      max_per_bestelling: max ? Number(max) : null,
      actief: wijnForm.actief.checked,
      prijs_particulier: part
    };
    var knop = veld("wijnknop");
    melding(status);
    bezig(knop, "Opslaan…");
    db.rpc("beheer_product", { product: naarDb(gegevens) })
      .then(function (r) {
        if (r.error) throw r.error;
        bezig(knop);
        wijnMelding = gegevens.producent + ", " + wijnNaam(gegevens) + (wijn ? ": wijzigingen opgeslagen." : ": toegevoegd.") +
          (gegevens.actief ? "" : " Niet zichtbaar in het portaal.");
        return laadAlles().then(function () { history.replaceState(null, "", "#wijnen"); route(); window.scrollTo(0, 0); });
      })
      .catch(function (err) { bezig(knop); melding(status, vertaal(err), "fout"); });
  });

  // ---------- Instellingen ----------
  var vulInstellingen = function () {
    var i = data.inst;
    if (!i || instForm.contains(document.activeElement)) return;
    instForm.schenk_vanaf.value = i.schenk_vanaf;
    instForm.schenk_korting_pct.value = kaal(i.schenk_korting_pct);
    instForm.glas_staffel_vanaf.value = i.glas_staffel_vanaf;
    instForm.glas_staffel_prijs_ex.value = kaal(i.glas_staffel_prijs_ex);
    instForm.minimale_bestelling_ex.value = i.minimale_bestelling_ex == null ? "" : kaal(i.minimale_bestelling_ex);
    instForm.betaaltermijn_dagen.value = i.betaaltermijn_dagen;
  };
  instForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = instForm.querySelector(".formulier__status");
    var knop = instForm.querySelector("button[type=submit]");
    var nieuw = {
      schenk_vanaf: getal(instForm.schenk_vanaf.value),
      schenk_korting_pct: getal(instForm.schenk_korting_pct.value),
      glas_staffel_vanaf: getal(instForm.glas_staffel_vanaf.value),
      glas_staffel_prijs_ex: getal(instForm.glas_staffel_prijs_ex.value),
      minimale_bestelling_ex: instForm.minimale_bestelling_ex.value.trim() ? getal(instForm.minimale_bestelling_ex.value) : null,
      betaaltermijn_dagen: getal(instForm.betaaltermijn_dagen.value)
    };
    var fouten = Object.keys(nieuw).filter(function (k) { return nieuw[k] !== null && isNaN(nieuw[k]); });
    if (fouten.length) { melding(status, "Vul overal een geldig getal in.", "fout"); instForm.elements[fouten[0]].focus(); return; }
    var verzend = {};
    Object.keys(nieuw).forEach(function (k) { verzend[k] = nieuw[k] === null ? "" : String(nieuw[k]); });
    melding(status);
    bezig(knop, "Opslaan…");
    db.rpc("beheer_instellingen", { inst: verzend })
      .then(function (r) {
        if (r.error) throw r.error;
        Object.keys(nieuw).forEach(function (k) { data.inst[k] = nieuw[k]; });
        melding(status, "Instellingen opgeslagen.", "goed");
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

  // ---------- Tweede stap: een code uit een app op de telefoon ----------
  // Een beheerder logt in met wachtwoord én code. De database geeft alleen toegang na beide
  // (supabase/014-tweestaps.sql). De eerste keer stel je de app in met een QR-code.
  var codeForm = document.getElementById("beheer-code");
  var factor = null;
  var vraagCode = function (bestaand) {
    melding(codeForm.querySelector(".formulier__status"));
    codeForm.reset();
    if (bestaand) {
      factor = bestaand.id;
      veld("codekop").textContent = "Code invullen";
      veld("codeuitleg").textContent = "Open de app voor codes op je telefoon en vul de code van 6 cijfers voor VMV Wijnimport in.";
      veld("qr").hidden = true;
      toon("code");
      codeForm.code.focus();
      return Promise.resolve();
    }
    // Nog geen app ingesteld: halfafgemaakte pogingen opruimen en een nieuwe QR-code maken
    return db.auth.mfa.listFactors().then(function (f) {
      var oud = ((f.data && f.data.all) || []).filter(function (x) { return x.status !== "verified"; });
      return Promise.all(oud.map(function (x) { return db.auth.mfa.unenroll({ factorId: x.id }); }));
    }).then(function () {
      return db.auth.mfa.enroll({ factorType: "totp", friendlyName: "VMV backoffice " + new Date().toISOString().slice(0, 10) });
    }).then(function (r) {
      if (r.error) throw r.error;
      factor = r.data.id;
      veld("codekop").textContent = "Inloggen in twee stappen instellen";
      veld("codeuitleg").textContent = "Eén keer instellen: scan de QR-code met een app voor codes op je telefoon, zoals Microsoft Authenticator, Google Authenticator of Wachtwoorden op de iPhone. Vul daarna de code van 6 cijfers in die de app laat zien.";
      veld("qrbeeld").src = r.data.totp.qr_code;
      veld("qrsleutel").textContent = r.data.totp.secret;
      veld("qr").hidden = false;
      toon("code");
      codeForm.code.focus();
    });
  };
  codeForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var code = codeForm.code.value.replace(/\s/g, "");
    var f = document.getElementById("bc-code-fout");
    var goed = /^\d{6}$/.test(code);
    f.textContent = goed ? "" : "Vul de 6 cijfers uit de app in";
    f.hidden = goed;
    if (!goed) { codeForm.code.setAttribute("aria-invalid", "true"); codeForm.code.focus(); return; }
    codeForm.code.removeAttribute("aria-invalid");
    var knop = codeForm.querySelector("button[type=submit]");
    var status = codeForm.querySelector(".formulier__status");
    melding(status);
    bezig(knop, "Controleren…");
    db.auth.mfa.challengeAndVerify({ factorId: factor, code: code })
      .then(function (r) {
        if (r.error) throw r.error;
        bezig(knop);
        return start();
      })
      .catch(function () {
        bezig(knop);
        melding(status, "Deze code klopt niet of is verlopen. Vul de nieuwe code uit de app in.", "fout");
        codeForm.code.select();
      });
  });

  var start = function () {
    return db.auth.getSession().then(function (r) {
      var sessie = r.data && r.data.session;
      if (!sessie) { toon("uit"); return; }
      return db.from("beheerders").select("naam").eq("id", sessie.user.id).maybeSingle().then(function (be) {
        if (be.error) throw be.error;
        if (!be.data) { veld("account").textContent = sessie.user.email || "onbekend"; toon("geen-toegang"); return; }
        veld("naam").textContent = be.data.naam;
        return db.auth.mfa.getAuthenticatorAssuranceLevel().then(function (a) {
          if (a.error) throw a.error;
          if (a.data.currentLevel === "aal2") {
            return laadAlles().then(function () { tellers(); toon("backoffice"); route(); });
          }
          return db.auth.mfa.listFactors().then(function (f) {
            if (f.error) throw f.error;
            return vraagCode(((f.data && f.data.totp) || []).filter(function (x) { return x.status === "verified"; })[0]);
          });
        });
      });
    }).catch(function () { fout("De backoffice kon niet worden geladen. Probeer het opnieuw."); });
  };
  start();
})();
