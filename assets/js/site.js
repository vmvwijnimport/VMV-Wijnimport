// Menu (mobiel), uitklapmenu producenten en het contactformulier.
document.addEventListener("DOMContentLoaded", function () {
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
  if (params.get("producent")) form.querySelector("#producent").value = params.get("producent");

  var toonProducent = function () {
    producentVeld.hidden = onderwerp.value !== producentVeld.dataset.toonBij;
  };
  onderwerp.addEventListener("change", toonProducent);
  toonProducent();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;

    status.className = "formulier__status";
    status.textContent = "Bericht wordt verstuurd...";
    knop.disabled = true;

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
        toonProducent();
        status.classList.add("goed");
        status.textContent = "Bedankt, je bericht is verstuurd. We nemen snel contact met je op.";
      })
      .catch(function () {
        status.classList.add("fout");
        status.innerHTML = 'Het bericht is niet verstuurd. Probeer het opnieuw, of mail ons direct op <a href="mailto:info@vmvwijnimport.com">info@vmvwijnimport.com</a>.';
      })
      .finally(function () {
        knop.disabled = false;
      });
  });
});
