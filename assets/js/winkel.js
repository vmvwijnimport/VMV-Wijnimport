// Pre-order Hedonist glazen: winkelmandje, prijsberekening en bestellen.
// Prijzen en regels komen uit _data/winkel.yml (via #winkel-gegevens).
document.addEventListener("DOMContentLoaded", function () {
  var bron = document.getElementById("winkel-gegevens");
  var winkel = document.getElementById("bestellen");
  if (!bron || !winkel) return;

  var W = JSON.parse(bron.textContent);
  var OPSLAG = "vmv-hedonist-mandje";
  var mandje = {};
  try { mandje = JSON.parse(localStorage.getItem(OPSLAG)) || {}; } catch (e) { mandje = {}; }

  var euro = function (bedrag) {
    return "€" + bedrag.toFixed(2).replace(".", ",").replace(",00", "");
  };
  var bewaar = function () {
    try { localStorage.setItem(OPSLAG, JSON.stringify(mandje)); } catch (e) {}
  };
  var totaalGlazen = function () {
    return Object.keys(mandje).reduce(function (som, id) { return som + (mandje[id] || 0); }, 0);
  };
  var bezorging = function () {
    return winkel.querySelector("input[name=bezorging]:checked").value;
  };

  // Per model: elke 6 glazen voor de setprijs, de rest per glas (niet mixen)
  var prijsModel = function (aantal) {
    return Math.floor(aantal / 6) * W.prijsZes + (aantal % 6) * W.prijsGlas;
  };
  var berekening = function () {
    var n = totaalGlazen();
    var glazen = Object.keys(mandje).reduce(function (som, id) { return som + prijsModel(mandje[id] || 0); }, 0);
    var gratis = bezorging() === "ophalen" || n >= W.gratisVanaf || (bezorging() === "amsterdam" && n >= W.gratisAmsterdamVanaf);
    var verzending = n === 0 || gratis ? 0 : W.verzendkosten;
    return { n: n, glazen: glazen, verzending: verzending, totaal: glazen + verzending };
  };

  var tip = function (b) {
    if (bezorging() === "ophalen") return "Je haalt je bestelling gratis op bij " + W.ophalenBij + " in Amsterdam.";
    var amsterdam = bezorging() === "amsterdam";
    if (b.n >= W.gratisVanaf || (amsterdam && b.n >= W.gratisAmsterdamVanaf)) return "Je bestelling wordt gratis " + (amsterdam ? "bezorgd." : "verzonden.");
    if (amsterdam) {
      var nogA = W.gratisAmsterdamVanaf - b.n;
      return "Nog " + nogA + (nogA === 1 ? " glas" : " glazen") + " voor gratis bezorging in Amsterdam.";
    }
    var nog = W.gratisVanaf - b.n;
    return "Nog " + nog + (nog === 1 ? " glas" : " glazen") + " voor gratis verzending. In Amsterdam bezorgen we al gratis vanaf " + W.gratisAmsterdamVanaf + " glazen.";
  };

  var leeg = winkel.querySelector(".mandje__leeg");
  var inhoud = winkel.querySelector(".mandje__inhoud");
  var form = document.getElementById("bestelformulier");
  var klaar = winkel.querySelector(".bestel__klaar");

  var toon = function () {
    var b = berekening();
    winkel.querySelectorAll(".product").forEach(function (p) {
      p.querySelector(".aantal__veld").value = mandje[p.dataset.model] || 0;
    });
    leeg.hidden = b.n > 0;
    inhoud.hidden = b.n === 0 || !form.hidden;
    if (b.n === 0) form.hidden = true;

    winkel.querySelector(".mandje__regels").innerHTML = Object.keys(W.modellen)
      .filter(function (id) { return mandje[id] > 0; })
      .map(function (id) {
        var a = mandje[id], sets = Math.floor(a / 6);
        var uitleg = sets > 0 ? "<small>" + sets + " × 6 voor " + euro(W.prijsZes) + (a % 6 ? " + " + (a % 6) + " los" : "") + "</small>" : "";
        return "<li><span>" + a + " × " + W.modellen[id] + uitleg + "</span><span>" + euro(prijsModel(a)) + "</span></li>";
      })
      .join("");

    winkel.querySelector(".mandje__subtotaal").textContent = euro(b.glazen);
    form.querySelector(".bestel__betaal").textContent = "Bestellen en betalen · " + euro(b.totaal);
    winkel.querySelector(".mandje__verzending").textContent = b.verzending === 0 ? "Gratis" : euro(b.verzending) + " (incl. verzekering)";
    winkel.querySelector(".mandje__som").textContent = euro(b.totaal);
    winkel.querySelector(".mandje__tip").textContent = b.n > 0 ? tip(b) : "";
  };

  var zet = function (id, aantal) {
    mandje[id] = Math.max(0, Math.min(120, parseInt(aantal, 10) || 0));
    bewaar();
    klaar.hidden = true;
    toon();
  };

  winkel.querySelectorAll(".product").forEach(function (p) {
    var id = p.dataset.model;
    p.querySelectorAll(".aantal__knop").forEach(function (knop) {
      knop.addEventListener("click", function () { zet(id, (mandje[id] || 0) + parseInt(knop.dataset.stap, 10)); });
    });
    p.querySelector(".aantal__veld").addEventListener("change", function (e) { zet(id, e.target.value); });
  });
  // Bij ophalen is geen adres nodig
  var adresVelden = function () {
    var ophalen = bezorging() === "ophalen";
    form.querySelector(".bestel__ophalen").hidden = !ophalen;
    form.querySelectorAll("[data-adres]").forEach(function (v) {
      v.hidden = ophalen;
      v.querySelectorAll("input").forEach(function (i) { i.required = !ophalen; });
    });
  };
  winkel.querySelectorAll("input[name=bezorging]").forEach(function (r) {
    r.addEventListener("change", function () { adresVelden(); toon(); });
  });

  winkel.querySelector(".mandje__verder").addEventListener("click", function () {
    inhoud.hidden = true;
    form.hidden = false;
    winkel.querySelector("#mandje-kop").textContent = "Afrekenen";
    form.querySelector("input[name=naam]").focus();
  });
  form.querySelector(".bestel__terug").addEventListener("click", function () {
    form.hidden = true;
    winkel.querySelector("#mandje-kop").textContent = "Winkelmandje";
    toon();
  });

  // Amsterdamse postcodes: 1011 t/m 1109
  var isAmsterdam = function (postcode) {
    var cijfers = parseInt((postcode || "").replace(/\D/g, "").slice(0, 4), 10);
    return cijfers >= 1011 && cijfers <= 1109;
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = form.querySelector(".formulier__status");
    var postcodeVeld = form.querySelector("input[name=postcode]");
    postcodeVeld.setCustomValidity(
      bezorging() === "amsterdam" && !isAmsterdam(postcodeVeld.value)
        ? "Bezorgen in Amsterdam kan alleen bij een Amsterdamse postcode (1011 tot en met 1109). Kies anders voor verzenden."
        : ""
    );
    if (!form.reportValidity()) return;

    var b = berekening();
    var regels = Object.keys(W.modellen)
      .filter(function (id) { return mandje[id] > 0; })
      .map(function (id) { return mandje[id] + " × " + W.modellen[id]; });
    var data = Object.fromEntries(new FormData(form).entries());
    data._subject = "Pre-order Hedonist: " + b.n + " glazen, " + data.naam;
    data._template = "table";
    data._captcha = "false";
    data._replyto = data.email;
    data._autoresponse = "Bedankt voor je pre-order van Hedonist glazen bij VMV Wijnimport. We hebben je bestelling ontvangen en sturen je een iDEAL-betaallink. Verwachte levering: " + W.levering + ".";
    data.betalen = W.idealActief ? "iDEAL (online)" : "iDEAL-betaallink sturen";
    data.bestelling = regels.join(", ");
    data.bezorging = { amsterdam: "Bezorgen in Amsterdam", ophalen: "Ophalen bij " + W.ophalenBij }[bezorging()] || "Verzenden";
    if (bezorging() === "ophalen") { delete data.adres; delete data.postcode; delete data.plaats; }
    data.glazen = euro(b.glazen);
    data.verzending = b.verzending === 0 ? "Gratis" : euro(b.verzending);
    data.totaal = euro(b.totaal);

    var knop = form.querySelector("button[type=submit]");
    knop.disabled = true;
    status.className = "formulier__status";
    status.textContent = "Je bestelling wordt verstuurd...";

    if (W.idealActief && W.koppeling) {
      fetch(W.koppeling.replace(/\/$/, "") + "/betaling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aantallen: mandje,
          bezorging: bezorging(),
          klant: { naam: data.naam, email: data.email, telefoon: data.telefoon, adres: data.adres, postcode: data.postcode, plaats: data.plaats, opmerking: data.opmerking }
        })
      })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.fout || "Betalen lukt nu niet"); return j; }); })
        .then(function (betaling) {
          try { sessionStorage.setItem("vmv-betaling", JSON.stringify({ id: betaling.id, bestelnummer: betaling.bestelnummer })); } catch (e) {}
          status.textContent = "Je gaat nu naar de betaalpagina...";
          // De mails naar de klant en naar VMV gaan pas als de betaling binnen is (betalen/worker.js)
          location.href = betaling.betaallink;
        })
        .catch(function (fout) {
          knop.disabled = false;
          status.classList.add("fout");
          status.textContent = fout.message + ". Probeer het opnieuw of mail ons op info@vmvwijnimport.com.";
        });
      return;
    }

    fetch(form.dataset.ajax, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || j.success === false || j.success === "false") throw new Error(j.message || "Versturen mislukt");
        });
      })
      .then(function () {
        mandje = {};
        bewaar();
        form.reset();
        form.hidden = true;
        winkel.querySelector("#mandje-kop").textContent = "Winkelmandje";
        status.textContent = "";
        toon();
        leeg.hidden = true;
        klaar.hidden = false;
        klaar.scrollIntoView({ block: "nearest" });
      })
      .catch(function () {
        status.classList.add("fout");
        status.innerHTML = 'Je pre-order is niet verstuurd. Probeer het opnieuw, of mail ons op <a href="mailto:info@vmvwijnimport.com">info@vmvwijnimport.com</a>.';
      })
      .finally(function () { knop.disabled = false; });
  });

  adresVelden();
  toon();
});
