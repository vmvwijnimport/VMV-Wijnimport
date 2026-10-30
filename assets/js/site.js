// Menu (mobiel), uitklapmenu producenten en het contactformulier.
document.addEventListener("DOMContentLoaded", function () {
  // ---- Leeftijdscheck ----
  var check = document.getElementById("leeftijdscheck");
  if (check && document.documentElement.classList.contains("leeftijd-open")) {
    var ja = check.querySelector("[data-leeftijd=ja]");
    ja.focus({ focusVisible: false });
    ja.addEventListener("click", function () {
      document.cookie = "vmv18=ja; max-age=" + 60 * 60 * 24 * 30 + "; path=/; SameSite=Lax";
      document.documentElement.classList.remove("leeftijd-open");
    });
    check.querySelector("[data-leeftijd=nee]").addEventListener("click", function () {
      check.querySelector(".leeftijd__vraag").hidden = true;
      check.querySelector(".leeftijd__nee").hidden = false;
    });
    // Houd de focus binnen de vraag
    check.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var knoppen = check.querySelectorAll("button:not([hidden])");
      var eerste = knoppen[0], laatste = knoppen[knoppen.length - 1];
      if (e.shiftKey && document.activeElement === eerste) { laatste.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === laatste) { eerste.focus(); e.preventDefault(); }
    });
  }

  // ---- Mobiel menu ----
  var menuknop = document.querySelector(".kop__menuknop");
  var menu = document.getElementById("hoofdmenu");
  if (menuknop && menu) {
    menuknop.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      menuknop.setAttribute("aria-expanded", open);
      menuknop.querySelector(".kop__menuknop-tekst").textContent = open ? "Sluiten" : "Menu";
      document.body.classList.toggle("menu-open", open);
    });
  }

  // ---- Producenten per regio ----
  var uitklap = document.querySelector(".menu__uitklap");
  var uitklapknop = document.querySelector(".menu__uitklapknop");
  if (uitklap && uitklapknop) {
    var zet = function (open) {
      uitklap.classList.toggle("open", open);
      uitklapknop.setAttribute("aria-expanded", open);
    };
    uitklapknop.addEventListener("click", function (e) {
      e.stopPropagation();
      zet(!uitklap.classList.contains("open"));
    });
    document.addEventListener("click", function (e) {
      if (!uitklap.contains(e.target)) zet(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") zet(false);
    });
  }

  // ---- Homepage: producenten per regio uitklappen ----
  document.querySelectorAll(".regio__meer").forEach(function (knop) {
    knop.addEventListener("click", function () {
      var regio = knop.closest(".regio");
      var open = regio.classList.toggle("open");
      knop.setAttribute("aria-expanded", open);
      knop.textContent = open ? knop.dataset.minder : knop.dataset.meer;
      if (!open) regio.scrollIntoView({ block: "nearest" });
    });
  });

  // ---- Producentpagina: door de foto's klikken ----
  document.querySelectorAll("[data-fotoreeks]").forEach(function (reeks) {
    var baan = reeks.querySelector(".fotoreeks__baan");
    var fotos = baan.querySelectorAll("img");
    var teller = reeks.querySelector(".fotoreeks__teller");
    var huidige = function () { return Math.round(baan.scrollLeft / baan.clientWidth); };
    var ga = function (stap) {
      var n = (huidige() + stap + fotos.length) % fotos.length;
      baan.scrollTo({ left: n * baan.clientWidth });
      teller.textContent = (n + 1) + " / " + fotos.length;
    };
    reeks.querySelectorAll("[data-stap]").forEach(function (knop) {
      knop.addEventListener("click", function () { ga(parseInt(knop.getAttribute("data-stap"), 10)); });
    });
    fotos.forEach(function (foto) { foto.addEventListener("click", function () { ga(1); }); });
    baan.addEventListener("scroll", function () {
      teller.textContent = (huidige() + 1) + " / " + fotos.length;
    });
  });

  // ---- Contactformulier ----

  var form = document.getElementById("contactformulier");
  if (!form) return;

  var onderwerp = form.querySelector("#onderwerp");
  var producentVeld = form.querySelector("[data-toon-bij]");
  var status = form.querySelector(".formulier__status");
  var knop = form.querySelector("button[type=submit]");

  // Vooraf invullen via de link, bijvoorbeeld /contact/?onderwerp=hedonist
  var params = new URLSearchParams(location.search);
  if (params.get("onderwerp") === "hedonist") onderwerp.value = "Hedonist glazen";
  if (params.get("producent")) {
    onderwerp.value = "Wijnen van een producent";
    form.querySelector("#producent").value = params.get("producent");
  }

  var toonProducent = function () {
    producentVeld.hidden = onderwerp.value !== producentVeld.dataset.toonBij;
  };
  onderwerp.addEventListener("change", toonProducent);
  toonProducent();

  // Eigen validatie in het Nederlands: bij verlaten van een veld en bij versturen
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
  var regels = {
    naam: function (v) { return v ? "" : "Vul je naam in"; },
    email: function (v) { return !v ? "Vul je e-mailadres in" : EMAIL.test(v) ? "" : "Dit e-mailadres klopt niet. Bijvoorbeeld: naam@voorbeeld.nl"; },
    onderwerp: function (v) { return v ? "" : "Kies waar je vraag over gaat"; },
    bericht: function (v) { return v ? "" : "Schrijf een kort bericht"; }
  };
  var controleer = function (veld) {
    var melding = regels[veld.name](veld.value.trim());
    var fout = document.getElementById(veld.id + "-fout");
    fout.textContent = melding;
    fout.hidden = !melding;
    if (melding) veld.setAttribute("aria-invalid", "true"); else veld.removeAttribute("aria-invalid");
    return !melding;
  };
  Object.keys(regels).forEach(function (naam) {
    var veld = form.elements[naam];
    veld.addEventListener("blur", function () { controleer(veld); });
    // Een getoonde fout verdwijnt zodra hij is opgelost
    veld.addEventListener(veld.tagName === "SELECT" ? "change" : "input", function () {
      if (veld.getAttribute("aria-invalid") === "true") controleer(veld);
    });
  });

  var bedankt = document.getElementById("contact-bedankt");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var eersteFout = null;
    Object.keys(regels).forEach(function (naam) {
      var veld = form.elements[naam];
      if (!controleer(veld) && !eersteFout) eersteFout = veld;
    });
    if (eersteFout) {
      eersteFout.scrollIntoView({ block: "center" });
      eersteFout.focus({ preventScroll: true });
      return;
    }

    status.className = "formulier__status";
    status.textContent = "";
    knop.disabled = true;
    knop.textContent = "Versturen…";

    var data = Object.fromEntries(new FormData(form).entries());
    data._replyto = data.email;

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
        form.reset();
        form.hidden = true;
        bedankt.hidden = false;
        bedankt.focus();
      })
      .catch(function () {
        status.classList.add("fout");
        status.innerHTML = 'Het bericht is niet verstuurd. Probeer het opnieuw, of mail ons direct op <a href="mailto:info@vmvwijnimport.com">info@vmvwijnimport.com</a>.';
      })
      .finally(function () {
        knop.disabled = false;
        knop.textContent = "Verstuur bericht";
      });
  });
});
