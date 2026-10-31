// Kerstpakketten: aanbod tonen, winkelmandje en bestellen.
// Het aanbod en de prijzen komen uit de database (kerst_aanbod, supabase/019-kerstpakketten.sql).
// De betaal-Worker rekent alles opnieuw uit; de bedragen hier zijn alleen om te tonen.
document.addEventListener("DOMContentLoaded", function () {
  var pagina = document.getElementById("kerst");
  if (!pagina) return;

  var OPSLAG = "vmv-kerst-mandje";
  var A = null;   // het aanbod
  var mandje = { pakketten: {}, extras: {} };
  try {
    var bewaard = JSON.parse(localStorage.getItem(OPSLAG));
    if (bewaard && bewaard.pakketten) mandje = { pakketten: bewaard.pakketten || {}, extras: bewaard.extras || {} };
  } catch (e) {}
  var bewaar = function () { try { localStorage.setItem(OPSLAG, JSON.stringify(mandje)); } catch (e) {} };

  var euro = function (n) { return "€" + Number(n).toFixed(2).replace(".", ",").replace(",00", ""); };
  var el = function (tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  };
  var veld = function (naam) { return pagina.querySelector("[data-veld=" + naam + "]"); };
  var toestanden = pagina.querySelectorAll("[data-toestand]");
  var toon = function (naam) { toestanden.forEach(function (t) { t.hidden = t.dataset.toestand !== naam; }); };

  // ---------- Aanbod tonen ----------
  var aantalKiezer = function (soort, item, max) {
    var groep = el("div", "aantal aantal--licht");
    groep.setAttribute("role", "group");
    groep.setAttribute("aria-label", "Aantal " + item.naam);
    var min = el("button", "aantal__knop", "−"); min.type = "button"; min.setAttribute("aria-label", "Eén minder");
    var invoer = el("input", "aantal__veld");
    invoer.type = "number"; invoer.min = "0"; invoer.inputMode = "numeric";
    if (max != null) invoer.max = String(max);
    invoer.setAttribute("aria-label", "Aantal " + item.naam);
    invoer.dataset.soort = soort; invoer.dataset.id = item.id;
    var plus = el("button", "aantal__knop", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Eén meer");
    var zet = function (n) {
      n = Math.max(0, Math.min(max != null ? max : 50, parseInt(n, 10) || 0));
      mandje[soort][item.id] = n;
      if (!n) delete mandje[soort][item.id];
      bewaar();
      werkBij();
    };
    min.addEventListener("click", function () { zet((mandje[soort][item.id] || 0) - 1); });
    plus.addEventListener("click", function () { zet((mandje[soort][item.id] || 0) + 1); });
    invoer.addEventListener("change", function () { zet(invoer.value); });
    groep.appendChild(min); groep.appendChild(invoer); groep.appendChild(plus);
    return groep;
  };

  var wijnregel = function (w) {
    var li = el("li");
    li.appendChild(el("span", "stip stip--" + (w.kleur || "wit")));
    li.firstChild.setAttribute("aria-hidden", "true");
    var naam = el("span", "cuvees__naam");
    var producent = w.slug ? el("a", "kerst__producent", w.producent) : el("span", "kerst__producent", w.producent);
    if (w.slug) producent.href = pagina.dataset.basis + "producenten/" + w.slug + "/";
    naam.appendChild(producent);
    naam.appendChild(document.createTextNode(" " + w.naam));
    li.appendChild(naam);
    var extra = [w.druif, w.jaargang].filter(Boolean).join(", ");
    if (extra) {
      var rechts = el("span", "cuvees__extra");
      rechts.appendChild(el("span", "cuvees__druif", extra));
      li.appendChild(rechts);
    }
    return li;
  };

  var bouw = function () {
    if (A.intro) veld("intro").textContent = A.intro;
    var doel = veld("pakketten");
    doel.textContent = "";
    A.pakketten.forEach(function (p) {
      var s = el("article", "kerst__pakket");
      var kop = el("div", "kerst__pakketkop");
      var tekst = el("div");
      tekst.appendChild(el("h2", null, p.naam));
      if (p.omschrijving) tekst.appendChild(el("p", "kerst__omschrijving", p.omschrijving));
      kop.appendChild(tekst);
      var koop = el("div", "kerst__koop");
      koop.appendChild(el("p", "kerst__prijs", euro(p.prijs)));
      if (p.beschikbaar === 0) koop.appendChild(el("span", "label label--uitverkocht", "Uitverkocht"));
      else {
        koop.appendChild(aantalKiezer("pakketten", p, p.beschikbaar));
        if (p.beschikbaar != null && p.beschikbaar <= 10) koop.appendChild(el("p", "kerst__nog", "Nog " + p.beschikbaar + " beschikbaar"));
      }
      kop.appendChild(koop);
      s.appendChild(kop);
      if (p.wijnen.length) {
        var lijst = el("ul", "cuvees__lijst kerst__wijnen");
        p.wijnen.forEach(function (w) { lijst.appendChild(wijnregel(w)); });
        s.appendChild(lijst);
      }
      doel.appendChild(s);
    });

    var extras = veld("extras");
    extras.textContent = "";
    veld("extrablok").hidden = !A.extras.length;
    A.extras.forEach(function (x) {
      var r = el("div", "kerst__extra");
      var tekst = el("div");
      var h = el("h3", null);
      if (x.kleur) { var stip = el("span", "stip stip--" + x.kleur); stip.setAttribute("aria-hidden", "true"); h.appendChild(stip); }
      h.appendChild(document.createTextNode(x.naam));
      tekst.appendChild(h);
      if (x.omschrijving) tekst.appendChild(el("p", "kerst__omschrijving", x.omschrijving));
      r.appendChild(tekst);
      var koop = el("div", "kerst__koop");
      koop.appendChild(el("p", "kerst__prijs", euro(x.prijs)));
      koop.appendChild(aantalKiezer("extras", x, x.max));
      r.appendChild(koop);
      extras.appendChild(r);
    });

    // Bezorgopties die in de backoffice aan staan
    var namen = {
      verzenden: "Verzenden in Nederland" + (Number(A.verzendkosten) ? " (" + euro(A.verzendkosten) + " per pakket)" : " (gratis)"),
      amsterdam: "Bezorgen in Amsterdam" + (Number(A.bezorgenAmsterdam) ? " (" + euro(A.bezorgenAmsterdam) + ")" : " (gratis)")
    };
    var eerste = null;
    pagina.querySelectorAll("[data-bezorging]").forEach(function (l) {
      var soort = l.dataset.bezorging;
      l.hidden = !A.bezorging[soort];
      if (namen[soort]) l.querySelector("span").textContent = namen[soort];
      if (A.bezorging[soort] && !eerste) eerste = l.querySelector("input");
    });
    if (eerste) eerste.checked = true;
    veld("levering").textContent = A.levering ? "Levering " + A.levering + "." : "";

    // Wat niet meer in het aanbod zit, uit het mandje halen
    ["pakketten", "extras"].forEach(function (soort) {
      Object.keys(mandje[soort]).forEach(function (id) {
        var item = A[soort].filter(function (x) { return String(x.id) === id; })[0];
        if (!item || (soort === "pakketten" && item.beschikbaar === 0)) delete mandje[soort][id];
        else if (soort === "pakketten" && item.beschikbaar != null) mandje[soort][id] = Math.min(mandje[soort][id], item.beschikbaar);
      });
    });
    bewaar();
    adresVelden();
    werkBij();
  };

  // ---------- Winkelmandje ----------
  var form = document.getElementById("kerstformulier");
  var leeg = pagina.querySelector(".mandje__leeg");
  var inhoud = pagina.querySelector(".mandje__inhoud");
  var bezorging = function () {
    var r = pagina.querySelector("input[name=bezorging]:checked");
    return r ? r.value : "";
  };
  var berekening = function () {
    var regels = [], bedrag = 0, pakketten = 0;
    ["pakketten", "extras"].forEach(function (soort) {
      A[soort].forEach(function (x) {
        var n = mandje[soort][x.id] || 0;
        if (!n) return;
        regels.push({ naam: x.naam, aantal: n, bedrag: n * Math.round(x.prijs * 100) });
        bedrag += n * Math.round(x.prijs * 100);
        if (soort === "pakketten") pakketten += n;
      });
    });
    var b = bezorging();
    var verzending = b === "verzenden" ? pakketten * Math.round(A.verzendkosten * 100) : b === "amsterdam" ? Math.round(A.bezorgenAmsterdam * 100) : 0;
    return { regels: regels, pakketten: pakketten, verzending: verzending / 100, totaal: (bedrag + verzending) / 100 };
  };
  var werkBij = function () {
    pagina.querySelectorAll(".aantal__veld").forEach(function (i) { i.value = mandje[i.dataset.soort][i.dataset.id] || 0; });
    var b = berekening();
    var iets = b.regels.length > 0;
    leeg.hidden = iets;
    leeg.textContent = "Je winkelmandje is leeg. Kies hoeveel pakketten je wilt.";
    if (iets && !b.pakketten) { leeg.hidden = false; leeg.textContent = "Kies ook minstens één kerstpakket."; }
    inhoud.hidden = !b.pakketten || !form.hidden;
    if (!b.pakketten) form.hidden = true;
    pagina.querySelector(".mandje__regels").innerHTML = "";
    b.regels.forEach(function (r) {
      var li = el("li");
      li.appendChild(el("span", null, r.aantal + " × " + r.naam));
      li.appendChild(el("span", null, euro(r.bedrag / 100)));
      pagina.querySelector(".mandje__regels").appendChild(li);
    });
    var soort = bezorging();
    veld("verzendlabel").textContent = soort === "ophalen" ? "Ophalen" : soort === "amsterdam" ? "Bezorgen" : "Verzending";
    pagina.querySelector(".mandje__verzending").textContent = b.verzending ? euro(b.verzending) : "Gratis";
    pagina.querySelector(".mandje__som").textContent = euro(b.totaal);
    form.querySelector(".bestel__betaal").textContent = "Bestellen en betalen · " + euro(b.totaal);
  };

  var adresVelden = function () {
    var ophalen = bezorging() === "ophalen";
    form.querySelector(".bestel__ophalen").hidden = !ophalen;
    form.querySelectorAll("[data-adres]").forEach(function (v) {
      v.hidden = ophalen;
      v.querySelectorAll("input").forEach(function (i) { i.required = !ophalen; });
    });
  };
  pagina.querySelectorAll("input[name=bezorging]").forEach(function (r) {
    r.addEventListener("change", function () { adresVelden(); werkBij(); form.elements.postcode.setCustomValidity(""); });
  });

  pagina.querySelector(".mandje__verder").addEventListener("click", function () {
    inhoud.hidden = true;
    form.hidden = false;
    document.getElementById("mandje-kop").textContent = "Afrekenen";
    form.elements.naam.focus();
  });
  form.querySelector(".bestel__terug").addEventListener("click", function () {
    form.hidden = true;
    document.getElementById("mandje-kop").textContent = "Winkelmandje";
    werkBij();
  });

  // ---------- Bestellen en betalen ----------
  var isAmsterdam = function (postcode) {
    var cijfers = parseInt((postcode || "").replace(/\D/g, "").slice(0, 4), 10);
    return cijfers >= 1011 && cijfers <= 1109;
  };
  form.elements.postcode.addEventListener("input", function () { form.elements.postcode.setCustomValidity(""); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = form.querySelector(".formulier__status");
    form.elements.postcode.setCustomValidity(
      bezorging() === "amsterdam" && !isAmsterdam(form.elements.postcode.value)
        ? "Bezorgen in Amsterdam kan alleen bij een Amsterdamse postcode (1011 tot en met 1109). Kies anders voor verzenden."
        : ""
    );
    if (!form.reportValidity()) return;

    var f = form.elements;
    var knop = form.querySelector("button[type=submit]");
    knop.disabled = true;
    status.className = "formulier__status";
    status.textContent = "Je bestelling wordt verstuurd...";
    fetch(pagina.dataset.koppeling.replace(/\/$/, "") + "/kerst/betaling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pakketten: mandje.pakketten,
        extras: mandje.extras,
        bezorging: bezorging(),
        achttien: f.achttien.checked,
        boodschap: f.boodschap.value,
        klant: {
          naam: f.naam.value, email: f.email.value, telefoon: f.telefoon.value,
          adres: f.adres.value, postcode: f.postcode.value, plaats: f.plaats.value, opmerking: f.opmerking.value
        }
      })
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.fout || "Betalen lukt nu niet"); return j; }); })
      .then(function (betaling) {
        try {
          sessionStorage.setItem("vmv-betaling", JSON.stringify({ id: betaling.id, bestelnummer: betaling.bestelnummer, soort: "kerst", levering: A.levering || "" }));
        } catch (e) {}
        status.textContent = "Je gaat nu naar de betaalpagina...";
        location.href = betaling.betaallink;
      })
      .catch(function (fout) {
        knop.disabled = false;
        status.classList.add("fout");
        status.textContent = fout.message + ". Probeer het opnieuw of mail ons op info@vmvwijnimport.com.";
      });
  });

  // ---------- Aanbod ophalen ----------
  var bron = pagina.dataset.bron || (pagina.dataset.url + "/rest/v1/rpc/kerst_aanbod");
  fetch(bron, {
    method: pagina.dataset.bron ? "GET" : "POST",
    headers: pagina.dataset.bron ? {} : { apikey: pagina.dataset.sleutel, Authorization: "Bearer " + pagina.dataset.sleutel, "Content-Type": "application/json" },
    body: pagina.dataset.bron ? undefined : "{}"
  })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (aanbod) {
      if (!aanbod || !aanbod.open || !aanbod.pakketten || !aanbod.pakketten.length) { toon("gesloten"); return; }
      A = aanbod;
      A.extras = A.extras || [];
      toon("open");
      bouw();
    })
    .catch(function () { toon("gesloten"); });
});
