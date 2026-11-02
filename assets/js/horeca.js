// Horecaportaal: aanvragen, inloggen, uitloggen en wachtwoord herstellen.
// De beveiliging zit in de database (Row Level Security); deze code toont
// alleen wat de database aan de ingelogde gebruiker teruggeeft.
(function () {
  var pagina = document.getElementById("horeca");
  if (!pagina) return;
  // Engelse pagina (/en/trade/): Engelse meldingen
  var EN = document.documentElement.lang === "en";
  var t = function (nl, en) { return EN ? en : nl; };

  var toestanden = pagina.querySelectorAll("[data-toestand]");
  var toon = function (naam) {
    toestanden.forEach(function (el) { el.hidden = el.dataset.toestand !== naam; });
  };
  var fout = function (tekst) {
    toon("fout");
    pagina.querySelector("[data-toestand=fout]").textContent = tekst;
  };

  if (!window.supabase || !pagina.dataset.url || !pagina.dataset.sleutel) {
    fout(t("Het horecaportaal is nu niet bereikbaar. Probeer het later opnieuw of mail ons op info@vmvwijnimport.com.",
      "The trade portal is not available right now. Please try again later or email us at info@vmvwijnimport.com."));
    return;
  }
  var db = window.supabase.createClient(pagina.dataset.url, pagina.dataset.sleutel);
  window.vmvHoreca = { db: db };
  var horecaAdres = location.origin + (pagina.dataset.basis || "/").replace(/\/$/, "") + "/horeca/";   // gebruikt door het portaal (assortiment en bestellen)

  // ---------- Validatie, zelfde gedrag als het contactformulier ----------
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
  var verplicht = function (melding) { return function (v) { return v ? "" : melding; }; };
  var REGELS = {
    email: function (v) { return !v ? t("Vul je e-mailadres in", "Please enter your email address") : EMAIL.test(v) ? "" : t("Dit e-mailadres klopt niet. Bijvoorbeeld: naam@voorbeeld.nl", "This email address doesn’t look right. For example: name@example.com"); },
    wachtwoord: verplicht(t("Vul je wachtwoord in", "Please enter your password")),
    bedrijfsnaam: verplicht(t("Vul de naam van je zaak in", "Please enter the name of your business")),
    type_zaak: verplicht(t("Kies het type zaak", "Please choose the type of business")),
    contactpersoon: verplicht(t("Vul je naam in", "Please enter your name")),
    telefoon: verplicht(t("Vul je telefoonnummer in", "Please enter your phone number")),
    kvk: function (v) { return !v ? t("Vul je KvK-nummer in", "Please enter your KvK number") : /^\d{8}$/.test(v.replace(/\s/g, "")) ? "" : t("Een KvK-nummer heeft 8 cijfers", "A KvK number has 8 digits"); },
    btw: verplicht(t("Vul je btw-nummer in", "Please enter your VAT number")),
    straat: verplicht(t("Vul straat en huisnummer in", "Please enter your street and house number")),
    postcode: verplicht(t("Vul de postcode in", "Please enter the postcode")),
    plaats: verplicht(t("Vul de plaats in", "Please enter the town or city"))
  };
  var NIEUW_WACHTWOORD = function (v) { return !v ? t("Kies een wachtwoord", "Please choose a password") : v.length >= 8 ? "" : t("Je wachtwoord moet minimaal 8 tekens hebben", "Your password must be at least 8 characters"); };

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
    if (/invalid login credentials/i.test(m)) return t("Je e-mailadres of wachtwoord klopt niet.", "Your email address or password is incorrect.");
    if (/email not confirmed/i.test(m)) return t("Bevestig eerst je e-mailadres via de link in je mail.", "Please confirm your email address first, using the link in your email.");
    if (/already registered|already been registered/i.test(m)) return t("Er is al een account met dit e-mailadres. Log in, of kies 'Wachtwoord vergeten'.", "There’s already an account with this email address. Log in, or choose ‘Forgot your password?’.");
    if (/rate limit|too many/i.test(m)) return t("Te veel pogingen. Probeer het over een paar minuten opnieuw.", "Too many attempts. Please try again in a few minutes.");
    if (/password/i.test(m)) return t("Kies een sterker wachtwoord van minimaal 8 tekens.", "Please choose a stronger password of at least 8 characters.");
    return t("Er ging iets mis. Probeer het opnieuw of mail ons op info@vmvwijnimport.com.", "Something went wrong. Please try again or email us at info@vmvwijnimport.com.");
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
          if (!k.data) {
            // Een VMV-beheerder hoort in de backoffice
            return db.from("beheerders").select("id").eq("id", sessie.user.id).maybeSingle().then(function (be) {
              if (be.data) { location.href = (pagina.dataset.basis || "/").replace(/\/$/, "") + "/horeca/beheer/"; return; }
              fout(t("Dit account hoort niet bij het horecaportaal. Neem contact met ons op.", "This account doesn’t belong to the trade portal. Please get in touch with us."));
            });
          }
          vulIn(k.data);
          toon(k.data.status);
          if (k.data.status === "goedgekeurd") document.dispatchEvent(new CustomEvent("horeca:goedgekeurd", { detail: { klant: k.data, id: sessie.user.id } }));
        });
    }).catch(function () { fout(t("Het horecaportaal is nu niet bereikbaar. Probeer het later opnieuw.", "The trade portal is not available right now. Please try again later.")); });
  };

  // ---------- Inloggen ----------
  var inlog = document.getElementById("inlogformulier");
  var inlogGeldig = koppelValidatie(inlog);
  inlog.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!inlogGeldig()) return;
    status(inlog);
    bezig(inlog, t("Inloggen…", "Logging in…"));
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
    bezig(vergeten, t("Versturen…", "Sending…"));
    // Altijd terug naar /horeca/ (dat adres staat in Supabase als toegestaan); wie Engels heeft gekozen,
    // gaat daar vanzelf door naar /en/trade/ (zie head.html)
    db.auth.resetPasswordForEmail(vergeten.email.value.trim(), { redirectTo: horecaAdres })
      .then(function (r) {
        if (r.error && /rate limit/i.test(r.error.message)) throw r.error;
        // Altijd dezelfde melding, zodat niet te zien is welke adressen bij ons bekend zijn
        status(vergeten, t("Als dit e-mailadres bij ons bekend is, krijg je zo een mail met een link.", "If we know this email address, you’ll receive an email with a link shortly."), "goed");
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
    bezig(nieuw, t("Opslaan…", "Saving…"));
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
    bezig(aanvraag, t("Versturen…", "Sending…"));

    db.auth.signUp({
      email: email,
      password: aanvraag.wachtwoord.value,
      options: { data: Object.assign({ aanvraag: "horeca" }, g), emailRedirectTo: horecaAdres }
    })
      .then(function (r) {
        if (r.error) throw r.error;
        // Een bestaand e-mailadres geeft (bewust) geen fout maar een gebruiker zonder identiteiten
        if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0) {
          throw new Error("already registered");
        }
        // De mail aan VMV verstuurt de database zelf (supabase/010); de klant krijgt de bevestigingsmail van Supabase
        aanvraag.reset();
        if (r.data.session) return laadKlant();
        status(aanvraag, t("Bedankt voor je aanvraag. Bevestig je e-mailadres via de link in je mail; daarna kijken we je gegevens na.",
          "Thank you for your request. Please confirm your email address using the link in your email; we’ll then review your details."), "goed");
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
