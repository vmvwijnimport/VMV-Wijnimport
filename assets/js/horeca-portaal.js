// Horecaportaal, alleen voor goedgekeurde klanten: het assortiment met horecaprijzen.
// De prijzen komen uit Supabase; de database geeft ze alleen aan goedgekeurde
// klanten (Row Level Security). Er staan geen prijzen in deze code of op de pagina.
(function () {
  var doel = document.getElementById("assortiment");
  if (!doel) return;

  var basis = (document.getElementById("horeca").dataset.basis || "").replace(/\/$/, "");
  var euro = function (n) {
    return "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var el = function (tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  };
  // Naam van de filterknop per groep, en de volgorde van de knoppen
  var FILTERNAAM = { Franken: "Duitsland", "Piëmont": "Italië" };
  var VOLGORDE = ["Champagne", "Bourgogne", "Duitsland", "Italië", "Glaswerk"];
  var filterNaam = function (g) { return g.soort === "glas" ? "Glaswerk" : FILTERNAAM[g.regio] || g.regio || ""; };
  var STATUS = { op_voorraad: "", binnenkort: "Binnenkort", uitverkocht: "Uitverkocht" };

  var toonAssortiment = function (producten, inst) {
    doel.textContent = "";

    var uitleg = el("div", "assortiment__uitleg");
    uitleg.appendChild(el("p", null, "Prijzen per fles, excl. btw. Een doos is 6 flessen. Vanaf " + inst.schenk_vanaf +
      " flessen van dezelfde wijn krijg je " + String(inst.schenk_korting_pct).replace(".", ",").replace(/,00$/, "") + "% korting, behalve op allocatiewijnen."));
    uitleg.appendChild(el("p", null, "Wijnen op allocatie zijn beperkt beschikbaar: je vraagt een aantal aan en wij bevestigen hoeveel we kunnen leveren."));
    doel.appendChild(uitleg);

    // Groeperen per producent, in de volgorde van de lijst
    var groepen = [];
    var index = {};
    producten.forEach(function (p) {
      var sleutel = p.soort === "glas" ? "Hedonist-glazen" : p.producent;
      if (!index[sleutel]) { index[sleutel] = { naam: sleutel, slug: p.producent_slug, regio: p.regio, soort: p.soort, items: [] }; groepen.push(index[sleutel]); }
      index[sleutel].items.push(p);
    });

    groepen.forEach(function (g) {
      var sectie = el("section", "assortiment__groep");
      sectie.dataset.regio = filterNaam(g);
      var kop = el("h2", "regio__naam");
      kop.appendChild(document.createTextNode(g.naam));
      if (g.regio) kop.appendChild(el("span", null, g.regio));
      sectie.appendChild(kop);
      if (g.soort === "glas") {
        sectie.appendChild(el("p", "assortiment__noot",
          euro(g.items[0].prijs_ex) + " excl. btw per glas; vanaf " + inst.glas_staffel_vanaf + " glazen (modellen gemengd) " +
          euro(inst.glas_staffel_prijs_ex) + " excl. btw per glas."));
      } else if (g.slug) {
        var link = el("a", "assortiment__link", "Over " + g.naam);
        link.href = basis + "/producenten/" + g.slug + "/";
        sectie.appendChild(link);
      }

      var lijst = el("ul", "assortiment__lijst");
      g.items.forEach(function (p) {
        var li = el("li", "wijnregel" + (p.beschikbaarheid === "uitverkocht" ? " wijnregel--uit" : ""));
        li.dataset.product = p.id;
        li.dataset.zoek = [p.producent, p.naam, p.jaargang, p.druif, p.formaat, p.regio].join(" ").toLowerCase();
        if (p.kleur) li.appendChild(el("span", "stip stip--" + p.kleur));
        else li.appendChild(el("span", "stip stip--leeg"));

        var tekst = el("span", "wijnregel__tekst");
        tekst.appendChild(el("span", "wijnregel__naam", p.naam + (p.jaargang ? " " + p.jaargang : "")));
        var details = [p.druif, p.formaat !== "75 cl" ? p.formaat : null].filter(Boolean).join(", ");
        if (details) tekst.appendChild(el("span", "wijnregel__details", details));
        li.appendChild(tekst);

        var labels = el("span", "wijnregel__labels");
        if (p.allocatie) labels.appendChild(el("span", "label", "Op allocatie"));
        if (STATUS[p.beschikbaarheid]) labels.appendChild(el("span", "label label--" + p.beschikbaarheid, STATUS[p.beschikbaarheid]));
        if (p.max_per_bestelling) labels.appendChild(el("span", "label", "Max. " + p.max_per_bestelling));
        li.appendChild(labels);

        li.appendChild(el("span", "wijnregel__prijs", euro(p.prijs_ex)));
        lijst.appendChild(li);
      });
      sectie.appendChild(lijst);
      doel.appendChild(sectie);
    });
    voegFilterToe(groepen);
    document.dispatchEvent(new CustomEvent("horeca:assortiment", { detail: { producten: producten, instellingen: inst } }));
  };

  // ---------- Zoeken en filteren op regio ----------
  // Zonder accenten vergelijken, zodat "helene" ook "Hélène" vindt
  var plat = function (s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
  var voegFilterToe = function (groepen) {
    var regios = [];
    groepen.forEach(function (g) {
      var r = filterNaam(g);
      if (r && regios.indexOf(r) < 0) regios.push(r);
    });
    var plek = function (r) { var i = VOLGORDE.indexOf(r); return i < 0 ? VOLGORDE.length : i; };
    regios.sort(function (a, b) { return plek(a) - plek(b); });

    var balk = el("div", "assortiment__filter");
    var label = el("label", "visueel-verborgen", "Zoek een wijn");
    label.htmlFor = "assortiment-zoek";
    var zoek = el("input", "assortiment__zoek");
    zoek.type = "search"; zoek.id = "assortiment-zoek";
    zoek.placeholder = "Zoek op wijn, producent of druif";
    balk.appendChild(label);
    balk.appendChild(zoek);

    var knoppen = el("div", "regiokeuze assortiment__regios");
    knoppen.setAttribute("role", "group");
    knoppen.setAttribute("aria-label", "Filter op regio");
    var gekozen = "";
    ["Alle"].concat(regios).forEach(function (r) {
      var k = el("button", null, r);
      k.type = "button";
      k.dataset.regio = r === "Alle" ? "" : r;
      k.setAttribute("aria-pressed", r === "Alle" ? "true" : "false");
      k.addEventListener("click", function () {
        gekozen = k.dataset.regio;
        knoppen.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b === k ? "true" : "false"); });
        pas();
      });
      knoppen.appendChild(k);
    });
    balk.appendChild(knoppen);

    var geen = el("p", "horeca__klein assortiment__geen", "Geen wijnen gevonden. Probeer een andere zoekterm of regio.");
    geen.hidden = true;

    var pas = function () {
      var woorden = plat(zoek.value.trim().toLowerCase()).split(/\s+/).filter(Boolean);
      var iets = false;
      doel.querySelectorAll(".assortiment__groep").forEach(function (sectie) {
        var regioPast = !gekozen || sectie.dataset.regio === gekozen;
        var zichtbaar = 0;
        sectie.querySelectorAll(".wijnregel").forEach(function (li) {
          var tekst = plat(li.dataset.zoek);
          var past = regioPast && woorden.every(function (w) { return tekst.indexOf(w) >= 0; });
          li.hidden = !past;
          if (past) zichtbaar++;
        });
        sectie.hidden = zichtbaar === 0;
        if (zichtbaar) iets = true;
      });
      geen.hidden = iets;
    };
    zoek.addEventListener("input", pas);

    var uitleg = doel.querySelector(".assortiment__uitleg");
    uitleg.insertAdjacentElement("afterend", balk);
    balk.insertAdjacentElement("afterend", geen);
  };

  document.addEventListener("horeca:goedgekeurd", function () {
    var db = window.vmvHoreca && window.vmvHoreca.db;
    if (!db) return;
    doel.textContent = "";
    doel.appendChild(el("p", "horeca__laden", "Het assortiment wordt geladen…"));
    Promise.all([
      db.from("producten").select("id, soort, producent, producent_slug, regio, naam, jaargang, druif, formaat, kleur, prijs_ex, beschikbaarheid, allocatie, max_per_bestelling").order("volgorde").order("id"),
      db.from("instellingen").select("*").maybeSingle()
    ]).then(function (r) {
      if (r[0].error || r[1].error) throw r[0].error || r[1].error;
      if (!r[0].data.length) { doel.textContent = "Er staan nog geen wijnen in het assortiment."; return; }
      toonAssortiment(r[0].data, r[1].data);
    }).catch(function () {
      doel.textContent = "Het assortiment kon niet worden geladen. Probeer het opnieuw of mail ons op info@vmvwijnimport.com.";
    });
  });
})();
