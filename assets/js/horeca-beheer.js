// Horecaportaal, alleen voor VMV: een bestelling bevestigen, met wijziging bevestigen of afkeuren.
// Je komt hier via de knoppen in de mail "Nieuwe bestelling". De functie bestelmail in Supabase
// controleert de sleutel uit de link, voert de actie uit en laat de klant automatisch mailen.
// Een actie gebeurt alleen na een klik op de knop, niet door alleen de pagina te openen.
(function () {
  var pagina = document.getElementById("beheer");
  if (!pagina) return;

  var functie = pagina.dataset.functie;
  var zoek = new URLSearchParams(location.search);
  var id = parseInt(zoek.get("id"), 10);
  var sleutel = zoek.get("sleutel") || "";
  var modus = ["bevestigen", "wijzigen", "afkeuren"].indexOf(zoek.get("actie")) >= 0 ? zoek.get("actie") : "bevestigen";
  var bestelling = null;

  var euro = function (n) { return "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var el = function (tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  };
  var veld = function (naam) { return pagina.querySelector("[data-veld=" + naam + "]"); };
  var toestanden = pagina.querySelectorAll("[data-toestand]");
  var toon = function (naam) { toestanden.forEach(function (t) { t.hidden = t.dataset.toestand !== naam; }); };
  var fout = function (tekst) { toon("fout"); pagina.querySelector("[data-toestand=fout]").textContent = tekst; };

  var vraag = function (gegevens) {
    return fetch(functie, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ id: id, sleutel: sleutel }, gegevens))
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.fout || "Er ging iets mis. Probeer het opnieuw.");
        return d;
      });
    });
  };

  var TEKST = {
    bevestigen: {
      uitleg: "Je levert alles zoals besteld. De klant krijgt een bevestigingsmail.",
      label: "Bericht aan de klant", toelichting: "Komt in de bevestigingsmail, bijvoorbeeld de leverdag.",
      knop: "Bestelling bevestigen"
    },
    wijzigen: {
      uitleg: "Vul per wijn in hoeveel je levert (0 = niet leverbaar). De klant krijgt een bevestigingsmail met deze aantallen en de nieuwe totalen.",
      label: "Bericht aan de klant", toelichting: "Komt in de bevestigingsmail, bijvoorbeeld waarom je minder levert of de leverdag.",
      knop: "Bevestigen met deze aantallen"
    },
    afkeuren: {
      uitleg: "De bestelling gaat niet door. De klant krijgt een mail dat we de bestelling niet kunnen leveren.",
      label: "Reden voor de klant", toelichting: "Komt in de mail aan de klant.",
      knop: "Bestelling afkeuren"
    }
  };

  // ---------- Regels en totalen ----------
  var lijst = pagina.querySelector(".beheer__regels");
  var leveren = function (r) {
    if (bestelling.status !== "ontvangen") return r.toegewezen != null ? r.toegewezen : r.aantal;
    if (modus !== "wijzigen") return r.aantal;
    var invoer = lijst.querySelector("[data-regel='" + r.id + "']");
    var n = invoer ? parseInt(invoer.value, 10) : r.aantal;
    return isNaN(n) ? 0 : Math.max(0, Math.min(r.aantal, n));
  };
  var bedrag = function (r, n) {
    return n === r.aantal ? Number(r.regel_ex) : Math.round(r.prijs_ex * 100) * n / 100;
  };

  var totalen = function () {
    var centen = 0;
    bestelling.regels.forEach(function (r) {
      var n = leveren(r), b = bedrag(r, n);
      centen += Math.round(b * 100);
      var cel = lijst.querySelector("[data-bedrag='" + r.id + "']");
      if (cel) cel.textContent = euro(b);
    });
    var btw = Math.round(centen * 0.21);
    pagina.querySelector("[data-totaal=ex]").textContent = euro(centen / 100);
    pagina.querySelector("[data-totaal=btw]").textContent = euro(btw / 100);
    pagina.querySelector("[data-totaal=incl]").textContent = euro((centen + btw) / 100);
  };

  var toonRegels = function () {
    lijst.textContent = "";
    var afgehandeld = bestelling.status !== "ontvangen";
    bestelling.regels.forEach(function (r) {
      var li = el("li", "beheer__regel" + (modus === "afkeuren" ? " beheer__regel--weg" : ""));
      var tekst = el("span", "beheer__tekst");
      var getoond = afgehandeld && r.toegewezen != null ? r.toegewezen : r.aantal;
      tekst.appendChild(el("span", null, (modus === "wijzigen" && !afgehandeld ? "" : getoond + " × ") + r.omschrijving));
      var extra = [];
      if (r.korting_pct > 0) extra.push(String(r.korting_pct).replace(".", ",") + "% schenkkorting");
      if (r.allocatie) extra.push("op allocatie");
      if (modus === "wijzigen" && !afgehandeld) extra.push("besteld: " + r.aantal);
      if (afgehandeld && getoond !== r.aantal) extra.push("besteld: " + r.aantal);
      if (extra.length) tekst.appendChild(el("small", null, extra.join(", ")));
      li.appendChild(tekst);

      var vak = el("span", "beheer__leveren");
      if (modus === "wijzigen" && !afgehandeld) {
        var label = el("label", "visueel-verborgen", "Aantal leveren: " + r.omschrijving);
        label.htmlFor = "leveren-" + r.id;
        var invoer = el("input", "beheer__invoer");
        invoer.type = "number"; invoer.min = "0"; invoer.max = String(r.aantal); invoer.inputMode = "numeric";
        invoer.id = "leveren-" + r.id;
        invoer.dataset.regel = r.id;
        invoer.value = r.toegewezen != null ? r.toegewezen : r.aantal;
        invoer.addEventListener("input", totalen);
        vak.appendChild(label);
        vak.appendChild(invoer);
        vak.appendChild(el("span", "beheer__van", "van " + r.aantal));
      }
      li.appendChild(vak);
      var bed = el("span", "beheer__bedrag");
      bed.dataset.bedrag = r.id;
      li.appendChild(bed);
      lijst.appendChild(li);
    });
    totalen();
  };

  // ---------- Keuze: bevestigen, met wijziging, afkeuren ----------
  var form = document.getElementById("beheerformulier");
  var knoppen = pagina.querySelectorAll("[data-modus]");
  var kiesModus = function (nieuw) {
    modus = nieuw;
    knoppen.forEach(function (k) { k.setAttribute("aria-pressed", k.dataset.modus === modus ? "true" : "false"); });
    var t = TEKST[modus];
    veld("uitleg").textContent = t.uitleg;
    veld("berichtlabel").firstChild.textContent = t.label + " ";
    veld("berichtuitleg").textContent = t.toelichting;
    veld("knop").textContent = t.knop;
    form.querySelector(".formulier__status").textContent = "";
    toonRegels();
  };
  knoppen.forEach(function (k) { k.addEventListener("click", function () { kiesModus(k.dataset.modus); }); });

  var STATUS = { bevestigd: "bevestigd", geleverd: "geleverd", geannuleerd: "afgekeurd" };
  var toonBestelling = function () {
    var b = bestelling, k = b.klant;
    veld("nummer").textContent = b.bestelnummer + " van " + k.bedrijfsnaam;
    var dl = veld("klant");
    dl.textContent = "";
    [
      ["Zaak", k.bedrijfsnaam], ["Contact", k.contactpersoon], ["Telefoon", k.telefoon], ["E-mail", k.email],
      ["Afleveradres", k.adres],
      ["Besteld op", new Date(b.besteld_op).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })],
      ["Spoed", b.spoed ? "Ja" : ""], ["Opmerking", b.opmerking || ""]
    ].forEach(function (p) {
      if (!p[1]) return;
      var rij = el("div");
      rij.appendChild(el("dt", null, p[0]));
      rij.appendChild(el("dd", null, p[1]));
      dl.appendChild(rij);
    });

    var afgehandeld = b.status !== "ontvangen";
    pagina.querySelector(".beheer__keuze").hidden = afgehandeld;
    form.hidden = afgehandeld;
    veld("uitleg").hidden = afgehandeld;
    veld("status").hidden = !afgehandeld;
    if (afgehandeld) {
      veld("status").textContent = "Deze bestelling is al " + (STATUS[b.status] || b.status) + ". Er hoeft niets meer te gebeuren." +
        (b.bericht_klant ? " Bericht aan de klant: " + b.bericht_klant : "");
      modus = "bevestigen";
      toonRegels();
    } else {
      kiesModus(modus);
    }
    toon("bestelling");
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = form.querySelector(".formulier__status");
    var knop = veld("knop");
    var gegevens = { actie: modus === "afkeuren" ? "afkeur" : "bevestig", bericht: form.bericht.value.trim() };
    if (modus === "wijzigen") {
      gegevens.regels = bestelling.regels.map(function (r) { return { id: r.id, leveren: leveren(r) }; });
      if (gegevens.regels.every(function (x) { return x.leveren === 0; })) {
        status.className = "formulier__status fout";
        status.textContent = "Je levert niets. Kies Afkeuren als de bestelling niet doorgaat.";
        return;
      }
    }
    status.className = "formulier__status";
    status.textContent = "";
    knop.disabled = true;
    var tekst = knop.textContent;
    knop.textContent = "Bezig…";
    vraag(gegevens)
      .then(function (d) {
        var naam = bestelling.klant.bedrijfsnaam;
        veld("klaarkop").textContent = d.status === "geannuleerd" ? "Bestelling afgekeurd" : "Bestelling bevestigd";
        veld("klaartekst").textContent = bestelling.bestelnummer + (d.status === "geannuleerd"
          ? " is afgekeurd. " + naam + " krijgt nu automatisch een mail dat de bestelling niet doorgaat."
          : " is bevestigd. " + naam + " krijgt nu automatisch een bevestigingsmail. Vergeet niet de factuur te maken in e-Boekhouden.");
        toon("klaar");
        pagina.querySelector("[data-toestand=klaar]").focus();
      })
      .catch(function (err) {
        status.className = "formulier__status fout";
        status.textContent = err.message;
      })
      .finally(function () { knop.disabled = false; knop.textContent = tekst; });
  });

  // ---------- Start ----------
  if (!id || !sleutel) { fout("Open deze pagina via een knop in de mail \"Nieuwe bestelling\"."); return; }
  vraag({ actie: "bekijk" })
    .then(function (d) { bestelling = d; toonBestelling(); })
    .catch(function (err) { fout(err.message); });
})();
