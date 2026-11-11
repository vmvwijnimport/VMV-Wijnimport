// Winkelmandje voor de Hedonist-glazen (pre-order) en wijn uit een drop (/drop/), prijsberekening en bestellen.
// Glazen: prijzen en regels uit _data/winkel.yml (via #winkel-gegevens).
// Wijn: naam, prijs, voorraad en bezorgkosten uit de database (supabase/022-drops.sql, drop_aanbod);
// de droppagina (assets/js/drop.js) legt wijn in het mandje met het event "vmv:wijn".
// Zit er wijn in het mandje, dan gelden de bezorgkosten van de drops voor de hele bestelling en
// gaat het afrekenen via /drop/betaling in de betaal-Worker (alleen iDEAL).
// Op de Hedonist-pagina staat het mandje naast de glazen; op andere pagina's staat het in een lade
// die opent vanuit de herinnering rechtsonder (_includes/mandje-herinnering.html, data-lade).
document.addEventListener("DOMContentLoaded", function () {
  var bron = document.getElementById("winkel-gegevens");
  var winkel = document.getElementById("bestellen");
  if (!bron || !winkel) return;

  var W = JSON.parse(bron.textContent);
  var LADE = winkel.hasAttribute("data-lade");
  // Op de Engelse pagina's Engelse teksten; de mail aan VMV blijft Nederlands
  var EN = document.documentElement.lang === "en";
  var glas = function (n) { return EN ? (n === 1 ? " glass" : " glasses") : (n === 1 ? " glas" : " glazen"); };
  var fles = function (n) { return EN ? (n === 1 ? " bottle" : " bottles") : (n === 1 ? " fles" : " flessen"); };
  var OPSLAG = "vmv-hedonist-mandje";
  var OPSLAG_WIJN = "vmv-wijn-mandje";
  var mandje = {};
  try { mandje = JSON.parse(localStorage.getItem(OPSLAG)) || {}; } catch (e) { mandje = {}; }
  // Is de pre-order dicht, dan tellen de glazen niet mee (ze blijven wel bewaard)
  if (!W.open) mandje = {};
  // wijnen: { code: { aantal, naam, prijs, max, levering } }, kosten: bezorgkosten uit de database
  var wijnMandje = {};
  try { wijnMandje = JSON.parse(localStorage.getItem(OPSLAG_WIJN)) || {}; } catch (e) { wijnMandje = {}; }
  if (!wijnMandje.wijnen) wijnMandje.wijnen = {};

  var euro = function (bedrag) {
    var tekst = Number(bedrag).toFixed(2).replace(".00", "");
    return "€" + (EN ? tekst : tekst.replace(".", ","));
  };
  var bewaar = function () {
    try { localStorage.setItem(OPSLAG, JSON.stringify(mandje)); } catch (e) {}
  };
  var bewaarWijn = function () {
    try { localStorage.setItem(OPSLAG_WIJN, JSON.stringify(wijnMandje)); } catch (e) {}
  };
  var totaalGlazen = function () {
    return Object.keys(mandje).reduce(function (som, id) { return som + (mandje[id] || 0); }, 0);
  };
  var codes = function () {
    return Object.keys(wijnMandje.wijnen).filter(function (c) { return wijnMandje.wijnen[c].aantal > 0; });
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
    var f = 0, wijn = 0;
    codes().forEach(function (c) { var w = wijnMandje.wijnen[c]; f += w.aantal; wijn += Math.round(w.prijs * 100) * w.aantal; });
    wijn = wijn / 100;
    var sub = glazen + wijn;
    var gratis, verzending;
    if (f > 0) {
      // Met wijn: de bezorgkosten van de drops, over het hele bedrag
      var K = wijnMandje.kosten || {};
      gratis = bezorging() === "ophalen" || sub >= Number(K.gratis_vanaf) || (bezorging() === "amsterdam" && sub >= Number(K.gratis_amsterdam_vanaf));
      verzending = gratis ? 0 : Number(K.verzendkosten || 0);
    } else {
      gratis = bezorging() === "ophalen" || n >= W.gratisVanaf || (bezorging() === "amsterdam" && n >= W.gratisAmsterdamVanaf);
      verzending = n === 0 || gratis ? 0 : W.verzendkosten;
    }
    return { n: n, f: f, glazen: glazen, wijn: wijn, sub: sub, verzending: verzending, totaal: sub + verzending };
  };

  var tip = function (b) {
    if (bezorging() === "ophalen") return EN ? "Pick-up at " + W.ophalenBij + " in Amsterdam is free." : "Je haalt je bestelling gratis op bij " + W.ophalenBij + " in Amsterdam.";
    var amsterdam = bezorging() === "amsterdam";
    if (b.verzending === 0) {
      if (EN) return "Your order " + (amsterdam ? "will be delivered" : "ships") + " for free.";
      return "Je bestelling wordt gratis " + (amsterdam ? "bezorgd." : "verzonden.");
    }
    if (b.f > 0) {
      var K = wijnMandje.kosten || {};
      if (amsterdam) {
        var nogA = Number(K.gratis_amsterdam_vanaf) - b.sub;
        return EN ? "Add " + euro(nogA) + " more for free delivery in Amsterdam." : "Nog " + euro(nogA) + " voor gratis bezorging in Amsterdam.";
      }
      var nogV = Number(K.gratis_vanaf) - b.sub;
      if (EN) return "Add " + euro(nogV) + " more for free shipping. In Amsterdam, delivery is free from " + euro(K.gratis_amsterdam_vanaf) + ".";
      return "Nog " + euro(nogV) + " voor gratis verzending. In Amsterdam bezorgen we al gratis vanaf " + euro(K.gratis_amsterdam_vanaf) + ".";
    }
    if (amsterdam) {
      var nog = W.gratisAmsterdamVanaf - b.n;
      return EN ? "Add " + nog + " more" + glas(nog) + " for free delivery in Amsterdam." : "Nog " + nog + glas(nog) + " voor gratis bezorging in Amsterdam.";
    }
    var nogG = W.gratisVanaf - b.n;
    if (EN) return "Add " + nogG + " more" + glas(nogG) + " for free shipping. In Amsterdam, delivery is free from " + W.gratisAmsterdamVanaf + " glasses.";
    return "Nog " + nogG + glas(nogG) + " voor gratis verzending. In Amsterdam bezorgen we al gratis vanaf " + W.gratisAmsterdamVanaf + " glazen.";
  };

  var leeg = winkel.querySelector(".mandje__leeg");
  var inhoud = winkel.querySelector(".mandje__inhoud");
  var form = document.getElementById("bestelformulier");
  var klaar = winkel.querySelector(".bestel__klaar");
  var meldingVak = winkel.querySelector("[data-veld=melding]");
  var subLabel = winkel.querySelector("[data-veld=subtotaal]");
  var betaalTekst = form.querySelector("[data-veld=betaaltekst]");
  var achttien = form.querySelector("[data-achttien]");
  var tekstGlazen = subLabel.textContent, tekstBetalen = betaalTekst.textContent;

  var melding = function (tekst) {
    meldingVak.textContent = tekst || "";
    meldingVak.hidden = !tekst;
  };

  var stapper = function (soort, id, a, naam) {
    return '<span class="aantal aantal--licht aantal--klein" role="group" aria-label="' + (EN ? "Quantity " : "Aantal ") + naam + '">' +
      '<button type="button" class="aantal__knop" data-' + soort + '="' + id + '" data-stap="-1" aria-label="' + (EN ? "One fewer" : "Eén minder") + '">−</button>' +
      '<span class="aantal__veld" aria-live="polite">' + a + '</span>' +
      '<button type="button" class="aantal__knop" data-' + soort + '="' + id + '" data-stap="1" aria-label="' + (EN ? "One more" : "Eén meer") + '">+</button></span>';
  };
  var veilig = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };

  var toon = function () {
    var b = berekening();
    var niets = b.n === 0 && b.f === 0;
    winkel.querySelectorAll(".product").forEach(function (p) {
      p.querySelector(".aantal__veld").value = mandje[p.dataset.model] || 0;
    });
    leeg.hidden = !niets;
    inhoud.hidden = niets || !form.hidden;
    if (niets) form.hidden = true;

    var wijnRegels = codes().map(function (c) {
      var w = wijnMandje.wijnen[c];
      var uitleg = "<small>" + euro(w.prijs) + (EN ? " per bottle" : " per fles") + "</small>";
      return '<li class="mandje__regel"><span>' + veilig(w.naam) + uitleg + stapper("wijn", c, w.aantal, veilig(w.naam)) + "</span><span>" + euro(w.prijs * w.aantal) + "</span></li>";
    });
    var glasRegels = Object.keys(W.modellen)
      .filter(function (id) { return mandje[id] > 0; })
      .map(function (id) {
        var a = mandje[id], sets = Math.floor(a / 6);
        var uitleg = sets > 0 ? "<small>" + sets + " × 6 " + (EN ? "for " : "voor ") + euro(W.prijsZes) + (a % 6 ? " + " + (a % 6) + (EN ? " single" + glas(a % 6) : " los") : "") + "</small>" : "";
        // In de lade kun je het aantal hier aanpassen (op de Hedonist-pagina bij de glazen zelf)
        var aantal = LADE ? stapper("model", id, a, W.modellen[id]) : "";
        return "<li" + (LADE ? ' class="mandje__regel"' : "") + "><span>" + (LADE ? "" : a + " × ") + W.modellen[id] + uitleg + aantal + "</span><span>" + euro(prijsModel(a)) + "</span></li>";
      });
    winkel.querySelector(".mandje__regels").innerHTML = wijnRegels.concat(glasRegels).join("");
    if (LADE) herinnering(b);

    // Met wijn: subtotaal over alles, alleen iDEAL en een leeftijdsverklaring
    subLabel.textContent = b.f > 0 ? (EN ? "Subtotal" : "Subtotaal") : tekstGlazen;
    betaalTekst.textContent = b.f > 0 ? (EN ? "iDEAL, via Mollie" : "iDEAL, via Mollie") : tekstBetalen;
    achttien.hidden = b.f === 0;
    achttien.querySelector("input").required = b.f > 0;

    winkel.querySelector(".mandje__subtotaal").textContent = euro(b.sub);
    form.querySelector(".bestel__betaal").textContent = (EN ? "Order and pay · " : "Bestellen en betalen · ") + euro(b.totaal);
    winkel.querySelector(".mandje__verzending").textContent = b.verzending === 0 ? (EN ? "Free" : "Gratis")
      : euro(b.verzending) + (b.f > 0 ? "" : (EN ? " (incl. insurance)" : " (incl. verzekering)"));
    winkel.querySelector(".mandje__som").textContent = euro(b.totaal);
    winkel.querySelector(".mandje__tip").textContent = niets ? "" : tip(b);
  };

  // ---------- Herinnering rechtsonder en de lade (andere pagina's dan Hedonist) ----------
  var lade = document.getElementById("mandjelade");
  var knopHerinnering = document.getElementById("mandjeherinnering");
  var herinnering = function (b) {
    if (!knopHerinnering) return;
    var delen = [];
    if (b.f) delen.push(b.f + fles(b.f));
    if (b.n) delen.push(b.n + glas(b.n));
    knopHerinnering.querySelector("[data-info]").textContent = delen.join(", ") + " · " + euro(b.sub);
    var iets = b.n + b.f > 0;
    knopHerinnering.hidden = !iets || !lade.hidden;
    document.body.classList.toggle("heeft-herinnering", iets);
    if (!iets) leeg.textContent = EN ? "Your basket is empty." : "Je winkelmandje is leeg.";
  };
  var ladeOpen = function () {
    if (!lade) return;
    lade.hidden = false;
    document.body.classList.add("lade-open");
    knopHerinnering.hidden = true;
    lade.querySelector(".lade__sluit").focus();
    ververs();
  };
  var ladeDicht = function () {
    lade.hidden = true;
    document.body.classList.remove("lade-open");
    melding();
    toon();
    if (!knopHerinnering.hidden) knopHerinnering.focus();
  };
  if (LADE && knopHerinnering && lade) {
    knopHerinnering.addEventListener("click", function (e) { e.preventDefault(); ladeOpen(); });
    lade.querySelectorAll("[data-sluit]").forEach(function (k) { k.addEventListener("click", ladeDicht); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !lade.hidden) ladeDicht(); });
  }
  // Plus en min in het mandje: wijn altijd, glazen alleen in de lade
  winkel.querySelector(".mandje__regels").addEventListener("click", function (e) {
    var k = e.target.closest("[data-stap]");
    if (!k) return;
    var stap = parseInt(k.dataset.stap, 10);
    if (k.dataset.wijn) zetWijn(k.dataset.wijn, wijnMandje.wijnen[k.dataset.wijn].aantal + stap);
    else zet(k.dataset.model, (mandje[k.dataset.model] || 0) + stap);
  });

  var zet = function (id, aantal) {
    mandje[id] = Math.max(0, Math.min(120, parseInt(aantal, 10) || 0));
    bewaar();
    klaar.hidden = true;
    toon();
  };

  // ---------- Wijn uit een drop ----------
  var zetWijn = function (code, aantal) {
    var w = wijnMandje.wijnen[code];
    if (!w) return;
    aantal = Math.max(0, parseInt(aantal, 10) || 0);
    melding();
    if (aantal > w.max) {
      aantal = w.max;
      melding(EN ? "You can order up to " + w.max + fles(w.max) + " of " + w.naam + "."
                 : "Je kunt maximaal " + w.max + fles(w.max) + " van " + w.naam + " bestellen.");
    }
    if (aantal === 0) delete wijnMandje.wijnen[code];
    else w.aantal = aantal;
    bewaarWijn();
    toon();
  };
  // Gegevens uit drop_aanbod overnemen; het maximum is wat er nog is, en hooguit het maximum per klant
  var neem = function (a) {
    var w = wijnMandje.wijnen[a.code] || { aantal: 0 };
    w.naam = a.naam;
    w.prijs = Number(a.prijs);
    w.levering = EN ? (a.levering_en || a.levering) : a.levering;
    w.max = a.max ? Math.min(a.beschikbaar, a.max) : a.beschikbaar;
    wijnMandje.wijnen[a.code] = w;
    wijnMandje.kosten = a.bezorgkosten;
    return w;
  };
  var aanbod = function (code) {
    return fetch(W.supabase.url + "/rest/v1/rpc/drop_aanbod", {
      method: "POST",
      headers: { apikey: W.supabase.sleutel, Authorization: "Bearer " + W.supabase.sleutel, "Content-Type": "application/json" },
      body: JSON.stringify({ drop_code: code })
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  };
  // Prijs en voorraad opnieuw ophalen; wat niet meer te bestellen is, gaat uit het mandje
  var ververs = function () {
    var lijst = Object.keys(wijnMandje.wijnen);
    if (!lijst.length || !W.supabase) return Promise.resolve();
    return Promise.all(lijst.map(aanbod)).then(function (antwoorden) {
      var weg = [], minder = [];
      antwoorden.forEach(function (a, i) {
        var code = lijst[i], oud = wijnMandje.wijnen[code];
        if (!a || !oud) return;   // geen verbinding: laten staan, de Worker controleert het toch
        if (a.status !== "open" || a.beschikbaar <= 0) {
          weg.push(oud.naam);
          delete wijnMandje.wijnen[code];
          return;
        }
        var w = neem(a);
        if (w.aantal > w.max) { w.aantal = w.max; minder.push(w.naam); }
      });
      bewaarWijn();
      toon();
      if (weg.length) melding(EN ? weg.join(", ") + (weg.length === 1 ? " is" : " are") + " no longer available and has been removed from your basket."
                                 : weg.join(", ") + " is niet meer te bestellen en is uit je mandje gehaald.");
      else if (minder.length) melding(EN ? "There are fewer bottles left of " + minder.join(", ") + ". We’ve adjusted your basket."
                                         : "Er zijn minder flessen over van " + minder.join(", ") + ". We hebben je mandje aangepast.");
    });
  };
  // De droppagina legt wijn in het mandje: { aanbod: drop_aanbod, aantal }
  document.addEventListener("vmv:wijn", function (e) {
    var a = e.detail.aanbod;
    var w = neem(a);
    klaar.hidden = true;
    form.hidden = true;
    winkel.querySelector("#mandje-kop").textContent = EN ? "Basket" : "Winkelmandje";
    zetWijn(a.code, w.aantal + e.detail.aantal);
    if (LADE) ladeOpen();
  });

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
    melding();
    winkel.querySelector("#mandje-kop").textContent = EN ? "Checkout" : "Afrekenen";
    form.querySelector("input[name=naam]").focus();
    ververs();
  });
  form.querySelector(".bestel__terug").addEventListener("click", function () {
    form.hidden = true;
    winkel.querySelector("#mandje-kop").textContent = EN ? "Basket" : "Winkelmandje";
    toon();
  });

  // Amsterdamse postcodes: 1011 t/m 1109
  var isAmsterdam = function (postcode) {
    var cijfers = parseInt((postcode || "").replace(/\D/g, "").slice(0, 4), 10);
    return cijfers >= 1011 && cijfers <= 1109;
  };

  // De melding over de postcode weghalen zodra je de postcode of de bezorging aanpast;
  // anders blijft de browser het formulier tegenhouden, ook met een goede postcode
  var postcodeInvoer = form.querySelector("input[name=postcode]");
  var postcodeOpnieuw = function () { postcodeInvoer.setCustomValidity(""); };
  postcodeInvoer.addEventListener("input", postcodeOpnieuw);
  winkel.querySelectorAll("input[name=bezorging]").forEach(function (r) { r.addEventListener("change", postcodeOpnieuw); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = form.querySelector(".formulier__status");
    var postcodeVeld = form.querySelector("input[name=postcode]");
    postcodeVeld.setCustomValidity(
      bezorging() === "amsterdam" && !isAmsterdam(postcodeVeld.value)
        ? (EN ? "Delivery in Amsterdam is only possible with an Amsterdam postcode (1011 to 1109). Otherwise, choose shipping."
              : "Bezorgen in Amsterdam kan alleen bij een Amsterdamse postcode (1011 tot en met 1109). Kies anders voor verzenden.")
        : ""
    );
    if (!form.reportValidity()) return;

    var b = berekening();
    var regels = Object.keys(W.modellen)
      .filter(function (id) { return mandje[id] > 0; })
      .map(function (id) { return mandje[id] + " × " + W.modellen[id]; });
    var data = Object.fromEntries(new FormData(form).entries());
    data._subject = "Pre-order Hedonist: " + b.n + " glazen, " + data.naam + (EN ? " (Engelse site)" : "");
    data._template = "table";
    data._captcha = "false";
    data._replyto = data.email;
    data._autoresponse = EN
      ? "Thank you for pre-ordering Hedonist glasses from VMV Wijnimport. We’ve received your order and will send you an iDEAL payment link. Expected delivery: " + W.levering + "."
      : "Bedankt voor je pre-order van Hedonist glazen bij VMV Wijnimport. We hebben je bestelling ontvangen en sturen je een iDEAL-betaallink. Verwachte levering: " + W.levering + ".";
    data.betalen = W.idealActief ? "iDEAL (online)" : "iDEAL-betaallink sturen";
    data.bestelling = regels.join(", ");
    data.bezorging = { amsterdam: "Bezorgen in Amsterdam", ophalen: "Ophalen bij " + W.ophalenBij }[bezorging()] || "Verzenden";
    if (bezorging() === "ophalen") { delete data.adres; delete data.postcode; delete data.plaats; }
    data.glazen = euro(b.glazen);
    data.verzending = b.verzending === 0 ? "Gratis" : euro(b.verzending);
    if (EN) data.taal = "Engels";
    data.totaal = euro(b.totaal);

    var knop = form.querySelector("button[type=submit]");
    knop.disabled = true;
    status.className = "formulier__status";
    status.textContent = EN ? "Sending your order..." : "Je bestelling wordt verstuurd...";

    // Met wijn: altijd online betalen, via /drop/betaling (de database houdt de flessen vast)
    var metWijn = b.f > 0;
    if ((W.idealActief || metWijn) && W.koppeling) {
      var wijnen = {};
      codes().forEach(function (c) { wijnen[c] = wijnMandje.wijnen[c].aantal; });
      var klant = { naam: data.naam, email: data.email, telefoon: data.telefoon, adres: data.adres, postcode: data.postcode, plaats: data.plaats, opmerking: data.opmerking };
      fetch(W.koppeling.replace(/\/$/, "") + (metWijn ? "/drop/betaling" : "/betaling"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metWijn
          ? { glazen: mandje, wijnen: wijnen, bezorging: bezorging(), klant: klant, achttien: !!data.achttien, taal: EN ? "en" : "nl" }
          : { aantallen: mandje, bezorging: bezorging(), klant: klant })
      })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var f = new Error(j.fout || "Betalen lukt nu niet"); f.status = r.status; throw f; } return j; }); })
        .then(function (betaling) {
          // taal: na het betalen stuurt /bestelling/ Engelse klanten door naar /en/order/
          try { sessionStorage.setItem("vmv-betaling", JSON.stringify({ id: betaling.id, bestelnummer: betaling.bestelnummer, taal: EN ? "en" : "nl", soort: metWijn ? "drop" : "hedonist" })); } catch (e) {}
          status.textContent = EN ? "Taking you to the payment page..." : "Je gaat nu naar de betaalpagina...";
          // De mails naar de klant en naar VMV gaan pas als de betaling binnen is (betalen/worker.js)
          location.href = betaling.betaallink;
        })
        .catch(function (fout) {
          knop.disabled = false;
          status.classList.add("fout");
          // 409: een melding uit de database voor de klant, zoals "… is uitverkocht" (al in de goede taal)
          if (metWijn && fout.status === 409) {
            status.textContent = fout.message + ".";
            ververs();
            return;
          }
          status.textContent = EN && !metWijn
            ? "Payment isn’t working right now. Please try again or email us at info@vmvwijnimport.com."
            : fout.message + (EN ? ". Please try again or email us at info@vmvwijnimport.com." : ". Probeer het opnieuw of mail ons op info@vmvwijnimport.com.");
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
        winkel.querySelector("#mandje-kop").textContent = EN ? "Basket" : "Winkelmandje";
        status.textContent = "";
        toon();
        leeg.hidden = true;
        klaar.hidden = false;
        klaar.scrollIntoView({ block: "nearest" });
      })
      .catch(function () {
        status.classList.add("fout");
        status.innerHTML = EN
          ? 'Your pre-order was not sent. Please try again, or email us at <a href="mailto:info@vmvwijnimport.com">info@vmvwijnimport.com</a>.'
          : 'Je pre-order is niet verstuurd. Probeer het opnieuw, of mail ons op <a href="mailto:info@vmvwijnimport.com">info@vmvwijnimport.com</a>.';
      })
      .finally(function () { knop.disabled = false; });
  });

  adresVelden();
  toon();
  // Staat er wijn in het mandje, dan prijs en voorraad bijwerken (op de Hedonist-pagina meteen, elders bij het openen van de lade)
  if (!LADE) ververs();
});
