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

  // Eén wijn op een kaart: de enkele drop, of een kopie ervan bij meer wijnen.
  // samen: { producent: false } = de producent staat al in de kop boven de kaarten
  var kaartVan = function (kaart, samen) {
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
      var foto = a.foto || (samen ? "" : fotos[a.slug]);   // bij meer wijnen geen drie keer dezelfde producentfoto
      veld("fotovak", kaart).hidden = !foto;
      if (foto) { veld("foto", kaart).src = foto; veld("foto", kaart).alt = a.naam || ""; }

      var producent = veld("producent", kaart);
      producent.textContent = "";
      producent.hidden = samen && !samen.producent;
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
      meer.hidden = !a.slug || (samen && !samen.producent);
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
    kaartVan(sjabloon, null)(a);
    toestand("wijn");
  };

  // Meer wijnen: een kop met de producent, en de wijnen die al open zijn (of waren) naast elkaar
  var WOORD = EN ? ["", "", "Two", "Three"] : ["", "", "Twee", "Drie"];
  var meer = function (lijst) {
    var wijnen = lijst.filter(function (a) { return a.naam; });
    if (!wijnen.length) {
      var later = lijst.filter(function (a) { return a.status === "binnenkort"; });
      if (later.length) binnenkort(later); else toestand("onbekend");
      return;
    }
    if (wijnen.length === 1) { enkel(wijnen[0]); return; }
    var een = wijnen[0];
    var zelfde = wijnen.every(function (a) { return a.producent === een.producent; });
    var kop = WOORD[wijnen.length] + (zelfde ? (EN ? " wines from " : " wijnen van ") + een.producent : (EN ? " wines" : " wijnen"));
    veld("samennaam").textContent = kop;
    veld("samenproducent").textContent = zelfde ? een.regio || "" : "";
    document.title = kop + " | VMV Wijnimport";

    var vak = veld("samen");
    vak.textContent = "";
    vak.style.setProperty("--wijnen", wijnen.length);
    wijnen.forEach(function (a) {
      var kaart = sjabloon.cloneNode(true);
      kaart.removeAttribute("data-toestand");
      kaart.hidden = false;
      // Elke wijn is een tussenkop onder de kop van de drop
      var h1 = kaart.querySelector("h1"), h2 = document.createElement("h2");
      h2.setAttribute("data-veld", "naam");
      h1.parentNode.replaceChild(h2, h1);
      vak.appendChild(kaart);
      kaartVan(kaart, { producent: !zelfde })(a);
    });
    var link = veld("samenmeer");
    link.hidden = !(zelfde && een.slug);
    if (!link.hidden) {
      link.querySelector("a").href = producentLink(een);
      link.querySelector("a").textContent = (EN ? "More about " : "Meer over ") + een.producent;
    }
    toestand("samen");
    veld("samenproducent").hidden = !veld("samenproducent").textContent;
  };

  Promise.all(codes.map(ophalen))
    .then(function (lijst) { if (codes.length === 1) enkel(lijst[0]); else meer(lijst); })
    .catch(function () {
      veld("opent").textContent = EN ? "We can’t load this drop right now. Please try again in a moment." : "We kunnen deze drop nu niet laden. Probeer het zo opnieuw.";
      toestand("binnenkort");
    });
});
