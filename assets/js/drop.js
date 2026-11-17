// Droppagina (/drop/?c=<code>): haalt de wijn op uit de database (drop_aanbod, supabase/022-drops.sql)
// en legt hem in het winkelmandje (assets/js/winkel.js, event "vmv:wijn"). Afrekenen gaat in de lade.
// Meer wijnen in één link (/drop/?c=<code>-<code>): elke wijn krijgt een eigen kaart, naast elkaar.
document.addEventListener("DOMContentLoaded", function () {
  var pagina = document.getElementById("drop");
  if (!pagina) return;
  var EN = document.documentElement.lang === "en";
  var veld = function (naam, binnen) { return (binnen || pagina).querySelector("[data-veld=" + naam + "]"); };
  // Maximaal drie wijnen; dubbele codes tellen één keer
  var codes = [];
  ((location.search.match(/[?&]c=([A-Za-z0-9,.\-]+)/) || [])[1] || "").toLowerCase().split(/[^a-z0-9]+/).forEach(function (c) {
    if (c && codes.indexOf(c) < 0 && codes.length < 3) codes.push(c);
  });
  var code = codes.join("-");

  // De taalkeuze (op de pagina en rechtsboven) houdt de code vast, en wordt onthouden (zie head.html)
  document.querySelectorAll(".drop__taal a, .taalkeuze a[hreflang]").forEach(function (a) {
    if (code) a.href = a.pathname + "?c=" + encodeURIComponent(code);
  });
  pagina.querySelectorAll(".drop__taal a").forEach(function (a) {
    a.addEventListener("click", function () {
      try { localStorage.setItem("vmv-taal", a.getAttribute("hreflang")); } catch (e) {}
    });
  });

  var toestand = function (naam) {
    pagina.querySelectorAll("[data-toestand]").forEach(function (el) { el.hidden = el.dataset.toestand !== naam; });
  };
  var euro = function (bedrag) {
    var tekst = Number(bedrag).toFixed(2).replace(".00", "");
    return "€" + (EN ? tekst : tekst.replace(".", ","));
  };
  var moment = function (iso) {
    return new Date(iso).toLocaleString(EN ? "en-GB" : "nl-NL", {
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam"
    });
  };
  var fles = function (n) { return EN ? (n === 1 ? " bottle" : " bottles") : (n === 1 ? " fles" : " flessen"); };
  var KLEUR = EN ? { wit: "White", rood: "Red", rose: "Rosé" } : { wit: "Wit", rood: "Rood", rose: "Rosé" };
  var fotos = {};
  try { JSON.parse(document.getElementById("drop-fotos").textContent).forEach(function (p) { if (p) fotos[p[0]] = p[1]; }); } catch (e) {}
  var producentLink = function (a) { return (EN ? "/en/producers/" : "/producenten/") + a.slug + "/"; };

  if (!codes.length) { toestand("onbekend"); return; }

  var ophalen = function (c) {
    return fetch(pagina.dataset.url + "/rest/v1/rpc/drop_aanbod", {
      method: "POST",
      headers: { apikey: pagina.dataset.sleutel, Authorization: "Bearer " + pagina.dataset.sleutel, "Content-Type": "application/json" },
      body: JSON.stringify({ drop_code: c })
    }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); });
  };

  // Eén wijn: foto links, de wijn met aantal en knop rechts
  var kaartVan = function (kaart) {
    var aanbod = null;
    var invoer = kaart.querySelector(".drop__aantal .aantal__veld");
    var maximum = function () {
      if (!aanbod) return 1;
      return Math.max(1, aanbod.max ? Math.min(aanbod.beschikbaar, aanbod.max) : aanbod.beschikbaar);
    };
    var zetAantal = function (n) {
      invoer.value = Math.max(1, Math.min(maximum(), parseInt(n, 10) || 1));
    };
    kaart.querySelectorAll(".drop__aantal [data-stap]").forEach(function (k) {
      k.addEventListener("click", function () { zetAantal((parseInt(invoer.value, 10) || 1) + parseInt(k.dataset.stap, 10)); });
    });
    invoer.addEventListener("change", function () { zetAantal(invoer.value); });

    var toon = function (a) {
      aanbod = a;
      var foto = a.foto || fotos[a.slug];
      veld("fotovak", kaart).hidden = !foto;
      if (foto) { veld("foto", kaart).src = foto; veld("foto", kaart).alt = a.naam || ""; }

      var producent = veld("producent", kaart);
      producent.textContent = "";
      if (a.slug) {
        var link = document.createElement("a");
        link.href = producentLink(a);
        link.textContent = a.producent;
        producent.appendChild(link);
      } else if (a.producent) {
        producent.appendChild(document.createTextNode(a.producent));
      }
      if (a.regio) producent.appendChild(document.createTextNode(", " + a.regio));

      veld("naam", kaart).textContent = (a.wijn || "") + (a.jaargang ? " " + a.jaargang : "");
      veld("kenmerken", kaart).textContent = [a.druif, KLEUR[a.kleur], a.formaat].filter(Boolean).join(", ");
      veld("prijs", kaart).textContent = a.prijs ? euro(a.prijs) : "";

      var voorraad = veld("voorraad", kaart);
      voorraad.textContent = "";
      voorraad.className = "drop__voorraad";
      var open = a.status === "open" && a.beschikbaar > 0;
      if (a.status === "uitverkocht" || a.status === "voorbij") {
        var label = document.createElement("span");
        label.className = "label label--uitverkocht";
        label.textContent = a.status === "voorbij" ? (EN ? "This drop has ended" : "Deze drop is voorbij") : (EN ? "Sold out" : "Uitverkocht");
        voorraad.appendChild(label);
      } else if (a.status === "vol") {
        voorraad.textContent = EN ? "All bottles are reserved right now. If any become available, you’ll see them here within half an hour."
                                  : "Alle flessen zijn nu gereserveerd. Komt er iets vrij, dan zie je dat hier binnen een half uur.";
      } else if (open && a.toon_aantal) {
        voorraad.classList.add("drop__voorraad--stip");
        voorraad.textContent = EN ? a.beschikbaar + fles(a.beschikbaar) + " left" : "Nog " + a.beschikbaar + fles(a.beschikbaar);
      }
      veld("bestel", kaart).hidden = !open;
      zetAantal(invoer.value);

      var regels = [];
      if (open && a.max) regels.push(EN ? "Up to " + a.max + fles(a.max) + " per customer." : "Maximaal " + a.max + fles(a.max) + " per klant.");
      if (open && a.open_tot) regels.push(EN ? "Available until " + moment(a.open_tot) + "." : "Te bestellen tot " + moment(a.open_tot) + ".");
      veld("regels", kaart).textContent = regels.join(" ");
      veld("regels", kaart).hidden = !regels.length;
      var levering = EN ? (a.levering_en || a.levering) : a.levering;
      veld("levering", kaart).textContent = levering ? (EN ? "Delivery: " : "Levering: ") + levering : "";
      veld("levering", kaart).hidden = !levering;

      // De tekst van de eigenaar, met een witregel tussen alinea's
      var tekst = veld("tekst", kaart);
      tekst.textContent = "";
      String((EN ? a.tekst_en || a.tekst : a.tekst) || "").split(/\n\s*\n/).forEach(function (alinea) {
        if (!alinea.trim()) return;
        var p = document.createElement("p");
        alinea.trim().split("\n").forEach(function (regel, i) {
          if (i) p.appendChild(document.createElement("br"));
          p.appendChild(document.createTextNode(regel));
        });
        tekst.appendChild(p);
      });
      tekst.hidden = !tekst.childNodes.length;

      var meer = veld("meer", kaart);
      meer.hidden = !a.slug;
      if (!meer.hidden) {
        meer.querySelector("a").href = producentLink(a);
        meer.querySelector("a").textContent = (EN ? "More about " : "Meer over ") + a.producent;
      }
    };

    veld("erin", kaart).addEventListener("click", function () {
      var knop = this;
      knop.disabled = true;
      // Eerst kijken of er nog genoeg is, dan pas in het mandje
      ophalen(aanbod.code)
        .then(function (a) {
          if (!a.naam) a = { status: "voorbij", code: aanbod.code, naam: aanbod.naam, wijn: aanbod.wijn, jaargang: aanbod.jaargang,
                             producent: aanbod.producent, slug: aanbod.slug, regio: aanbod.regio, foto: aanbod.foto };
          toon(a);
          if (a.status !== "open" || a.beschikbaar <= 0) return;
          var n = Math.min(parseInt(invoer.value, 10) || 1, maximum());
          document.dispatchEvent(new CustomEvent("vmv:wijn", { detail: { aanbod: a, aantal: n } }));
        })
        .catch(function () {
          veld("voorraad", kaart).textContent = EN ? "That didn’t work. Please try again." : "Dat lukte niet. Probeer het opnieuw.";
        })
        .finally(function () { knop.disabled = false; });
    });
    return toon;
  };

  var sjabloon = pagina.querySelector(".drop__wijn");
  var binnenkort = function (lijst) {
    var eerst = lijst.map(function (a) { return a.open_vanaf; }).sort()[0];
    veld("opent").textContent = EN ? "This drop opens on " + moment(eerst) + "." : "Deze drop gaat open op " + moment(eerst) + ".";
    toestand("binnenkort");
  };

  // Eén wijn: zoals altijd
  var enkel = function (a) {
    if (a.status === "onbekend") { toestand("onbekend"); return; }
    if (a.status === "binnenkort") { binnenkort([a]); return; }
    document.title = a.naam + " | VMV Wijnimport";
    kaartVan(sjabloon)(a);
    toestand("wijn");
  };

  // ---------- Twee of drie wijnen: de wijnkaart ----------
  var WOORD = EN ? ["", "", "Two", "Three"] : ["", "", "Twee", "Drie"];
  var lijstAanbod = [];        // de wijnen zoals ze nu op de pagina staan
  var gekozen = {};            // code → aantal
  var actief = 0;              // de wijn waarvan de foto nu groot staat

  var toonFoto = function (i, scrollen) {
    actief = i;
    var fotoVak = veld("fotos");
    var plaatjes = fotoVak.children;
    Array.prototype.forEach.call(plaatjes, function (f, j) { f.classList.toggle("is-actief", j === i); });
    veld("stippen").querySelectorAll("button").forEach(function (b, j) { b.setAttribute("aria-pressed", j === i ? "true" : "false"); });
    veld("lijst").querySelectorAll(".drop__rij").forEach(function (r, j) { r.classList.toggle("is-actief", j === i); });
    // Op de telefoon staan de foto's naast elkaar om doorheen te vegen
    if (scrollen && plaatjes[i] && fotoVak.scrollWidth > fotoVak.clientWidth) {
      fotoVak.scrollTo({ left: plaatjes[i].offsetLeft - fotoVak.offsetLeft, behavior: "smooth" });
    }
  };

  var totaal = function () {
    var flessen = 0, bedrag = 0;
    lijstAanbod.forEach(function (a) { var n = gekozen[a.code] || 0; flessen += n; bedrag += n * Number(a.prijs); });
    var t = veld("totaal");
    t.textContent = "";
    if (!flessen) { t.textContent = EN ? "Choose your bottles" : "Kies je flessen"; t.classList.remove("is-gekozen"); return; }
    t.classList.add("is-gekozen");
    t.appendChild(el("span", null, flessen + fles(flessen)));
    t.appendChild(el("strong", null, euro(bedrag)));
  };
  var el = function (tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  };

  var maakRij = function (a, i) {
    var rij = el("li", "drop__rij");
    rij.dataset.code = a.code;
    var naam = el("div", "drop__rijnaam");
    var stip = el("span", "drop__kleurstip drop__kleurstip--" + (a.kleur || "wit"));
    stip.setAttribute("aria-hidden", "true");
    naam.appendChild(stip);
    var tekst = el("div");
    tekst.appendChild(el("h2", null, (a.wijn || "") + (a.jaargang ? " " + a.jaargang : "")));
    tekst.appendChild(el("p", "drop__rijklein", [a.druif, KLEUR[a.kleur], a.formaat].filter(Boolean).join(", ")));
    naam.appendChild(tekst);
    rij.appendChild(naam);

    var rechts = el("div", "drop__rijkoop");
    rechts.appendChild(el("p", "drop__rijprijs", euro(a.prijs)));
    var open = a.status === "open" && a.beschikbaar > 0;
    var max = Math.max(0, a.max ? Math.min(a.beschikbaar, a.max) : a.beschikbaar);
    if (open) {
      var aantal = el("div", "aantal aantal--licht drop__rijaantal");
      aantal.setAttribute("role", "group");
      aantal.setAttribute("aria-label", (EN ? "Bottles of " : "Flessen ") + a.wijn);
      var min = el("button", "aantal__knop", "−"), veldje = el("input", "aantal__veld"), plus = el("button", "aantal__knop", "+");
      min.type = plus.type = "button";
      min.setAttribute("aria-label", EN ? "One fewer" : "Eén minder");
      plus.setAttribute("aria-label", EN ? "One more" : "Eén meer");
      veldje.type = "number"; veldje.min = "0"; veldje.max = String(max); veldje.inputMode = "numeric"; veldje.value = gekozen[a.code] || 0;
      veldje.setAttribute("aria-label", (EN ? "Bottles of " : "Flessen ") + a.wijn);
      var zet = function (n) {
        n = Math.max(0, Math.min(max, parseInt(n, 10) || 0));
        gekozen[a.code] = n;
        veldje.value = n;
        rij.classList.toggle("is-gekozen", n > 0);
        veld("samenfout").hidden = true;
        totaal();
      };
      min.addEventListener("click", function () { zet((gekozen[a.code] || 0) - 1); });
      plus.addEventListener("click", function () { zet((gekozen[a.code] || 0) + 1); });
      veldje.addEventListener("change", function () { zet(veldje.value); });
      aantal.appendChild(min); aantal.appendChild(veldje); aantal.appendChild(plus);
      rechts.appendChild(aantal);
      zet(gekozen[a.code] || 0);
    } else {
      var label = el("span", "label label--uitverkocht",
        a.status === "voorbij" ? (EN ? "Ended" : "Voorbij") : a.status === "vol" ? (EN ? "All reserved" : "Alles gereserveerd") : (EN ? "Sold out" : "Uitverkocht"));
      rechts.appendChild(label);
      rij.classList.add("is-op");
    }
    rij.appendChild(rechts);
    if (open && a.toon_aantal) naam.lastChild.appendChild(el("p", "drop__rijklein drop__rijvoorraad", EN ? a.beschikbaar + fles(a.beschikbaar) + " left" : "Nog " + a.beschikbaar + fles(a.beschikbaar)));
    else if (a.status === "vol") naam.lastChild.appendChild(el("p", "drop__rijklein", EN ? "If bottles become available, you’ll see them here within half an hour." : "Komt er iets vrij, dan zie je dat hier binnen een half uur."));

    // Aanwijzen of aantikken laat de foto van deze wijn zien
    rij.addEventListener("mouseenter", function () { toonFoto(i); });
    rij.addEventListener("focusin", function () { toonFoto(i); });
    rij.addEventListener("click", function () { toonFoto(i, true); });
    return rij;
  };

  var meer = function (lijst) {
    var wijnen = lijst.filter(function (a) { return a.naam; });
    if (!wijnen.length) {
      var later = lijst.filter(function (a) { return a.status === "binnenkort"; });
      if (later.length) binnenkort(later); else toestand("onbekend");
      return;
    }
    if (wijnen.length === 1) { enkel(wijnen[0]); return; }
    lijstAanbod = wijnen;
    var een = wijnen[0];
    var zelfde = wijnen.every(function (a) { return a.producent === een.producent; });
    var kop = WOORD[wijnen.length] + (zelfde ? (EN ? " wines from " : " wijnen van ") + een.producent : (EN ? " wines" : " wijnen"));
    veld("samennaam").textContent = kop;
    veld("samenproducent").textContent = zelfde ? een.regio || "" : "";
    veld("samenproducent").hidden = !veld("samenproducent").textContent;
    document.title = kop + " | VMV Wijnimport";

    // Foto's: de eigen foto van elke wijn, anders die van de producent (één keer als niemand een eigen foto heeft)
    var fotoVak = veld("fotos"), stippen = veld("stippen");
    fotoVak.textContent = ""; stippen.textContent = "";
    var eigen = wijnen.some(function (a) { return a.foto; });
    var bronnen = eigen ? wijnen.map(function (a) { return a.foto || fotos[a.slug]; }) : [fotos[een.slug]];
    bronnen.forEach(function (bron, i) {
      var f = el("figure", "drop__fotovak");
      if (bron) { var img = el("img"); img.src = bron; img.alt = eigen ? wijnen[i].naam : een.producent; f.appendChild(img); }
      fotoVak.appendChild(f);
    });
    veld("fotos").parentNode.hidden = !bronnen.some(Boolean);
    if (eigen) {
      wijnen.forEach(function (a, i) {
        var b = el("button", "drop__stip drop__kleurstip--" + (a.kleur || "wit"));
        b.type = "button";
        b.setAttribute("aria-label", (EN ? "Photo of " : "Foto van ") + a.wijn);
        b.addEventListener("click", function () { toonFoto(i, true); });
        stippen.appendChild(b);
      });
      // Vegen op de telefoon zet de goede stip aan
      var wacht;
      fotoVak.addEventListener("scroll", function () {
        clearTimeout(wacht);
        wacht = setTimeout(function () {
          var i = Math.round(fotoVak.scrollLeft / Math.max(1, fotoVak.children[0].offsetWidth));
          if (i !== actief && i < wijnen.length) toonFoto(i);
        }, 80);
      });
    }
    stippen.hidden = !eigen;

    var lijstVak = veld("lijst");
    lijstVak.textContent = "";
    wijnen.forEach(function (a, i) { lijstVak.appendChild(maakRij(a, i)); });
    toonFoto(0);
    totaal();

    var regels = [];
    if (een.max) regels.push(EN ? "Up to " + een.max + fles(een.max) + " of each wine per customer." : "Maximaal " + een.max + fles(een.max) + " per wijn per klant.");
    if (een.open_tot) regels.push(EN ? "Available until " + moment(een.open_tot) + "." : "Te bestellen tot " + moment(een.open_tot) + ".");
    veld("samenregels").textContent = regels.join(" ");
    veld("samenregels").hidden = !regels.length;
    var levering = EN ? (een.levering_en || een.levering) : een.levering;
    veld("samenlevering").textContent = levering ? (EN ? "Delivery: " : "Levering: ") + levering : "";
    veld("samenlevering").hidden = !levering;
    var kanKopen = wijnen.some(function (a) { return a.status === "open" && a.beschikbaar > 0; });
    veld("samenerin").parentNode.hidden = !kanKopen;

    var tekst = veld("samentekst");
    tekst.textContent = "";
    String((EN ? een.tekst_en || een.tekst : een.tekst) || "").split(/\n\s*\n/).forEach(function (alinea) {
      if (!alinea.trim()) return;
      var p = document.createElement("p");
      alinea.trim().split("\n").forEach(function (regel, i) {
        if (i) p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(regel));
      });
      tekst.appendChild(p);
    });
    tekst.hidden = !tekst.childNodes.length;

    var link = veld("samenmeer");
    link.hidden = !(zelfde && een.slug);
    if (!link.hidden) {
      link.querySelector("a").href = producentLink(een);
      link.querySelector("a").textContent = (EN ? "More about " : "Meer over ") + een.producent;
    }
    toestand("samen");
  };

  // Alles wat gekozen is in het mandje; per wijn eerst kijken of er nog genoeg is
  veld("samenerin").addEventListener("click", function () {
    var knop = this, fout = veld("samenfout");
    var keuze = lijstAanbod.filter(function (a) { return gekozen[a.code] > 0; });
    if (!keuze.length) {
      fout.textContent = EN ? "Choose how many bottles you’d like first." : "Kies eerst hoeveel flessen je wilt.";
      fout.hidden = false;
      return;
    }
    knop.disabled = true;
    Promise.all(keuze.map(function (a) { return ophalen(a.code); }))
      .then(function (nieuw) {
        var tekort = [];
        nieuw.forEach(function (a, i) {
          var n = gekozen[keuze[i].code];
          var max = a.max ? Math.min(a.beschikbaar, a.max) : a.beschikbaar;
          if (a.status !== "open" || max <= 0) { tekort.push(keuze[i].wijn); return; }
          if (n > max) { tekort.push(keuze[i].wijn); n = max; }
          document.dispatchEvent(new CustomEvent("vmv:wijn", { detail: { aanbod: a, aantal: n } }));
        });
        // De lijst opnieuw met de nieuwe voorraad, en de aantallen weer op nul
        gekozen = {};
        nieuw.forEach(function (a) {
          lijstAanbod = lijstAanbod.map(function (x) { return x.code === a.code && a.naam ? a : x; });
        });
        var lijstVak = veld("lijst");
        lijstVak.textContent = "";
        lijstAanbod.forEach(function (a, i) { lijstVak.appendChild(maakRij(a, i)); });
        toonFoto(actief);
        totaal();
        if (tekort.length) {
          fout.textContent = EN ? "Not everything was still available: " + tekort.join(", ") + ". Check your basket."
                                : "Niet alles was er nog: " + tekort.join(", ") + ". Kijk even in je mandje.";
          fout.hidden = false;
        }
      })
      .catch(function () {
        fout.textContent = EN ? "That didn’t work. Please try again." : "Dat lukte niet. Probeer het opnieuw.";
        fout.hidden = false;
      })
      .finally(function () { knop.disabled = false; });
  });

  // Eén code: die wijn, plus de andere wijnen van dezelfde drop (supabase/026). Meer codes in de link kan ook.
  Promise.all(codes.map(ophalen))
    .then(function (lijst) {
      var extra = [];
      lijst.forEach(function (a) {
        (a.samen || []).forEach(function (c) { if (codes.indexOf(c) < 0 && extra.indexOf(c) < 0) extra.push(c); });
      });
      if (lijst.length === 1 && !extra.length) { enkel(lijst[0]); return; }
      return Promise.all(extra.slice(0, 3).map(ophalen)).then(function (rest) { meer(lijst.concat(rest).slice(0, 3)); });
    })
    .catch(function () {
      veld("opent").textContent = EN ? "We can’t load this drop right now. Please try again in a moment." : "We kunnen deze drop nu niet laden. Probeer het zo opnieuw.";
      toestand("binnenkort");
    });
});
