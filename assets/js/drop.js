// Droppagina (/drop/?c=<code>): haalt de wijn op uit de database (drop_aanbod, supabase/022-drops.sql)
// en legt hem in het winkelmandje (assets/js/winkel.js, event "vmv:wijn"). Afrekenen gaat in de lade.
document.addEventListener("DOMContentLoaded", function () {
  var pagina = document.getElementById("drop");
  if (!pagina) return;
  var EN = document.documentElement.lang === "en";
  var veld = function (naam) { return pagina.querySelector("[data-veld=" + naam + "]"); };
  var code = ((location.search.match(/[?&]c=([A-Za-z0-9]+)/) || [])[1] || "").toLowerCase();

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

  if (!code) { toestand("onbekend"); return; }

  var aanbod = null;
  var ophalen = function () {
    return fetch(pagina.dataset.url + "/rest/v1/rpc/drop_aanbod", {
      method: "POST",
      headers: { apikey: pagina.dataset.sleutel, Authorization: "Bearer " + pagina.dataset.sleutel, "Content-Type": "application/json" },
      body: JSON.stringify({ drop_code: code })
    }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); });
  };

  var invoer = pagina.querySelector(".drop__aantal .aantal__veld");
  var maximum = function () {
    if (!aanbod) return 1;
    return Math.max(1, aanbod.max ? Math.min(aanbod.beschikbaar, aanbod.max) : aanbod.beschikbaar);
  };
  var zetAantal = function (n) {
    invoer.value = Math.max(1, Math.min(maximum(), parseInt(n, 10) || 1));
  };
  pagina.querySelectorAll(".drop__aantal [data-stap]").forEach(function (k) {
    k.addEventListener("click", function () { zetAantal((parseInt(invoer.value, 10) || 1) + parseInt(k.dataset.stap, 10)); });
  });
  invoer.addEventListener("change", function () { zetAantal(invoer.value); });

  var toon = function (a) {
    aanbod = a;
    if (a.status === "onbekend") { toestand("onbekend"); return; }
    if (a.status === "binnenkort") {
      veld("opent").textContent = EN ? "This drop opens on " + moment(a.open_vanaf) + "." : "Deze drop gaat open op " + moment(a.open_vanaf) + ".";
      toestand("binnenkort");
      return;
    }
    document.title = a.naam + " | VMV Wijnimport";

    var foto = a.foto || fotos[a.slug];
    veld("fotovak").hidden = !foto;
    if (foto) { veld("foto").src = foto; veld("foto").alt = a.naam; }

    var producent = veld("producent");
    producent.textContent = "";
    if (a.slug) {
      var link = document.createElement("a");
      link.href = (EN ? "/en/producers/" : "/producenten/") + a.slug + "/";
      link.textContent = a.producent;
      producent.appendChild(link);
    } else {
      producent.appendChild(document.createTextNode(a.producent));
    }
    if (a.regio) producent.appendChild(document.createTextNode(", " + a.regio));

    veld("naam").textContent = a.wijn + (a.jaargang ? " " + a.jaargang : "");
    veld("kenmerken").textContent = [a.druif, KLEUR[a.kleur], a.formaat].filter(Boolean).join(", ");
    veld("prijs").textContent = euro(a.prijs);

    var voorraad = veld("voorraad");
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
    } else if (a.toon_aantal) {
      voorraad.classList.add("drop__voorraad--stip");
      voorraad.textContent = EN ? a.beschikbaar + fles(a.beschikbaar) + " left" : "Nog " + a.beschikbaar + fles(a.beschikbaar);
    }
    veld("bestel").hidden = !open;
    zetAantal(invoer.value);

    var regels = [];
    if (open && a.max) regels.push(EN ? "Up to " + a.max + fles(a.max) + " per customer." : "Maximaal " + a.max + fles(a.max) + " per klant.");
    if (open && a.open_tot) regels.push(EN ? "Available until " + moment(a.open_tot) + "." : "Te bestellen tot " + moment(a.open_tot) + ".");
    veld("regels").textContent = regels.join(" ");
    veld("regels").hidden = !regels.length;
    var levering = EN ? (a.levering_en || a.levering) : a.levering;
    veld("levering").textContent = levering ? (EN ? "Delivery: " : "Levering: ") + levering : "";
    veld("levering").hidden = !levering;

    // De tekst van de eigenaar, met een witregel tussen alinea's
    var tekst = veld("tekst");
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

    var meer = veld("meer");
    meer.hidden = !a.slug;
    if (a.slug) {
      meer.querySelector("a").href = (EN ? "/en/producers/" : "/producenten/") + a.slug + "/";
      meer.querySelector("a").textContent = (EN ? "More about " : "Meer over ") + a.producent;
    }
    toestand("wijn");
  };

  veld("erin").addEventListener("click", function () {
    var knop = this;
    knop.disabled = true;
    // Eerst kijken of er nog genoeg is, dan pas in het mandje
    ophalen()
      .then(function (a) {
        toon(a);
        if (a.status !== "open" || a.beschikbaar <= 0) return;
        var n = Math.min(parseInt(invoer.value, 10) || 1, maximum());
        document.dispatchEvent(new CustomEvent("vmv:wijn", { detail: { aanbod: a, aantal: n } }));
      })
      .catch(function () {
        veld("voorraad").textContent = EN ? "That didn’t work. Please try again." : "Dat lukte niet. Probeer het opnieuw.";
      })
      .finally(function () { knop.disabled = false; });
  });

  ophalen().then(toon).catch(function () {
    veld("opent").textContent = EN ? "We can’t load this drop right now. Please try again in a moment." : "We kunnen deze drop nu niet laden. Probeer het zo opnieuw.";
    toestand("binnenkort");
  });
});
