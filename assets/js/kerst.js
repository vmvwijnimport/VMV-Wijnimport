// Kerstpakketten: aanbod tonen, winkelmandje en bestellen.
// Het aanbod en de prijzen komen uit de database (kerst_aanbod, supabase/019-kerstpakketten.sql).
// De betaal-Worker rekent alles opnieuw uit; de bedragen hier zijn alleen om te tonen.
document.addEventListener("DOMContentLoaded", function () {
  var pagina = document.getElementById("kerst");
  if (!pagina) return;

  var EN = document.documentElement.lang === "en";
  var OPSLAG = "vmv-kerst-mandje";
  var A = null;   // het aanbod
  var mandje = { pakketten: {}, extras: {} };
  try {
    var bewaard = JSON.parse(localStorage.getItem(OPSLAG));
    if (bewaard && bewaard.pakketten) mandje = { pakketten: bewaard.pakketten || {}, extras: bewaard.extras || {} };
  } catch (e) {}
  var bewaar = function () { try { localStorage.setItem(OPSLAG, JSON.stringify(mandje)); } catch (e) {} };

  var euro = function (n) {
    var t = Number(n).toFixed(2).replace(".00", "");
    return "€" + (EN ? t : t.replace(".", ","));
  };
  // Meldingen van de betaal-Worker zijn Nederlands; op de Engelse pagina vertalen we de bekende
  var vertaal = function (m) {
    if (!EN) return m;
    var r;
    if ((r = /^(.*) is uitverkocht$/.exec(m))) return r[1] + " is sold out";
    if ((r = /^Er zijn nog (\d+) van (.*)$/.exec(m))) return "Only " + r[1] + " left of " + r[2];
    if ((r = /^Je kunt maximaal (\d+) × (.*) bestellen$/.exec(m))) return "You can order up to " + r[1] + " × " + r[2];
    return {
      "Kies minstens één kerstpakket": "Please choose at least one Christmas box",
      "Bestellen is gesloten": "Ordering is closed",
      "Vul alle verplichte velden in": "Please fill in all required fields",
      "Vul een geldig e-mailadres in": "Please enter a valid email address",
      "Bezorgen in Amsterdam kan alleen bij een Amsterdamse postcode": "Delivery in Amsterdam is only possible with an Amsterdam postcode",
      "Je moet 18 jaar of ouder zijn": "You must be 18 or older"
    }[m] || "Ordering didn’t work just now";
  };
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
    groep.setAttribute("aria-label", (EN ? "Quantity " : "Aantal ") + item.naam);
    var min = el("button", "aantal__knop", "−"); min.type = "button"; min.setAttribute("aria-label", EN ? "One fewer" : "Eén minder");
    var invoer = el("input", "aantal__veld");
    invoer.type = "number"; invoer.min = "0"; invoer.inputMode = "numeric";
    if (max != null) invoer.max = String(max);
    invoer.setAttribute("aria-label", (EN ? "Quantity " : "Aantal ") + item.naam);
    invoer.dataset.soort = soort; invoer.dataset.id = item.id;
    var plus = el("button", "aantal__knop", "+"); plus.type = "button"; plus.setAttribute("aria-label", EN ? "One more" : "Eén meer");
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
    if (w.slug) producent.href = pagina.dataset.basis + (EN ? "en/producers/" : "producenten/") + w.slug + "/";
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
    var intro = EN ? A.intro_en : A.intro;
    if (intro) veld("intro").textContent = intro;
    var omschrijving = function (x) { return (EN && x.omschrijving_en) || x.omschrijving; };
    var doel = veld("pakketten");
    doel.textContent = "";
    A.pakketten.forEach(function (p) {
      var s = el("article", "kerst__pakket");
      var kop = el("div", "kerst__pakketkop");
      var tekst = el("div");
      tekst.appendChild(el("h2", null, p.naam));
      if (omschrijving(p)) tekst.appendChild(el("p", "kerst__omschrijving", omschrijving(p)));
      kop.appendChild(tekst);
      var koop = el("div", "kerst__koop");
      koop.appendChild(el("p", "kerst__prijs", euro(p.prijs)));
      if (p.beschikbaar === 0) koop.appendChild(el("span", "label label--uitverkocht", EN ? "Sold out" : "Uitverkocht"));
      else {
        koop.appendChild(aantalKiezer("pakketten", p, p.beschikbaar));
        if (p.beschikbaar != null && p.beschikbaar <= 10) koop.appendChild(el("p", "kerst__nog", EN ? p.beschikbaar + " left" : "Nog " + p.beschikbaar + " beschikbaar"));
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
      if (omschrijving(x)) tekst.appendChild(el("p", "kerst__omschrijving", omschrijving(x)));
      r.appendChild(tekst);
      var koop = el("div", "kerst__koop");
      koop.appendChild(el("p", "kerst__prijs", euro(x.prijs)));
      koop.appendChild(aantalKiezer("extras", x, x.max));
      r.appendChild(koop);
      extras.appendChild(r);
    });

    // Bezorgopties die in de backoffice aan staan
    var gratis = EN ? " (free)" : " (gratis)";
    var namen = {
      verzenden: (EN ? "Shipping in the Netherlands" : "Verzenden in Nederland") + (Number(A.verzendkosten) ? " (" + euro(A.verzendkosten) + (EN ? " per box)" : " per pakket)") : gratis),
      amsterdam: (EN ? "Delivery in Amsterdam" : "Bezorgen in Amsterdam") + (Number(A.bezorgenAmsterdam) ? " (" + euro(A.bezorgenAmsterdam) + ")" : gratis)
    };
    var eerste = null;
    pagina.querySelectorAll("[data-bezorging]").forEach(function (l) {
      var soort = l.dataset.bezorging;
      l.hidden = !A.bezorging[soort];
      if (namen[soort]) l.querySelector("span").textContent = namen[soort];
      if (A.bezorging[soort] && !eerste) eerste = l.querySelector("input");
    });
    if (eerste) eerste.checked = true;
    var levering = EN ? A.levering_en : A.levering;
    veld("levering").textContent = levering ? (EN ? "Delivery " : "Levering ") + levering + "." : "";

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
    leeg.textContent = EN ? "Your basket is empty. Choose how many boxes you’d like." : "Je winkelmandje is leeg. Kies hoeveel pakketten je wilt.";
    if (iets && !b.pakketten) { leeg.hidden = false; leeg.textContent = EN ? "Please also choose at least one Christmas box." : "Kies ook minstens één kerstpakket."; }
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
    veld("verzendlabel").textContent = EN ? (soort === "ophalen" ? "Pick-up" : soort === "amsterdam" ? "Delivery" : "Shipping")
      : (soort === "ophalen" ? "Ophalen" : soort === "amsterdam" ? "Bezorgen" : "Verzending");
    pagina.querySelector(".mandje__verzending").textContent = b.verzending ? euro(b.verzending) : (EN ? "Free" : "Gratis");
    pagina.querySelector(".mandje__som").textContent = euro(b.totaal);
    form.querySelector(".bestel__betaal").textContent = (EN ? "Order and pay · " : "Bestellen en betalen · ") + euro(b.totaal);
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
    document.getElementById("mandje-kop").textContent = EN ? "Checkout" : "Afrekenen";
    form.elements.naam.focus();
  });
  form.querySelector(".bestel__terug").addEventListener("click", function () {
    form.hidden = true;
    document.getElementById("mandje-kop").textContent = EN ? "Basket" : "Winkelmandje";
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
        ? (EN ? "Delivery in Amsterdam is only possible with an Amsterdam postcode (1011 to 1109). Otherwise, choose shipping."
              : "Bezorgen in Amsterdam kan alleen bij een Amsterdamse postcode (1011 tot en met 1109). Kies anders voor verzenden.")
        : ""
    );
    if (!form.reportValidity()) return;

    var f = form.elements;
    var knop = form.querySelector("button[type=submit]");
    knop.disabled = true;
    status.className = "formulier__status";
    status.textContent = EN ? "Sending your order..." : "Je bestelling wordt verstuurd...";
    fetch(pagina.dataset.koppeling.replace(/\/$/, "") + "/kerst/betaling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pakketten: mandje.pakketten,
        extras: mandje.extras,
        bezorging: bezorging(),
        taal: EN ? "en" : "nl",
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
          sessionStorage.setItem("vmv-betaling", JSON.stringify({
            id: betaling.id, bestelnummer: betaling.bestelnummer, soort: "kerst", taal: EN ? "en" : "nl",
            levering: (EN ? A.levering_en : A.levering) || ""
          }));
        } catch (e) {}
        status.textContent = EN ? "Taking you to the payment page..." : "Je gaat nu naar de betaalpagina...";
        location.href = betaling.betaallink;
      })
      .catch(function (fout) {
        knop.disabled = false;
        status.classList.add("fout");
        status.textContent = EN ? vertaal(fout.message) + ". Please try again or email us at info@vmvwijnimport.com."
          : fout.message + ". Probeer het opnieuw of mail ons op info@vmvwijnimport.com.";
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
