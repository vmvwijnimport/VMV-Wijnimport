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

  var euro = function (n) { return "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
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

  var voegKnoppenToe = function () {
    document.querySelectorAll("#assortiment .wijnregel").forEach(function (li) {
      var id = li.dataset.product, p = perId[id];
      if (!p || li.querySelector(".aantal")) return;
      var vak = el("span", "wijnregel__bestel");
      if (p.beschikbaarheid === "uitverkocht") { li.appendChild(vak); return; }
      var groep = el("span", "aantal aantal--licht");
      groep.setAttribute("role", "group");
      groep.setAttribute("aria-label", "Aantal " + omschrijving(p));
      var min = el("button", "aantal__knop", "−"); min.type = "button"; min.setAttribute("aria-label", "Eén minder");
      var veld = el("input", "aantal__veld"); veld.type = "number"; veld.min = "0"; veld.inputMode = "numeric";
      veld.setAttribute("aria-label", "Aantal " + (p.soort === "glas" ? "glazen" : "flessen") + " " + omschrijving(p));
      var plus = el("button", "aantal__knop", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Eén meer");
      min.addEventListener("click", function () { zet(id, (mandje[id] || 0) - 1); });
      plus.addEventListener("click", function () { zet(id, (mandje[id] || 0) + 1); });
      veld.addEventListener("change", function () { zet(id, veld.value); });
      groep.appendChild(min); groep.appendChild(veld); groep.appendChild(plus);
      vak.appendChild(groep);
      if (p.soort !== "glas") {
        var doos = el("button", "tekstknop wijnregel__doos", "+ doos");
        doos.type = "button";
        doos.setAttribute("aria-label", "Voeg een doos van 6 flessen toe: " + omschrijving(p));
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

  var toon = function () {
    document.querySelectorAll("#assortiment .wijnregel").forEach(function (li) {
      var veld = li.querySelector(".aantal__veld");
      if (veld) veld.value = mandje[li.dataset.product] || 0;
      li.classList.toggle("wijnregel--gekozen", !!mandje[li.dataset.product]);
    });
    var b = berekening();
    leeg.hidden = b.regels.length > 0;
    inhoud.hidden = b.regels.length === 0;
    if (b.regels.length) klaar.hidden = true;

    var lijst = mandjeEl.querySelector(".mandje__regels");
    lijst.textContent = "";
    b.regels.forEach(function (r) {
      var li = el("li");
      var links = el("span", null, r.aantal + " × " + omschrijving(r.p));
      var extra = [];
      if (r.korting) extra.push(String(r.korting).replace(".", ",") + "% schenkkorting");
      if (r.p.soort === "glas" && b.glazen >= inst.glas_staffel_vanaf) extra.push("staffelprijs vanaf " + inst.glas_staffel_vanaf + " glazen");
      if (r.p.allocatie) extra.push("aanvraag, wij bevestigen het aantal");
      if (extra.length) links.appendChild(el("small", null, extra.join(" · ")));
      li.appendChild(links);
      li.appendChild(el("span", null, euro(r.regel)));
      lijst.appendChild(li);
    });
    mandjeEl.querySelector("[data-totaal=ex]").textContent = euro(b.totaal);
    mandjeEl.querySelector("[data-totaal=btw]").textContent = euro(b.totaal * 0.21);
    mandjeEl.querySelector("[data-totaal=incl]").textContent = euro(b.totaal * 1.21);

    var tips = [];
    if (b.aanvraag) tips.push("Wijnen op allocatie zijn een aanvraag: we bevestigen het aantal dat we kunnen leveren.");
    var glasTekort = inst.glas_staffel_vanaf - b.glazen;
    if (b.glazen > 0 && glasTekort > 0) tips.push("Nog " + glasTekort + (glasTekort === 1 ? " glas" : " glazen") + " voor de staffelprijs van " + euro(inst.glas_staffel_prijs_ex) + " excl. btw per glas.");
    if (inst.minimale_bestelling_ex && b.totaal < inst.minimale_bestelling_ex) tips.push("De minimale bestelling is " + euro(inst.minimale_bestelling_ex) + " excl. btw.");
    mandjeEl.querySelector("[data-mandje=tip]").textContent = tips.join(" ");

    var stuks = b.flessen + b.glazen;
    balk.hidden = b.regels.length === 0;
    balk.querySelector("a").textContent = "Je bestelling: " + stuks + (stuks === 1 ? " stuk" : " stuks") + " · " + euro(b.totaal) + " excl. btw";
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
    knop.textContent = "Bestelling wordt geplaatst…";

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
        fetch(pagina.dataset.mail, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            _subject: "Horecabestelling " + best.bestelnummer + " – " + klant.bedrijfsnaam + (spoed ? " – SPOED" : ""),
            _template: "box", _captcha: "false", _replyto: klant.email,
            _autoresponse: "Bedankt voor je bestelling " + best.bestelnummer + " bij VMV Wijnimport. We hebben hem ontvangen en nemen contact met je op over de levering. Je ontvangt een factuur met een betaaltermijn van " + inst.betaaltermijn_dagen + " dagen.",
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
        klaar.querySelector("[data-mandje=klaar]").textContent =
          "We hebben je bestelling " + best.bestelnummer + " ontvangen (" + euro(best.totaal_ex) + " excl. btw). " +
          (best.bevat_aanvraag ? "Voor de wijnen op allocatie bevestigen we het aantal dat we kunnen leveren. " : "") +
          "We nemen contact met je op over de levering. Je ontvangt een factuur met een betaaltermijn van " + inst.betaaltermijn_dagen + " dagen.";
        klaar.focus();
        laadBestellingen();
      })
      .catch(function (err) {
        status.classList.add("fout");
        status.textContent = (err && err.message && !/fetch|network/i.test(err.message))
          ? err.message + "." : "Je bestelling is niet geplaatst. Probeer het opnieuw of mail ons op info@vmvwijnimport.com.";
      })
      .finally(function () { knop.disabled = false; knop.textContent = "Bestelling plaatsen"; });
  });

  // ---------- Eerdere bestellingen ----------
  var STATUS = { ontvangen: "Ontvangen", bevestigd: "Bevestigd", geleverd: "Geleverd", geannuleerd: "Geannuleerd" };
  var bestelDoel = pagina.querySelector("[data-bestellingen]");
  var laadBestellingen = function () {
    window.vmvHoreca.db.from("bestellingen")
      .select("bestelnummer, besteld_op, status, spoed, totaal_ex, bevat_aanvraag, bestelregels(omschrijving, aantal, prijs_ex, korting_pct, regel_ex, allocatie, toegewezen)")
      .order("besteld_op", { ascending: false })
      .then(function (r) {
        bestelDoel.textContent = "";
        if (r.error) throw r.error;
        if (!r.data.length) { bestelDoel.appendChild(el("p", "horeca__klein", "Je hebt nog geen bestellingen geplaatst.")); return; }
        r.data.forEach(function (b) {
          var d = el("details", "bestelling");
          var s = el("summary", "bestelling__kop");
          s.appendChild(el("span", "bestelling__nummer", b.bestelnummer));
          s.appendChild(el("span", null, new Date(b.besteld_op).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })));
          s.appendChild(el("span", "label", STATUS[b.status] || b.status));
          s.appendChild(el("span", "bestelling__totaal", euro(b.totaal_ex) + " excl. btw"));
          d.appendChild(s);
          var ul = el("ul", "mandje__regels");
          b.bestelregels.forEach(function (x) {
            var li = el("li");
            var links = el("span", null, x.aantal + " × " + x.omschrijving);
            var extra = [];
            if (x.korting_pct > 0) extra.push(String(x.korting_pct).replace(".", ",") + "% schenkkorting");
            if (x.allocatie) extra.push(x.toegewezen != null ? "toegewezen: " + x.toegewezen : "allocatie-aanvraag");
            if (extra.length) links.appendChild(el("small", null, extra.join(" · ")));
            li.appendChild(links);
            li.appendChild(el("span", null, euro(x.regel_ex)));
            ul.appendChild(li);
          });
          d.appendChild(ul);
          if (b.spoed) d.appendChild(el("p", "horeca__klein", "Met spoed besteld."));
          bestelDoel.appendChild(d);
        });
      })
      .catch(function () { bestelDoel.textContent = "Je bestellingen konden niet worden geladen."; });
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
