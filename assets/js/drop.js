// Droppagina (/drop/?c=<code>): haalt de wijn op uit de database (drop_aanbod, supabase/022-drops.sql)
// en legt hem in het winkelmandje (assets/js/winkel.js, event "vmv:wijn"). Afrekenen gaat in de lade.
// Meer wijnen in één link (/drop/?c=<code>-<code>): elke wijn krijgt een eigen kaart, naast elkaar.
document.addEventListener("DOMContentLoaded", function () {
  var pagina = document.getElementById("drop");
  if (!pagina) return;
  var EN = document.documentElement.lang === "en";
  var veld = function (naam, binnen) { return (binnen || pagina).querySelector("[data-veld=" + naam + "]"); };
  // Maximaal vijf (drie wijnen en pakketten); dubbele codes tellen één keer
  var MAX = 5;
  var codes = [];
  ((location.search.match(/[?&]c=([A-Za-z0-9,.\-]+)/) || [])[1] || "").toLowerCase().split(/[^a-z0-9]+/).forEach(function (c) {
    if (c && codes.indexOf(c) < 0 && codes.length < MAX) codes.push(c);
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
  var pakket = function (n) { return EN ? (n === 1 ? " bundle" : " bundles") : (n === 1 ? " pakket" : " pakketten"); };
  // Tekst van de eigenaar, met een witregel tussen alinea's
  var alineas = function (plek, tekst) {
    String(tekst || "").split(/\n\s*\n/).forEach(function (alinea) {
      if (!alinea.trim()) return;
      var p = document.createElement("p");
      alinea.trim().split("\n").forEach(function (regel, i) {
        if (i) p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(regel));
      });
      plek.appendChild(p);
    });
  };
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
      if (foto) {
        // Een staande foto (bijv. een etiket) tonen we helemaal, niet bijgesneden
        var img = veld("foto", kaart), vak = veld("fotovak", kaart);
        img.onload = function () { vak.classList.toggle("drop__foto--staand", img.naturalHeight > img.naturalWidth * 1.05); };
        img.src = foto;
        img.alt = a.naam || "";
      }

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

      var isPakket = a.soort === "pakket";
      var stuks = isPakket ? pakket : fles;
      veld("naam", kaart).textContent = isPakket ? (EN ? a.pakket_en || a.wijn : a.wijn) : (a.wijn || "") + (a.jaargang ? " " + a.jaargang : "");
      veld("kenmerken", kaart).textContent = isPakket ? "" : [a.druif, KLEUR[a.kleur], a.formaat].filter(Boolean).join(", ");
      veld("prijs", kaart).textContent = a.prijs ? euro(a.prijs) : "";
      veld("per", kaart).textContent = isPakket ? (EN ? "per bundle, incl. VAT" : "per pakket, incl. btw") : (EN ? "per bottle, incl. VAT" : "per fles, incl. btw");
      kaart.querySelectorAll(".drop__aantal, .drop__aantal .aantal__veld").forEach(function (x) {
        x.setAttribute("aria-label", isPakket ? (EN ? "Number of bundles" : "Aantal pakketten") : (EN ? "Number of bottles" : "Aantal flessen"));
      });
      // Pakket: de wijnen erin, en de tekst bij wijnen die alleen in het pakket zitten
      var inhoud = veld("inhoud", kaart), inhoudTekst = veld("inhoudtekst", kaart);
      inhoud.textContent = ""; inhoudTekst.textContent = "";
      (isPakket ? a.inhoud || [] : []).forEach(function (w) {
        var li = document.createElement("li");
        var stip = document.createElement("span");
        stip.className = "drop__kleurstip drop__kleurstip--" + (w.kleur || "wit");
        stip.setAttribute("aria-hidden", "true");
        li.appendChild(stip);
        li.appendChild(document.createTextNode(w.aantal + " × " + w.cuvee));
        inhoud.appendChild(li);
        var eigen = EN ? w.tekst_en || w.tekst : w.tekst;
        if (w.los === false && eigen) {
          inhoudTekst.appendChild(document.createElement("h2")).textContent = w.cuvee;
          alineas(inhoudTekst, eigen);
        }
      });
      inhoud.hidden = !inhoud.childNodes.length;
      inhoudTekst.hidden = !inhoudTekst.childNodes.length;

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
        voorraad.textContent = isPakket
          ? (EN ? "All bundles are reserved right now. If any become available, you’ll see them here within half an hour."
                : "Alle pakketten zijn nu gereserveerd. Komt er iets vrij, dan zie je dat hier binnen een half uur.")
          : (EN ? "All bottles are reserved right now. If any become available, you’ll see them here within half an hour."
                : "Alle flessen zijn nu gereserveerd. Komt er iets vrij, dan zie je dat hier binnen een half uur.");
      } else if (open && a.toon_aantal) {
        voorraad.classList.add("drop__voorraad--stip");
        voorraad.textContent = EN ? a.beschikbaar + stuks(a.beschikbaar) + " left" : "Nog " + a.beschikbaar + stuks(a.beschikbaar);
      }
      veld("bestel", kaart).hidden = !open;
      zetAantal(invoer.value);

      var regels = [];
      if (open && a.max) regels.push(EN ? "Up to " + a.max + stuks(a.max) + " per customer." : "Maximaal " + a.max + stuks(a.max) + " per klant.");
      if (open && a.open_tot) regels.push(EN ? "Available until " + moment(a.open_tot) + "." : "Te bestellen tot " + moment(a.open_tot) + ".");
      veld("regels", kaart).textContent = regels.join(" ");
      veld("regels", kaart).hidden = !regels.length;
      var levering = EN ? (a.levering_en || a.levering) : a.levering;
      veld("levering", kaart).textContent = levering ? (EN ? "Delivery: " : "Levering: ") + levering : "";
      veld("levering", kaart).hidden = !levering;

      var tekst = veld("tekst", kaart);
      tekst.textContent = "";
      alineas(tekst, EN ? a.tekst_en || a.tekst : a.tekst);
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

  // ---------- Twee of drie wijnen: een rij met de wijnen, en per wijn een eigen pagina ----------
  var el = function (tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  };
  var meer = function (lijst) {
    // Wijnen die alleen in een pakket zitten, krijgen geen eigen tabblad (hun tekst staat bij het pakket)
    var wijnen = lijst.filter(function (a) { return a.naam && a.los !== false; });
    if (!wijnen.length) {
      var later = lijst.filter(function (a) { return a.status === "binnenkort"; });
      if (later.length) binnenkort(later); else toestand("onbekend");
      return;
    }
    if (wijnen.length === 1) { enkel(wijnen[0]); return; }

    var kiezer = veld("kiezer"), panelen = veld("panelen");
    kiezer.textContent = ""; panelen.textContent = "";
    var tabs = [], vakken = [];
    var kies = function (i, focus) {
      tabs.forEach(function (t, j) {
        t.setAttribute("aria-selected", j === i ? "true" : "false");
        t.tabIndex = j === i ? 0 : -1;
        vakken[j].hidden = j !== i;
      });
      if (focus) tabs[i].focus();
      document.title = (wijnen[i].soort === "pakket" && EN ? wijnen[i].pakket_en || wijnen[i].naam : wijnen[i].naam) + " | VMV Wijnimport";
    };
    wijnen.forEach(function (a, i) {
      var id = "drop-wijn-" + i;
      var tab = el("button", "drop__keuze");
      tab.type = "button";
      tab.id = id + "-tab";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", id);
      // Een pakket krijgt een stip per wijn erin
      var stippen = el("span", "drop__stippen");
      stippen.setAttribute("aria-hidden", "true");
      (a.soort === "pakket" ? (a.inhoud || []).map(function (w) { return w.kleur; }) : [a.kleur]).forEach(function (k) {
        stippen.appendChild(el("span", "drop__kleurstip drop__kleurstip--" + (k || "wit")));
      });
      tab.appendChild(stippen);
      var tekst = el("span", "drop__keuzetekst");
      tekst.appendChild(el("span", "drop__keuzenaam", a.soort === "pakket" ? (EN ? a.pakket_en || a.wijn : a.wijn) : (a.wijn || "") + (a.jaargang ? " " + a.jaargang : "")));
      var open = a.status === "open" && a.beschikbaar > 0;
      tekst.appendChild(el("span", "drop__keuzeklein", open ? euro(a.prijs)
        : a.status === "voorbij" ? (EN ? "Ended" : "Voorbij") : a.status === "vol" ? (EN ? "All reserved" : "Alles gereserveerd") : (EN ? "Sold out" : "Uitverkocht")));
      tab.appendChild(tekst);
      tab.addEventListener("click", function () { kies(i); tab.scrollIntoView({ block: "nearest", inline: "nearest" }); });
      // Pijltjestoetsen tussen de wijnen
      tab.addEventListener("keydown", function (e) {
        var stap = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (stap) { e.preventDefault(); kies((i + stap + wijnen.length) % wijnen.length, true); }
      });
      kiezer.appendChild(tab);
      tabs.push(tab);

      var vak = sjabloon.cloneNode(true);
      vak.removeAttribute("data-toestand");
      vak.id = id;
      vak.setAttribute("role", "tabpanel");
      vak.setAttribute("aria-labelledby", tab.id);
      vak.classList.add("drop__paneel");
      panelen.appendChild(vak);
      vakken.push(vak);
      kaartVan(vak)(a);
    });
    kies(0);
    toestand("samen");
  };

  // Eén code: die wijn, plus de andere wijnen van dezelfde drop (supabase/026). Meer codes in de link kan ook.
  Promise.all(codes.map(ophalen))
    .then(function (lijst) {
      var extra = [];
      lijst.forEach(function (a) {
        (a.samen || []).forEach(function (c) { if (codes.indexOf(c) < 0 && extra.indexOf(c) < 0) extra.push(c); });
      });
      if (lijst.length === 1 && !extra.length) { enkel(lijst[0]); return; }
      return Promise.all(extra.slice(0, MAX).map(ophalen)).then(function (rest) { meer(lijst.concat(rest).slice(0, MAX)); });
    })
    .catch(function () {
      veld("opent").textContent = EN ? "We can’t load this drop right now. Please try again in a moment." : "We kunnen deze drop nu niet laden. Probeer het zo opnieuw.";
      toestand("binnenkort");
    });
});
