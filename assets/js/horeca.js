// Horecaportaal: aanvragen, inloggen, uitloggen en wachtwoord herstellen.
// De beveiliging zit in de database (Row Level Security); deze code toont
// alleen wat de database aan de ingelogde gebruiker teruggeeft.
(function () {
  var pagina = document.getElementById("horeca");
  if (!pagina) return;

  var toestanden = pagina.querySelectorAll("[data-toestand]");
  var toon = function (naam) {
    toestanden.forEach(function (el) { el.hidden = el.dataset.toestand !== naam; });
  };
  var fout = function (tekst) {
    toon("fout");
    pagina.querySelector("[data-toestand=fout]").textContent = tekst;
  };

  if (!window.supabase || !pagina.dataset.url || !pagina.dataset.sleutel) {
    fout("Het horecaportaal is nu niet bereikbaar. Probeer het later opnieuw of mail ons op info@vmvwijnimport.com.");
    return;
  }
  var db = window.supabase.createClient(pagina.dataset.url, pagina.dataset.sleutel);
  window.vmvHoreca = { db: db };   // gebruikt door het portaal (assortiment en bestellen)

  // ---------- Validatie, zelfde gedrag als het contactformulier ----------
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
  var verplicht = function (melding) { return function (v) { return v ? "" : melding; }; };
  var REGELS = {
    email: function (v) { return !v ? "Vul je e-mailadres in" : EMAIL.test(v) ? "" : "Dit e-mailadres klopt niet. Bijvoorbeeld: naam@voorbeeld.nl"; },
    wachtwoord: verplicht("Vul je wachtwoord in"),
    bedrijfsnaam: verplicht("Vul de naam van je zaak in"),
    type_zaak: verplicht("Kies het type zaak"),
    contactpersoon: verplicht("Vul je naam in"),
    telefoon: verplicht("Vul je telefoonnummer in"),
    kvk: function (v) { return !v ? "Vul je KvK-nummer in" : /^\d{8}$/.test(v.replace(/\s/g, "")) ? "" : "Een KvK-nummer heeft 8 cijfers"; },
    btw: verplicht("Vul je btw-nummer in"),
    straat: verplicht("Vul straat en huisnummer in"),
    postcode: verplicht("Vul de postcode in"),
    plaats: verplicht("Vul de plaats in")
  };
  var NIEUW_WACHTWOORD = function (v) { return !v ? "Kies een wachtwoord" : v.length >= 8 ? "" : "Je wachtwoord moet minimaal 8 tekens hebben"; };

  var koppelValidatie = function (form, extra) {
    var regel = function (veld) { return (extra && extra[veld.name]) || REGELS[veld.name]; };
    var controleer = function (veld) {
      var melding = regel(veld)(veld.value.trim());
      var el = document.getElementById(veld.id + "-fout");
      el.textContent = melding;
      el.hidden = !melding;
      if (melding) veld.setAttribute("aria-invalid", "true"); else veld.removeAttribute("aria-invalid");
      return !melding;
    };
    var velden = Array.prototype.filter.call(form.elements, function (v) { return v.name && regel(v); });
    velden.forEach(function (veld) {
      veld.addEventListener("blur", function () { controleer(veld); });
      veld.addEventListener(veld.tagName === "SELECT" ? "change" : "input", function () {
        if (veld.getAttribute("aria-invalid") === "true") controleer(veld);
      });
    });
    return function () {
      var eerste = null;
      velden.forEach(function (veld) { if (!controleer(veld) && !eerste) eerste = veld; });
      if (eerste) { eerste.scrollIntoView({ block: "center" }); eerste.focus({ preventScroll: true }); }
      return !eerste;
    };
  };

  var bezig = function (form, tekst) {
    var knop = form.querySelector("button[type=submit]");
    if (!knop.dataset.tekst) knop.dataset.tekst = knop.textContent;
    knop.disabled = !!tekst;
    knop.textContent = tekst || knop.dataset.tekst;
  };
  var status = function (form, tekst, soort) {
    var el = form.querySelector(".formulier__status");
    el.className = "formulier__status" + (soort ? " " + soort : "");
    el.textContent = tekst || "";
  };
  var vertaal = function (e) {
    var m = (e && e.message) || "";
    if (/invalid login credentials/i.test(m)) return "Je e-mailadres of wachtwoord klopt niet.";
    if (/email not confirmed/i.test(m)) return "Bevestig eerst je e-mailadres via de link in je mail.";
    if (/already registered|already been registered/i.test(m)) return "Er is al een account met dit e-mailadres. Log in, of kies 'Wachtwoord vergeten'.";
    if (/rate limit|too many/i.test(m)) return "Te veel pogingen. Probeer het over een paar minuten opnieuw.";
    if (/password/i.test(m)) return "Kies een sterker wachtwoord van minimaal 8 tekens.";
    return "Er ging iets mis. Probeer het opnieuw of mail ons op info@vmvwijnimport.com.";
  };

  // ---------- Toestand bepalen ----------
  var vulIn = function (klant) {
    pagina.querySelectorAll("[data-veld]").forEach(function (el) { el.textContent = klant[el.dataset.veld] || ""; });
  };
  var laadKlant = function () {
    return db.auth.getSession().then(function (r) {
      var sessie = r.data && r.data.session;
      if (!sessie) { toon("uit"); return; }
      return db.from("klanten").select("bedrijfsnaam, contactpersoon, email, telefoon, straat, postcode, plaats, status").eq("id", sessie.user.id).maybeSingle()
        .then(function (k) {
          if (k.error) throw k.error;
          if (!k.data) { fout("Dit account hoort niet bij het horecaportaal. Neem contact met ons op."); return; }
          vulIn(k.data);
          toon(k.data.status);
          if (k.data.status === "goedgekeurd") document.dispatchEvent(new CustomEvent("horeca:goedgekeurd", { detail: { klant: k.data, id: sessie.user.id } }));
        });
    }).catch(function () { fout("Het horecaportaal is nu niet bereikbaar. Probeer het later opnieuw."); });
  };

  // ---------- Inloggen ----------
  var inlog = document.getElementById("inlogformulier");
  var inlogGeldig = koppelValidatie(inlog);
  inlog.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!inlogGeldig()) return;
    status(inlog);
    bezig(inlog, "Inloggen…");
    db.auth.signInWithPassword({ email: inlog.email.value.trim(), password: inlog.wachtwoord.value })
      .then(function (r) {
        if (r.error) throw r.error;
        inlog.reset();
        return laadKlant();
      })
      .catch(function (err) { status(inlog, vertaal(err), "fout"); })
      .finally(function () { bezig(inlog); });
  });

  // ---------- Wachtwoord vergeten ----------
  var vergeten = document.getElementById("vergetenformulier");
  var vergetenGeldig = koppelValidatie(vergeten);
  pagina.querySelector("[data-actie=vergeten]").addEventListener("click", function () {
    inlog.hidden = true; vergeten.hidden = false; vergeten.email.focus();
  });
  pagina.querySelector("[data-actie=terug-inloggen]").addEventListener("click", function () {
    vergeten.hidden = true; inlog.hidden = false; inlog.email.focus();
  });
  vergeten.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!vergetenGeldig()) return;
    bezig(vergeten, "Versturen…");
    db.auth.resetPasswordForEmail(vergeten.email.value.trim(), { redirectTo: location.origin + location.pathname })
      .then(function (r) {
        if (r.error && /rate limit/i.test(r.error.message)) throw r.error;
        // Altijd dezelfde melding, zodat niet te zien is welke adressen bij ons bekend zijn
        status(vergeten, "Als dit e-mailadres bij ons bekend is, krijg je zo een mail met een link.", "goed");
      })
      .catch(function (err) { status(vergeten, vertaal(err), "fout"); })
      .finally(function () { bezig(vergeten); });
  });

  // Teruggekomen via de link in de herstelmail
  var nieuw = document.getElementById("nieuwwachtwoordformulier");
  var nieuwGeldig = koppelValidatie(nieuw, { wachtwoord: NIEUW_WACHTWOORD });
  db.auth.onAuthStateChange(function (gebeurtenis) {
    if (gebeurtenis === "PASSWORD_RECOVERY") toon("nieuw-wachtwoord");
  });
  nieuw.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!nieuwGeldig()) return;
    bezig(nieuw, "Opslaan…");
    db.auth.updateUser({ password: nieuw.wachtwoord.value })
      .then(function (r) { if (r.error) throw r.error; nieuw.reset(); return laadKlant(); })
      .catch(function (err) { status(nieuw, vertaal(err), "fout"); })
      .finally(function () { bezig(nieuw); });
  });

  // ---------- Account aanvragen ----------
  var aanvraag = document.getElementById("aanvraagformulier");
  var aanvraagGeldig = koppelValidatie(aanvraag, { wachtwoord: NIEUW_WACHTWOORD });
  aanvraag.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!aanvraagGeldig()) return;
    var g = {};
    ["bedrijfsnaam", "type_zaak", "contactpersoon", "telefoon", "kvk", "btw", "straat", "postcode", "plaats"].forEach(function (n) {
      g[n] = aanvraag.elements[n].value.trim();
    });
    g.kvk = g.kvk.replace(/\s/g, "");
    g.btw = g.btw.replace(/\s/g, "").toUpperCase();
    var email = aanvraag.email.value.trim();
    status(aanvraag);
    bezig(aanvraag, "Versturen…");

    db.auth.signUp({
      email: email,
      password: aanvraag.wachtwoord.value,
      options: { data: Object.assign({ aanvraag: "horeca" }, g), emailRedirectTo: location.origin + location.pathname }
    })
      .then(function (r) {
        if (r.error) throw r.error;
        // Een bestaand e-mailadres geeft (bewust) geen fout maar een gebruiker zonder identiteiten
        if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0) {
          throw new Error("already registered");
        }
        // Melding naar VMV; niet wachten als dat traag is
        fetch(pagina.dataset.mail, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(Object.assign({
            _subject: "Nieuwe horeca-aanvraag: " + g.bedrijfsnaam,
            _template: "table", _captcha: "false", _replyto: email,
            _autoresponse: "Bedankt voor je aanvraag voor het horecaportaal van VMV Wijnimport. We kijken je gegevens na en laten je weten wanneer je account is goedgekeurd.",
            email: email,
            goedkeuren: "Supabase → Table Editor → klanten → status op 'goedgekeurd' zetten"
          }, g))
        }).catch(function () {});
        aanvraag.reset();
        if (r.data.session) return laadKlant();
        status(aanvraag, "Bedankt voor je aanvraag. Bevestig je e-mailadres via de link in je mail; daarna kijken we je gegevens na.", "goed");
      })
      .catch(function (err) { status(aanvraag, vertaal(err), "fout"); })
      .finally(function () { bezig(aanvraag); });
  });

  // ---------- Uitloggen ----------
  pagina.querySelectorAll("[data-actie=uitloggen]").forEach(function (knop) {
    knop.addEventListener("click", function () {
      db.auth.signOut().finally(function () { toon("uit"); });
    });
  });

  laadKlant();
})();
