// Horecaportaal: bestelmandje, bestelling plaatsen en eerdere bestellingen.
// De bedragen hier zijn een voorbeeldberekening voor de klant. De echte prijs
// berekent de database in plaats_bestelling (supabase/schema.sql), met
// dezelfde regels: 5% schenkkorting vanaf 24 flessen van dezelfde wijn (niet
// bij allocatie) en de Hedonist-staffel vanaf 12 glazen (modellen gemengd).
(function () {
  var mandjeEl = document.getElementById("bestelmandje");
  if (!mandjeEl) return;
  var pagina = document.getElementById("horeca");

  var klant = null, klantId = null, producten = [], inst = null, mandje = {};
  var perId = {};

  // Engelse pagina (/en/trade/): Engelse teksten. Mails en meldingen uit de database blijven Nederlands.
  var EN = document.documentElement.lang === "en";
  var t = function (nl, en) { return EN ? en : nl; };
  var euro = function (n) { return "€" + Number(n).toLocaleString(EN ? "en-GB" : "nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var stuks = function (n) { return n + (EN ? (n === 1 ? " item" : " items") : (n === 1 ? " stuk" : " stuks")); };
  var el = function (tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  };
  var opslag = function () { return "vmv-horeca-mandje-" + klantId; };
  var bewaar = function () { try { localStorage.setItem(opslag(), JSON.stringify(mandje)); } catch (e) {} };
  var laad = function () { try { mandje = JSON.parse(localStorage.getItem(opslag())) || {}; } catch (e) { mandje = {}; } };
  var omschrijving = function (p) {
    return (p.soort === "glas" ? p.naam : p.producent + " – " + p.naam) + (p.jaargang ? " " + p.jaargang : "") +
      (p.formaat && p.formaat !== "75 cl" && p.formaat !== "per glas" ? " (" + p.formaat + ")" : "");
  };

  // ---------- Berekening (zelfde regels als de database) ----------
  var berekening = function () {
    var glazen = 0, regels = [], totaal = 0, flessen = 0, aanvraag = false;
    Object.keys(mandje).forEach(function (id) {
      var p = perId[id];
      if (p && p.soort === "glas") glazen += mandje[id];
    });
    Object.keys(mandje).forEach(function (id) {
      var p = perId[id], aantal = mandje[id];
      if (!p || !aantal) return;
      var korting = 0, stuk;
      if (p.soort === "glas") {
        stuk = glazen >= inst.glas_staffel_vanaf ? Number(inst.glas_staffel_prijs_ex) : Number(p.prijs_ex);
      } else {
        if (!p.allocatie && aantal >= inst.schenk_vanaf) korting = Number(inst.schenk_korting_pct);
        // In centen rekenen, zodat de afronding gelijk is aan die in de database (52,155 wordt 52,16)
        stuk = Math.round(Math.round(p.prijs_ex * 100) * (100 - korting) / 100) / 100;
        flessen += aantal;
      }
      var regel = Math.round(stuk * 100) * aantal / 100;
      totaal += regel;
      aanvraag = aanvraag || p.allocatie;
      regels.push({ p: p, aantal: aantal, stuk: stuk, korting: korting, regel: regel });
    });
    return { regels: regels, totaal: Math.round(totaal * 100) / 100, glazen: glazen, flessen: flessen, aanvraag: aanvraag };
  };

  // ---------- Aantallen bij de wijnen ----------
  var zet = function (id, aantal) {
    var p = perId[id];
    aantal = Math.max(0, Math.min(1200, parseInt(aantal, 10) || 0));
    if (p && p.max_per_bestelling && !p.allocatie) aantal = Math.min(aantal, p.max_per_bestelling);
    if (aantal) mandje[id] = aantal; else delete mandje[id];
    bewaar();
    toon();
  };

  // − aantal + ; gebruikt bij de wijnen en in het mandje
  var aantalKnoppen = function (id, p, plek) {
    var groep = el("span", "aantal aantal--licht");
    groep.setAttribute("role", "group");
    groep.setAttribute("aria-label", t("Aantal ", "Quantity ") + omschrijving(p));
    var min = el("button", "aantal__knop", "−"); min.type = "button"; min.setAttribute("aria-label", t("Eén minder", "One fewer"));
    var veld = el("input", "aantal__veld"); veld.type = "number"; veld.min = "0"; veld.inputMode = "numeric";
    veld.setAttribute("aria-label", t("Aantal ", "Number of ") + (p.soort === "glas" ? t("glazen", "glasses") : t("flessen", "bottles")) + " " + omschrijving(p));
    var plus = el("button", "aantal__knop", "+"); plus.type = "button"; plus.setAttribute("aria-label", t("Eén meer", "One more"));
    [min, veld, plus].forEach(function (x, i) { x.dataset.focus = plek + "-" + id + "-" + i; });
    veld.value = mandje[id] || 0;
    min.addEventListener("click", function () { zet(id, (mandje[id] || 0) - 1); });
    plus.addEventListener("click", function () { zet(id, (mandje[id] || 0) + 1); });
    veld.addEventListener("change", function () { zet(id, veld.value); });
    groep.appendChild(min); groep.appendChild(veld); groep.appendChild(plus);
    return groep;
  };

  var voegKnoppenToe = function () {
    document.querySelectorAll("#assortiment .wijnregel").forEach(function (li) {
      var id = li.dataset.product, p = perId[id];
      if (!p || li.querySelector(".aantal")) return;
      var vak = el("span", "wijnregel__bestel");
      if (p.beschikbaarheid === "uitverkocht") { li.appendChild(vak); return; }
      vak.appendChild(aantalKnoppen(id, p, "wijnregel"));
      if (p.soort !== "glas") {
        var doos = el("button", "tekstknop wijnregel__doos", t("+ doos", "+ case"));
        doos.type = "button";
        doos.setAttribute("aria-label", t("Voeg een doos van 6 flessen toe: ", "Add a case of 6 bottles: ") + omschrijving(p));
        doos.addEventListener("click", function () { zet(id, (mandje[id] || 0) + 6); });
        vak.appendChild(doos);
      }
      li.appendChild(vak);
    });
  };

  // ---------- Mandje tonen ----------
  var leeg = mandjeEl.querySelector(".mandje__leeg");
  var inhoud = mandjeEl.querySelector(".mandje__inhoud");
  var form = document.getElementById("bestelformulier-horeca");
  var klaar = mandjeEl.querySelector(".bestel__klaar");
  var balk = pagina.querySelector(".portaal__balk-mobiel");
  var kiezen = mandjeEl.querySelector("[data-stap=kiezen]");

  // Twee stappen: eerst aantallen kiezen, dan bezorging en opmerking
  var naarStap = function (stap) {
    kiezen.hidden = stap !== "kiezen";
    form.hidden = stap !== "bestellen";
    if (stap === "bestellen") form.querySelector("[data-actie=terug]").focus();
    else mandjeEl.querySelector("[data-actie=verder]").focus();
    if (mandjeEl.getBoundingClientRect().top < 0) mandjeEl.scrollIntoView();
    toonScrolhint();
  };
  mandjeEl.querySelector("[data-actie=verder]").addEventListener("click", function () { naarStap("bestellen"); });
  form.querySelector("[data-actie=terug]").addEventListener("click", function () { naarStap("kiezen"); });

  // Past een stap niet in het mandje, dan zeggen we dat je erin kunt scrollen
  var toonScrolhint = function () {
    [[kiezen, ".mandje__regels"], [form, ".mandje__midden"]].forEach(function (x) {
      var vak = x[0].querySelector(x[1]);
      x[0].querySelector(".mandje__scrolhint").hidden = x[0].hidden || vak.scrollHeight <= vak.clientHeight + 1;
    });
  };
  window.addEventListener("resize", toonScrolhint);

  var toon = function () {
    document.querySelectorAll("#assortiment .wijnregel").forEach(function (li) {
      var veld = li.querySelector(".aantal__veld");
      if (veld) veld.value = mandje[li.dataset.product] || 0;
      li.classList.toggle("wijnregel--gekozen", !!mandje[li.dataset.product]);
    });
    var b = berekening();
    leeg.hidden = b.regels.length > 0;
    inhoud.hidden = b.regels.length === 0;
    if (!b.regels.length) { kiezen.hidden = false; form.hidden = true; }
    if (b.regels.length) klaar.hidden = true;

    var lijst = mandjeEl.querySelector(".mandje__regels");
    // Focus bewaren: het mandje wordt bij elke wijziging opnieuw opgebouwd
    var focus = document.activeElement && lijst.contains(document.activeElement) ? document.activeElement.dataset.focus || "weg" : null;
    lijst.textContent = "";
    b.regels.forEach(function (r) {
      var li = el("li", "mandje__regel");
      var links = el("span", null, r.aantal + " × " + omschrijving(r.p));
      var extra = [];
      if (r.korting) extra.push(EN ? r.korting + "% volume discount" : String(r.korting).replace(".", ",") + "% schenkkorting");
      if (r.p.soort === "glas" && b.glazen >= inst.glas_staffel_vanaf) extra.push(t("staffelprijs vanaf ", "tiered price from ") + inst.glas_staffel_vanaf + t(" glazen", " glasses"));
      if (r.p.allocatie) extra.push(t("aanvraag, wij bevestigen het aantal", "request, we confirm the quantity"));
      if (extra.length) links.appendChild(el("small", null, extra.join(" · ")));
      li.appendChild(links);
      li.appendChild(el("span", "mandje__bedrag", euro(r.regel)));
      var acties = el("span", "mandje__acties");
      acties.appendChild(aantalKnoppen(r.p.id, r.p, "mandje"));
      var weg = el("button", "tekstknop", t("Verwijderen", "Remove"));
      weg.type = "button";
      weg.setAttribute("aria-label", t("Verwijder ", "Remove ") + omschrijving(r.p) + t(" uit je bestelling", " from your order"));
      weg.addEventListener("click", function () { zet(r.p.id, 0); });
      acties.appendChild(weg);
      li.appendChild(acties);
      lijst.appendChild(li);
    });
    var terug = focus && lijst.querySelector('[data-focus="' + focus + '"]');
    if (terug) terug.focus();
    else if (focus) document.getElementById("bestel-kop").focus();
    mandjeEl.querySelector("[data-totaal=ex]").textContent = euro(b.totaal);
    mandjeEl.querySelector("[data-totaal=btw]").textContent = euro(b.totaal * 0.21);
    mandjeEl.querySelector("[data-totaal=incl]").textContent = euro(b.totaal * 1.21);

    var tips = [];
    if (b.aanvraag) tips.push(t("Wijnen op allocatie zijn een aanvraag: we bevestigen het aantal dat we kunnen leveren.", "Allocated wines are a request: we confirm how many we can deliver."));
    var glasTekort = inst.glas_staffel_vanaf - b.glazen;
    if (b.glazen > 0 && glasTekort > 0) tips.push(EN
      ? "Add " + glasTekort + (glasTekort === 1 ? " more glass" : " more glasses") + " for the tiered price of " + euro(inst.glas_staffel_prijs_ex) + " excl. VAT per glass."
      : "Nog " + glasTekort + (glasTekort === 1 ? " glas" : " glazen") + " voor de staffelprijs van " + euro(inst.glas_staffel_prijs_ex) + " excl. btw per glas.");
    if (inst.minimale_bestelling_ex && b.totaal < inst.minimale_bestelling_ex) tips.push(t("De minimale bestelling is ", "The minimum order is ") + euro(inst.minimale_bestelling_ex) + t(" excl. btw.", " excl. VAT."));
    mandjeEl.querySelector("[data-mandje=tip]").textContent = tips.join(" ");

    var n = b.flessen + b.glazen;
    mandjeEl.querySelector("[data-mandje=samenvatting]").textContent = stuks(n) + ", " + euro(b.totaal) + t(" excl. btw", " excl. VAT");
    toonScrolhint();
    balk.hidden = b.regels.length === 0;
    balk.querySelector("a").textContent = t("Je bestelling: ", "Your order: ") + stuks(n) + " · " + euro(b.totaal) + t(" excl. btw", " excl. VAT");
  };

  // ---------- Bestelling plaatsen ----------
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var b = berekening();
    var status = form.querySelector(".formulier__status");
    var knop = form.querySelector("button[type=submit]");
    if (!b.regels.length) return;
    status.className = "formulier__status";
    status.textContent = "";
    knop.disabled = true;
    knop.textContent = t("Bestelling wordt geplaatst…", "Placing your order…");

    var spoed = form.spoed.checked, opmerking = form.opmerking.value.trim();
    window.vmvHoreca.db.rpc("plaats_bestelling", {
      regels: b.regels.map(function (r) { return { product_id: r.p.id, aantal: r.aantal }; }),
      spoed: spoed,
      opmerking: opmerking || null
    })
      .then(function (r) {
        if (r.error) throw r.error;
        var best = r.data;
        // Mail naar VMV met alle details; de klant krijgt automatisch een bevestiging
        var regelsTekst = best.regels.map(function (x) {
          return x.aantal + " × " + x.omschrijving + " à " + euro(x.prijs_ex) + (x.korting_pct > 0 ? " (" + x.korting_pct + "% korting)" : "") +
            " = " + euro(x.regel_ex) + (x.allocatie ? " [ALLOCATIE-AANVRAAG]" : "");
        }).join("\n");
        // Zolang Resend nog niet naar klanten mailt, gaat de mail naar VMV en het overzicht
        // voor de klant via FormSubmit; daarna verstuurt de database alles zelf (zie supabase/005)
        if (pagina.dataset.klantmail !== "resend") fetch(pagina.dataset.mail, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            _subject: "Horecabestelling " + best.bestelnummer + " – " + klant.bedrijfsnaam + (spoed ? " – SPOED" : ""),
            _template: "box", _captcha: "false", _replyto: klant.email,
            _autoresponse: "Bedankt voor je bestelaanvraag " + best.bestelnummer + " bij VMV Wijnimport. Dit is nog geen bevestiging: we controleren eerst de voorraad en sturen je een bevestiging zodra je bestelling definitief is. Je overzicht staat in het horecaportaal onder 'Je bestellingen'. Na levering ontvang je een factuur met een betaaltermijn van " + inst.betaaltermijn_dagen + " dagen.",
            email: klant.email,
            bestelnummer: best.bestelnummer,
            klant: klant.bedrijfsnaam + " (" + klant.contactpersoon + ", " + klant.telefoon + ")",
            afleveradres: klant.straat + ", " + klant.postcode + " " + klant.plaats,
            spoed: spoed ? "JA" : "nee",
            bestelling: regelsTekst,
            totaal_excl_btw: euro(best.totaal_ex),
            allocatie: best.bevat_aanvraag ? "Bevat allocatiewijnen: aantallen bevestigen" : "nee",
            opmerking: opmerking || "-"
          })
        }).catch(function () {});

        mandje = {};
        bewaar();
        form.reset();
        toon();
        leeg.hidden = true;
        klaar.hidden = false;
        klaar.querySelector("[data-mandje=klaar]").textContent = EN
          ? "We’ve received your order " + best.bestelnummer + " (" + euro(best.totaal_ex) + " excl. VAT). " +
            (best.bevat_aanvraag ? "For allocated wines, we’ll confirm how many we can deliver. " : "") +
            "Your order is only final once we’ve confirmed it; if we’re short of a wine, we’ll get in touch. You’ll receive an invoice with a payment term of " + inst.betaaltermijn_dagen + " days."
          : "We hebben je bestelling " + best.bestelnummer + " ontvangen (" + euro(best.totaal_ex) + " excl. btw). " +
            (best.bevat_aanvraag ? "Voor de wijnen op allocatie bevestigen we het aantal dat we kunnen leveren. " : "") +
            "Je bestelling is pas definitief als wij hem hebben bevestigd; is er van een wijn te weinig voorraad, dan nemen we contact met je op. Je ontvangt een factuur met een betaaltermijn van " + inst.betaaltermijn_dagen + " dagen.";
        klaar.focus();
        laadBestellingen();
      })
      .catch(function (err) {
        status.classList.add("fout");
        status.textContent = (err && err.message && !/fetch|network/i.test(err.message))
          ? err.message + "." : t("Je bestelling is niet geplaatst. Probeer het opnieuw of mail ons op info@vmvwijnimport.com.", "Your order wasn’t placed. Please try again or email us at info@vmvwijnimport.com.");
      })
      .finally(function () { knop.disabled = false; knop.textContent = t("Bestelling plaatsen", "Place order"); });
  });

  // ---------- Tabbladen: Bestellen en Je bestellingen (via het adres #je-bestellingen) ----------
  var panelen = pagina.querySelectorAll("[data-paneel]");
  var tabblad = function () {
    var naam = location.hash === "#je-bestellingen" ? "je-bestellingen" : "bestellen";
    panelen.forEach(function (p) { p.hidden = p.dataset.paneel !== naam; });
    pagina.querySelectorAll("[data-tab]").forEach(function (a) {
      if (a.dataset.tab === naam) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  };
  window.addEventListener("hashchange", function () {
    if (location.hash === "#je-bestellingen" || location.hash === "#bestellen-horeca") {
      tabblad();
      pagina.querySelector(".tabbladen").scrollIntoView();
    }
  });
  tabblad();

  // ---------- Bestel opnieuw: dezelfde wijnen en aantallen in het mandje ----------
  // Wat niet meer te bestellen is (uitverkocht of uit het assortiment), slaan we over en noemen we.
  var opnieuwKnop = function (b) {
    var vak = el("div", "bestelling__opnieuw");
    var knop = el("button", "knop knop--secundair", t("Bestel opnieuw", "Order again"));
    knop.type = "button";
    var status = el("p", "formulier__status");
    status.setAttribute("role", "status");
    knop.addEventListener("click", function () {
      var gezet = 0, overgeslagen = [];
      b.bestelregels.forEach(function (x) {
        var p = perId[x.product_id];
        if (!p || p.beschikbaarheid === "uitverkocht") { overgeslagen.push(x.omschrijving); return; }
        zet(p.id, (mandje[p.id] || 0) + x.aantal);
        gezet++;
      });
      status.textContent = "";
      status.className = "formulier__status" + (gezet ? " goed" : " fout");
      status.appendChild(document.createTextNode(gezet
        ? t("In je mandje gezet. ", "Added to your order. ") + (overgeslagen.length ? t("Niet meer te bestellen: ", "No longer available: ") + overgeslagen.join(", ") + ". " : "")
        : t("Deze wijnen zijn niet meer te bestellen.", "These wines are no longer available.")));
      if (gezet) {
        var a = el("a", null, t("Naar je mandje", "Go to your order"));
        a.href = "#bestellen-horeca";
        status.appendChild(a);
      }
    });
    vak.appendChild(knop);
    vak.appendChild(status);
    return vak;
  };

  // ---------- Voorstel van VMV: akkoord of niet (supabase/020, klant_voorstel) ----------
  var voorstelVak = function (b) {
    var vak = el("div", "portaal__voorstel");
    vak.appendChild(el("h3", null, t("Ons voorstel", "Our proposal")));
    vak.appendChild(el("p", null, t("Niet alles is leverbaar zoals besteld. Dit stellen we voor; de rest leveren we zoals besteld.",
      "Not everything is available as ordered. This is what we propose; we’ll deliver the rest as ordered.")));
    var ul = el("ul", "mandje__regels");
    ((b.voorstel && b.voorstel.wijzigingen) || []).forEach(function (w) {
      var li = el("li");
      var regel = el("span", null, w.omschrijving);
      var info = [w.leveren === 0 ? t("niet leverbaar", "not available") : w.leveren < w.besteld ? (EN ? "we deliver " + w.leveren + " instead of " + w.besteld : "we leveren " + w.leveren + " in plaats van " + w.besteld) : ""];
      if (w.vervangen_door) info.push(t("in plaats daarvan ", "instead: ") + w.vervangen_aantal + " × " + w.vervangen_door + t(" à ", " at ") + euro(w.vervangen_prijs_ex) + t(" excl. btw", " excl. VAT"));
      regel.appendChild(el("small", null, info.filter(Boolean).join(", ")));
      li.appendChild(regel);
      ul.appendChild(li);
    });
    vak.appendChild(ul);
    var knoppen = el("div", "portaal__voorstelknoppen");
    var status = el("p", "formulier__status");
    status.setAttribute("role", "status");
    [[true, t("Akkoord", "Accept"), "knop knop--primair"], [false, t("Niet akkoord", "Decline"), "knop knop--secundair"]].forEach(function (o) {
      var k = el("button", o[2], o[1]);
      k.type = "button";
      k.addEventListener("click", function () {
        knoppen.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
        status.className = "formulier__status";
        status.textContent = t("Bezig…", "One moment…");
        window.vmvHoreca.db.rpc("klant_voorstel", { bestelling: b.id, akkoord: o[0] })
          .then(function (r) {
            if (r.error) throw r.error;
            laadBestellingen();
          })
          .catch(function (err) {
            knoppen.querySelectorAll("button").forEach(function (x) { x.disabled = false; });
            status.className = "formulier__status fout";
            status.textContent = (err && /niet meer open/.test(err.message)) ? t("Dit voorstel is niet meer open. Ververs de pagina.", "This proposal is no longer open. Please refresh the page.")
              : t("Dat lukte niet. Probeer het opnieuw of mail ons op info@vmvwijnimport.com.", "That didn’t work. Please try again or email us at info@vmvwijnimport.com.");
          });
      });
      knoppen.appendChild(k);
    });
    vak.appendChild(knoppen);
    vak.appendChild(el("p", "horeca__klein", t("Bij akkoord is je bestelling bevestigd en krijg je de bevestiging met de bedragen. Niet akkoord? Dan nemen we contact met je op.",
      "If you accept, your order is confirmed and you’ll receive the confirmation with the amounts. If you decline, we’ll get in touch.")));
    vak.appendChild(status);
    return vak;
  };

  // ---------- Eerdere bestellingen ----------
  var STATUS = EN
    ? { ontvangen: "Awaiting confirmation", voorstel: "Proposal: please respond", bevestigd: "Confirmed", geleverd: "Delivered", geannuleerd: "Cancelled" }
    : { ontvangen: "Wacht op bevestiging", voorstel: "Voorstel: graag je akkoord", bevestigd: "Bevestigd", geleverd: "Geleverd", geannuleerd: "Geannuleerd" };
  var bestelDoel = pagina.querySelector("[data-bestellingen]");
  var laadBestellingen = function () {
    window.vmvHoreca.db.from("bestellingen")
      .select("id, bestelnummer, besteld_op, status, spoed, totaal_ex, bevat_aanvraag, bericht_klant, voorstel, bestelregels(id, product_id, omschrijving, aantal, prijs_ex, korting_pct, regel_ex, allocatie, toegewezen, vervangt)")
      .order("besteld_op", { ascending: false })
      .then(function (r) {
        bestelDoel.textContent = "";
        if (r.error) throw r.error;
        var open = r.data.filter(function (b) { return b.status === "ontvangen"; }).length;
        var voorstellen = r.data.filter(function (b) { return b.status === "voorstel"; }).length;
        pagina.querySelector("[data-teller=bestellingen]").textContent = voorstellen
          ? "(" + voorstellen + (EN ? (voorstellen === 1 ? " proposal)" : " proposals)") : (voorstellen === 1 ? " voorstel)" : " voorstellen)"))
          : open ? "(" + open + t(" wacht op bevestiging)", " awaiting confirmation)") : r.data.length ? "(" + r.data.length + ")" : "";
        if (!r.data.length) { bestelDoel.appendChild(el("p", "horeca__klein", t("Je hebt nog geen bestellingen geplaatst.", "You haven’t placed any orders yet."))); return; }
        r.data.forEach(function (b) {
          // Na bevestiging telt het aantal dat VMV levert (toegewezen; leeg = besteld), zoals in de bevestigingsmail
          var bevestigd = b.status === "bevestigd" || b.status === "geleverd";
          var totaal = 0;
          b.bestelregels.sort(function (x, y) { return x.id - y.id; });
          b.bestelregels.forEach(function (x) {
            x.getoond = bevestigd && x.toegewezen != null ? x.toegewezen : x.aantal;
            x.bedrag = bevestigd ? Math.round(x.prijs_ex * 100) * x.getoond / 100 : Number(x.regel_ex);
            totaal += Math.round(x.bedrag * 100);
          });
          var d = el("details", "bestelling");
          if (b.status === "voorstel") d.open = true;
          var s = el("summary", "bestelling__kop");
          s.appendChild(el("span", "bestelling__nummer", b.bestelnummer));
          s.appendChild(el("span", null, new Date(b.besteld_op).toLocaleDateString(EN ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric" })));
          s.appendChild(el("span", "label", STATUS[b.status] || b.status));
          s.appendChild(el("span", "bestelling__totaal", euro(totaal / 100) + t(" excl. btw", " excl. VAT")));
          d.appendChild(s);
          var ul = el("ul", "mandje__regels");
          b.bestelregels.forEach(function (x) {
            var li = el("li");
            var links = el("span", null, x.getoond + " × " + x.omschrijving);
            var extra = [];
            if (x.korting_pct > 0) extra.push(EN ? x.korting_pct + "% volume discount" : String(x.korting_pct).replace(".", ",") + "% schenkkorting");
            // Vervangende wijnen (supabase/020)
            var origineel = x.vervangt && b.bestelregels.filter(function (y) { return y.id === x.vervangt; })[0];
            var vervanger = b.bestelregels.filter(function (y) { return y.vervangt === x.id; })[0];
            if (origineel) extra.push(t("in plaats van ", "instead of ") + origineel.omschrijving);
            else if (x.getoond !== x.aantal) extra.push(x.getoond === 0
              ? (vervanger ? t("vervangen (besteld: ", "replaced (ordered: ") : t("niet leverbaar (besteld: ", "not available (ordered: ")) + x.aantal + ")"
              : t("besteld: ", "ordered: ") + x.aantal + t(", we leveren: ", ", we deliver: ") + x.getoond);
            else if (x.allocatie && !bevestigd) extra.push(t("allocatie-aanvraag", "allocation request"));
            if (vervanger && x.getoond !== 0) extra.push(t("de rest vervangen door ", "the rest replaced by ") + vervanger.omschrijving);
            if (extra.length) links.appendChild(el("small", null, extra.join(" · ")));
            li.appendChild(links);
            li.appendChild(el("span", null, euro(x.bedrag)));
            ul.appendChild(li);
          });
          if (b.bericht_klant) d.appendChild(el("p", "bestel__voorbehoud", t("Bericht van ons: ", "Message from us: ") + b.bericht_klant));
          if (b.status === "voorstel") d.appendChild(voorstelVak(b));
          d.appendChild(ul);
          if (b.spoed) d.appendChild(el("p", "horeca__klein", t("Met spoed besteld.", "Ordered as urgent."))); 
          d.appendChild(opnieuwKnop(b));
          bestelDoel.appendChild(d);
        });
      })
      .catch(function () { bestelDoel.textContent = t("Je bestellingen konden niet worden geladen.", "Your orders couldn’t be loaded."); });
  };

  // ---------- Start ----------
  document.addEventListener("horeca:goedgekeurd", function (e) {
    klant = e.detail.klant;
    klantId = e.detail.id;
    mandjeEl.querySelector("[data-mandje=adres]").textContent =
      klant.bedrijfsnaam + ", " + klant.straat + ", " + klant.postcode + " " + klant.plaats;
    laadBestellingen();
  });
  document.addEventListener("horeca:assortiment", function (e) {
    producten = e.detail.producten;
    inst = e.detail.instellingen;
    perId = {};
    producten.forEach(function (p) { perId[p.id] = p; });
    mandjeEl.querySelector("[data-mandje=termijn]").textContent = inst.betaaltermijn_dagen;
    laad();
    // Producten die niet meer bestaan of uitverkocht zijn uit het mandje halen
    Object.keys(mandje).forEach(function (id) {
      if (!perId[id] || perId[id].beschikbaarheid === "uitverkocht") delete mandje[id];
    });
    voegKnoppenToe();
    toon();
  });
})();
