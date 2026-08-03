export const adminPageHtml = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ibiza Reise-Cockpit — Admin</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif; background: #f4f1ea; color: #22322d; }
  header { padding: 20px 28px; border-bottom: 1px solid #dedbd2; background: #fffdf8; }
  header h1 { margin: 0; font-size: 18px; }
  header p { margin: 4px 0 0; color: #718079; font-size: 12px; }
  .topline { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; gap: 10px; }
  #status { font-size: 12px; color: #718079; }
  .actions { display: flex; gap: 10px; }
  button { border: 0; background: #d95845; color: white; padding: 9px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; }
  button.secondary { background: transparent; border: 1px solid #dedbd2; color: #22322d; }
  button.danger { background: transparent; border: 1px solid #e3b3a8; color: #a13a26; padding: 5px 10px; font-size: 11px; font-weight: 600; }
  button:disabled { opacity: .5; cursor: default; }
  nav#sectionNav { display: flex; flex-wrap: wrap; gap: 6px; padding: 14px 28px; background: #fffdf8; border-bottom: 1px solid #dedbd2; position: sticky; top: 0; z-index: 5; }
  nav#sectionNav button { background: transparent; border: 1px solid #dedbd2; color: #718079; font-weight: 600; padding: 7px 14px; border-radius: 99px; font-size: 12px; }
  nav#sectionNav button.active { background: #22322d; border-color: #22322d; color: white; }
  main#sectionBody { max-width: 900px; margin: 24px auto; padding: 0 20px 60px; }
  .section-title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
  .section-hint { font-size: 11px; color: #718079; margin: 0 0 18px; }
  .subcard-subtitle { font-size: 12px; font-weight: 700; margin: 22px 0 10px; color: #22322d; }
  .field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px 16px; margin-bottom: 6px; }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #718079; }
  .field.full { grid-column: 1 / -1; }
  .field input, .field select, .field textarea { border: 1px solid #dedbd2; border-radius: 6px; background: #fffdf8; color: #22322d; padding: 8px 10px; font-size: 13px; font-family: inherit; }
  .field textarea { min-height: 56px; resize: vertical; }
  .field.checkbox { flex-direction: row; align-items: center; gap: 8px; }
  .field.checkbox label { order: 2; }
  .subcard { border: 1px solid #dedbd2; border-radius: 8px; padding: 16px 18px; margin-bottom: 16px; background: #fffdf8; }
  .subcard-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px; }
  .subcard-head h3 { margin: 0; font-size: 13px; }
  .item-row { border-top: 1px solid #dedbd2; padding-top: 12px; margin-top: 12px; }
  .item-row .field-grid { margin-bottom: 8px; }
  .list-add { margin: 4px 0 20px; }
  .json-view textarea { width: 100%; height: 55vh; font-family: ui-monospace, monospace; font-size: 12px; padding: 14px; border: 1px solid #dedbd2; border-radius: 8px; background: #fffdf8; color: #22322d; }
  .message { margin: 20px 28px; font-size: 13px; padding: 10px 14px; border-radius: 6px; white-space: pre-wrap; }
  .message:empty { display: none; }
  .message.error { background: #f7e5e1; color: #a13a26; }
  .message.success { background: #dbe9de; color: #365a44; }
</style>
</head>
<body>
<header>
  <h1>Ibiza Reise-Cockpit — Admin</h1>
  <p>Reisedaten bearbeiten. Änderungen werden serverseitig validiert und mit Backup gespeichert.</p>
  <div class="topline">
    <span id="status"></span>
    <div class="actions">
      <button type="button" id="reload" class="secondary">Neu laden</button>
      <button type="button" id="save" disabled>Speichern</button>
    </div>
  </div>
</header>
<nav id="sectionNav"></nav>
<main id="sectionBody"></main>
<div id="message" class="message"></div>
<script>
(function () {
  "use strict";

  var data = null;
  var activeSection = "meta";

  var statusEl = document.getElementById("status");
  var messageEl = document.getElementById("message");
  var navEl = document.getElementById("sectionNav");
  var bodyEl = document.getElementById("sectionBody");
  var saveBtn = document.getElementById("save");
  var reloadBtn = document.getElementById("reload");

  function esc(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function getPath(obj, path) {
    return path.reduce(function (acc, key) { return acc === null || acc === undefined ? acc : acc[key]; }, obj);
  }

  function setPath(obj, path, value) {
    var target = obj;
    for (var i = 0; i < path.length - 1; i++) target = target[path[i]];
    target[path[path.length - 1]] = value;
  }

  function pathAttr(path) {
    return esc(JSON.stringify(path));
  }

  var STATUS_OPTIONS = [{ value: "confirmed", label: "Bestätigt" }, { value: "pending", label: "Ausstehend" }];
  var PAID_STATUS_OPTIONS = [{ value: "paid", label: "Bezahlt" }, { value: "on_site", label: "Vor Ort" }];
  var TONE_OPTIONS = [
    { value: "sun", label: "Sonne" },
    { value: "water", label: "Wasser" },
    { value: "peach", label: "Pfirsich" },
    { value: "sage", label: "Salbei" },
    { value: "stone", label: "Stein" },
  ];

  function fieldHtml(path, field, value) {
    var id = "f" + Math.random().toString(36).slice(2);
    if (field.type === "textarea") {
      return '<div class="field full"><label for="' + id + '">' + esc(field.label) + '</label><textarea id="' + id + '" data-path=\\'' + pathAttr(path) + "' data-type='text'>" + esc(value) + "</textarea></div>";
    }
    if (field.type === "select") {
      var options = field.options || (field.optionsFn ? field.optionsFn() : []);
      var dataType = field.nullable ? "nullable-text" : "text";
      var optionsHtml = options.map(function (opt) {
        var selected = field.nullable ? (value === null || value === undefined ? opt.value === "" : opt.value === value) : opt.value === value;
        return '<option value="' + esc(opt.value) + '"' + (selected ? " selected" : "") + ">" + esc(opt.label) + "</option>";
      }).join("");
      return '<div class="field"><label for="' + id + '">' + esc(field.label) + '</label><select id="' + id + '" data-path=\\'' + pathAttr(path) + "' data-type='" + dataType + "'>" + optionsHtml + "</select></div>";
    }
    if (field.type === "checkbox") {
      return '<div class="field checkbox"><input id="' + id + '" type="checkbox" data-path=\\'' + pathAttr(path) + "' data-type='checkbox'" + (value ? " checked" : "") + ' /><label for="' + id + '">' + esc(field.label) + "</label></div>";
    }
    var inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
    var dataInputType = field.type === "number" ? "number" : "text";
    return '<div class="field"><label for="' + id + '">' + esc(field.label) + '</label><input id="' + id + '" type="' + inputType + '" data-path=\\'' + pathAttr(path) + "' data-type='" + dataInputType + "' value='" + esc(value) + "' /></div>";
  }

  function objectFieldsHtml(basePath, fields, obj) {
    return '<div class="field-grid">' + fields.map(function (field) {
      return fieldHtml(basePath.concat(field.key), field, obj ? obj[field.key] : "");
    }).join("") + "</div>";
  }

  function listSectionHtml(basePath, fields, items, itemLabel) {
    var rows = (items || []).map(function (item, index) {
      return '<div class="item-row">' +
        '<div class="subcard-head"><h3>' + esc(itemLabel) + " " + (index + 1) + '</h3><button type="button" class="danger" data-action="remove-row" data-list-path=\\'' + pathAttr(basePath) + '\\' data-index="' + index + '">Entfernen</button></div>' +
        objectFieldsHtml(basePath.concat(index), fields, item) +
        "</div>";
    }).join("");
    return rows + '<div><button type="button" class="secondary list-add" data-action="add-row" data-list-path=\\'' + pathAttr(basePath) + "'>+ " + esc(itemLabel) + " hinzufügen</button></div>";
  }

  function renderObjectSection(path, fields, title, hint) {
    return '<h2 class="section-title">' + esc(title) + "</h2>" + (hint ? '<p class="section-hint">' + esc(hint) + "</p>" : "") + objectFieldsHtml(path, fields, getPath(data, path));
  }

  function renderListOnlySection(path, fields, title, hint, itemLabel) {
    return '<h2 class="section-title">' + esc(title) + "</h2>" + (hint ? '<p class="section-hint">' + esc(hint) + "</p>" : "") + listSectionHtml(path, fields, getPath(data, path), itemLabel);
  }

  var metaFields = [
    { key: "title", label: "Titel", type: "text" },
    { key: "titleAccent", label: "Titel-Zusatz", type: "text" },
    { key: "routeFrom", label: "Route von (IATA)", type: "text" },
    { key: "routeTo", label: "Route nach (IATA)", type: "text" },
    { key: "travelersCount", label: "Anzahl Reisende", type: "number" },
    { key: "accommodationLabel", label: "Unterkunft-Label", type: "text" },
    { key: "startDate", label: "Start", type: "date" },
    { key: "endDate", label: "Ende", type: "date" },
    { key: "originCity", label: "Start-Stadt", type: "text" },
    { key: "originLat", label: "Start Breitengrad", type: "number" },
    { key: "originLon", label: "Start Längengrad", type: "number" },
    { key: "destinationCity", label: "Ziel-Stadt", type: "text" },
    { key: "destinationLat", label: "Ziel Breitengrad", type: "number" },
    { key: "destinationLon", label: "Ziel Längengrad", type: "number" },
  ];

  var flightLegFields = [
    { key: "dateLabel", label: "Datum-Label", type: "text" },
    { key: "departureTime", label: "Abflugzeit", type: "text" },
    { key: "departureAirport", label: "Abflug-Flughafen", type: "text" },
    { key: "departureCity", label: "Abflug-Stadt", type: "text" },
    { key: "arrivalTime", label: "Ankunftszeit", type: "text" },
    { key: "arrivalAirport", label: "Ankunfts-Flughafen", type: "text" },
    { key: "arrivalCity", label: "Ankunfts-Stadt", type: "text" },
    { key: "carrier", label: "Airline", type: "text" },
    { key: "flightNumber", label: "Flugnummer", type: "text" },
    { key: "durationLabel", label: "Flugdauer", type: "text" },
    { key: "terminal", label: "Terminal", type: "text" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { key: "referenceCode", label: "Buchungsnummer", type: "text" },
  ];

  var accommodationFields = [
    { key: "name", label: "Name", type: "text" },
    { key: "area", label: "Gegend", type: "text" },
    { key: "dateRangeLabel", label: "Zeitraum-Label", type: "text" },
    { key: "notes", label: "Notizen", type: "textarea" },
    { key: "referenceCode", label: "Buchungsnummer", type: "text" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
  ];

  var rentalCarFields = [
    { key: "category", label: "Kategorie", type: "text" },
    { key: "provider", label: "Anbieter", type: "text" },
    { key: "notes", label: "Notizen", type: "textarea" },
    { key: "pickupLabel", label: "Abholung", type: "text" },
    { key: "dropoffLabel", label: "Rückgabe", type: "text" },
    { key: "referenceCode", label: "Buchungsnummer", type: "text" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
  ];

  var itineraryDayFields = [
    { key: "weekday", label: "Wochentag", type: "text" },
    { key: "dateLabel", label: "Datum-Label", type: "text" },
    { key: "title", label: "Titel", type: "text" },
    { key: "note", label: "Notiz", type: "textarea" },
    { key: "tone", label: "Farbton", type: "select", options: TONE_OPTIONS },
  ];

  var timelineFields = [
    { key: "time", label: "Uhrzeit", type: "text" },
    { key: "title", label: "Titel", type: "text" },
    { key: "note", label: "Notiz", type: "textarea" },
    { key: "highlight", label: "Highlight", type: "checkbox" },
  ];

  var placeFields = [
    { key: "name", label: "Name", type: "text" },
    { key: "type", label: "Typ", type: "text" },
    { key: "area", label: "Gegend", type: "text" },
    { key: "note", label: "Notiz", type: "textarea" },
    { key: "color", label: "Farbe", type: "text" },
    { key: "lat", label: "Breitengrad (optional, für die Karte)", type: "number" },
    { key: "lon", label: "Längengrad (optional, für die Karte)", type: "number" },
  ];

  var budgetCategoryFields = [
    { key: "name", label: "Name", type: "text" },
    { key: "amount", label: "Betrag (€)", type: "number" },
    { key: "budgeted", label: "Geplant (€)", type: "number" },
    { key: "color", label: "Farbe", type: "text" },
  ];

  var paidItemFields = [
    { key: "label", label: "Bezeichnung", type: "text" },
    { key: "amount", label: "Betrag (€)", type: "number" },
    { key: "status", label: "Status", type: "select", options: PAID_STATUS_OPTIONS },
  ];

  var packingPersonFields = [
    { key: "id", label: "ID (z. B. felix)", type: "text" },
    { key: "name", label: "Name", type: "text" },
  ];

  var documentFields = [
    { key: "title", label: "Titel", type: "text" },
    { key: "meta", label: "Meta", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "symbol", label: "Symbol", type: "text" },
  ];

  var emergencyContactFields = [
    { key: "label", label: "Bezeichnung", type: "text" },
    { key: "phone", label: "Telefon", type: "text" },
  ];

  var practicalFactFields = [
    { key: "label", label: "Bezeichnung", type: "text" },
    { key: "value", label: "Wert", type: "text" },
  ];

  var insiderTipFields = [{ key: "quote", label: "Zitat", type: "textarea" }];

  var checkInReminderFields = [
    { key: "title", label: "Titel", type: "text" },
    { key: "note", label: "Notiz", type: "textarea" },
    { key: "dateLabel", label: "Datum-Label", type: "text" },
  ];

  function renderFlightsSection() {
    return '<h2 class="section-title">Flüge</h2>' +
      '<h3 class="subcard-subtitle">Hinflug</h3>' + objectFieldsHtml(["flights", "outbound"], flightLegFields, data.flights.outbound) +
      '<h3 class="subcard-subtitle">Rückflug</h3>' + objectFieldsHtml(["flights", "return"], flightLegFields, data.flights["return"]);
  }

  function renderItinerarySection() {
    var days = data.itineraryDays || [];
    var html = '<h2 class="section-title">Reiseplan</h2><p class="section-hint">Tage inkl. Tagesablauf.</p>';
    html += days.map(function (day, index) {
      var dayPath = ["itineraryDays", index];
      return '<div class="subcard">' +
        '<div class="subcard-head"><h3>Tag ' + (index + 1) + ": " + esc(day.title) + '</h3><button type="button" class="danger" data-action="remove-row" data-list-path=\\'' + pathAttr(["itineraryDays"]) + '\\' data-index="' + index + '">Tag entfernen</button></div>' +
        objectFieldsHtml(dayPath, itineraryDayFields, day) +
        '<h4 class="subcard-subtitle">Tagesablauf</h4>' +
        listSectionHtml(dayPath.concat("timeline"), timelineFields, day.timeline, "Eintrag") +
        "</div>";
    }).join("");
    html += '<button type="button" class="secondary list-add" data-action="add-row" data-list-path=\\'' + pathAttr(["itineraryDays"]) + "'>+ Tag hinzufügen</button>";
    return html;
  }

  function renderBudgetSection() {
    var html = '<h2 class="section-title">Budget</h2>';
    html += '<div class="field-grid">' + fieldHtml(["budget", "totalBudget"], { key: "totalBudget", label: "Gesamtbudget (€)", type: "number" }, data.budget.totalBudget) + "</div>";
    html += '<h3 class="subcard-subtitle">Kategorien</h3>' + listSectionHtml(["budget", "categories"], budgetCategoryFields, data.budget.categories, "Kategorie");
    html += '<h3 class="subcard-subtitle">Bezahlt</h3>' + listSectionHtml(["budget", "paid"], paidItemFields, data.budget.paid, "Posten");
    return html;
  }

  function renderPackingSection() {
    var packing = data.packing;
    var packingItemFields = [
      { key: "label", label: "Bezeichnung", type: "text" },
      {
        key: "assignedTo",
        label: "Zugewiesen an",
        type: "select",
        nullable: true,
        optionsFn: function () {
          return [{ value: "", label: "Niemand" }].concat(packing.people.map(function (p) { return { value: p.id, label: p.name }; }));
        },
      },
      { key: "checked", label: "Abgehakt", type: "checkbox" },
    ];

    var html = '<h2 class="section-title">Packliste</h2><p class="section-hint">Personen und Gruppen mit Punkten. Neue Punkte bekommen automatisch eine ID.</p>';
    html += '<h3 class="subcard-subtitle">Personen</h3>' + listSectionHtml(["packing", "people"], packingPersonFields, packing.people, "Person");
    html += '<h3 class="subcard-subtitle">Gruppen</h3>';
    html += packing.groups.map(function (group, gIndex) {
      var groupPath = ["packing", "groups", gIndex];
      return '<div class="subcard">' +
        '<div class="subcard-head"><h3>' + esc(group.title || "Gruppe " + (gIndex + 1)) + '</h3><button type="button" class="danger" data-action="remove-row" data-list-path=\\'' + pathAttr(["packing", "groups"]) + '\\' data-index="' + gIndex + '">Gruppe entfernen</button></div>' +
        objectFieldsHtml(groupPath, [{ key: "title", label: "Gruppentitel", type: "text" }], group) +
        '<h4 class="subcard-subtitle">Punkte</h4>' +
        listSectionHtml(groupPath.concat("items"), packingItemFields, group.items, "Punkt") +
        "</div>";
    }).join("");
    html += '<button type="button" class="secondary list-add" data-action="add-row" data-list-path=\\'' + pathAttr(["packing", "groups"]) + "'>+ Gruppe hinzufügen</button>";
    return html;
  }

  function renderJsonSection() {
    return '<h2 class="section-title">Rohdaten (JSON)</h2>' +
      '<p class="section-hint">Fallback zum Exportieren oder für Detail-Anpassungen. „Übernehmen“ ersetzt die aktuellen Formulardaten im Speicher — erst der „Speichern“-Button oben schreibt sie auf den Server.</p>' +
      '<div class="json-view"><textarea id="jsonEditor">' + esc(JSON.stringify(data, null, 2)) + "</textarea></div>" +
      '<button type="button" class="secondary" id="jsonApply" style="margin-top:10px;">Übernehmen</button>';
  }

  var SECTIONS = [
    { id: "meta", label: "Übersicht", render: function () { return renderObjectSection(["meta"], metaFields, "Übersicht", "Titel, Route, Reisedaten und Koordinaten fürs Wetter."); } },
    { id: "flights", label: "Flüge", render: renderFlightsSection },
    { id: "accommodation", label: "Unterkunft", render: function () { return renderObjectSection(["accommodation"], accommodationFields, "Unterkunft"); } },
    { id: "rentalCar", label: "Mietwagen", render: function () { return renderObjectSection(["rentalCar"], rentalCarFields, "Mietwagen"); } },
    { id: "itinerary", label: "Reiseplan", render: renderItinerarySection },
    { id: "places", label: "Orte", render: function () { return renderListOnlySection(["places"], placeFields, "Orte", "", "Ort"); } },
    { id: "budget", label: "Budget", render: renderBudgetSection },
    { id: "packing", label: "Packliste", render: renderPackingSection },
    { id: "documents", label: "Dokumente", render: function () { return renderListOnlySection(["documents"], documentFields, "Dokumente", "", "Dokument"); } },
    { id: "emergencyContacts", label: "Notfallkontakte", render: function () { return renderListOnlySection(["emergencyContacts"], emergencyContactFields, "Notfallkontakte", "", "Kontakt"); } },
    { id: "practicalFacts", label: "Praktisches", render: function () { return renderListOnlySection(["practicalFacts"], practicalFactFields, "Praktisches", "", "Eintrag"); } },
    { id: "insiderTip", label: "Insider-Tipp", render: function () { return renderObjectSection(["insiderTip"], insiderTipFields, "Insider-Tipp"); } },
    { id: "checkInReminder", label: "Check-in-Erinnerung", render: function () { return renderObjectSection(["checkInReminder"], checkInReminderFields, "Check-in-Erinnerung"); } },
    { id: "json", label: "JSON", render: renderJsonSection },
  ];

  function listDefaultFor(path) {
    var key = path[path.length - 1];
    var generators = {
      itineraryDays: function () { return { weekday: "", dateLabel: "", title: "", note: "", tone: "sun", timeline: [] }; },
      timeline: function () { return { time: "", title: "", note: "", highlight: false }; },
      places: function () { return { name: "", type: "", area: "", note: "", color: "" }; },
      categories: function () { return { name: "", amount: 0, budgeted: 0, color: "" }; },
      paid: function () { return { label: "", amount: 0, status: "on_site" }; },
      documents: function () { return { title: "", meta: "", status: "", symbol: "" }; },
      emergencyContacts: function () { return { label: "", phone: "" }; },
      practicalFacts: function () { return { label: "", value: "" }; },
      groups: function () { return { title: "Neue Gruppe", items: [] }; },
      items: function () {
        return { id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : "item-" + Date.now() + "-" + Math.random().toString(36).slice(2), label: "", assignedTo: null, checked: false };
      },
      people: function () { return { id: "", name: "" }; },
    };
    var gen = generators[key];
    return gen ? gen() : {};
  }

  function showMessage(text, kind) {
    messageEl.textContent = text;
    messageEl.className = "message " + (kind || "");
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function renderNav() {
    navEl.innerHTML = SECTIONS.map(function (section) {
      return '<button type="button" data-section="' + section.id + '" class="' + (section.id === activeSection ? "active" : "") + '">' + esc(section.label) + "</button>";
    }).join("");
  }

  function renderSection() {
    var section = SECTIONS.filter(function (s) { return s.id === activeSection; })[0];
    bodyEl.innerHTML = section.render();
  }

  function renderAll() {
    renderNav();
    renderSection();
  }

  navEl.addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-section]");
    if (!btn) return;
    activeSection = btn.dataset.section;
    renderAll();
  });

  function handleFieldChange(event) {
    var target = event.target;
    var pathValue = target.dataset.path;
    if (!pathValue) return;
    var path = JSON.parse(pathValue);
    var type = target.dataset.type;
    var value;
    if (type === "checkbox") value = target.checked;
    else if (type === "number") value = target.value === "" ? 0 : Number(target.value);
    else if (type === "nullable-text") value = target.value === "" ? null : target.value;
    else value = target.value;
    setPath(data, path, value);
    if (event.type === "change") renderSection();
  }

  function handleBodyClick(event) {
    var addBtn = event.target.closest('button[data-action="add-row"]');
    if (addBtn) {
      var addPath = JSON.parse(addBtn.dataset.listPath);
      var list = getPath(data, addPath);
      list.push(listDefaultFor(addPath));
      renderSection();
      return;
    }
    var removeBtn = event.target.closest('button[data-action="remove-row"]');
    if (removeBtn) {
      var removePath = JSON.parse(removeBtn.dataset.listPath);
      var index = Number(removeBtn.dataset.index);
      getPath(data, removePath).splice(index, 1);
      renderSection();
      return;
    }
    if (event.target.closest("#jsonApply")) {
      var editor = document.getElementById("jsonEditor");
      try {
        data = JSON.parse(editor.value);
        showMessage('Übernommen — jetzt oben "Speichern" klicken, um es zu schreiben.', "success");
        renderAll();
      } catch (error) {
        showMessage("Ungültiges JSON: " + error.message, "error");
      }
    }
  }

  bodyEl.addEventListener("input", handleFieldChange);
  bodyEl.addEventListener("change", handleFieldChange);
  bodyEl.addEventListener("click", handleBodyClick);

  async function load() {
    setStatus("Lädt …");
    saveBtn.disabled = true;
    try {
      var response = await fetch("/api/trip", { cache: "no-store" });
      if (!response.ok) throw new Error("Server antwortete mit " + response.status);
      data = await response.json();
      showMessage("", "");
      renderAll();
      saveBtn.disabled = false;
    } catch (error) {
      showMessage("Laden fehlgeschlagen: " + error.message, "error");
    } finally {
      setStatus("");
    }
  }

  saveBtn.addEventListener("click", async function () {
    saveBtn.disabled = true;
    setStatus("Speichert …");
    try {
      var response = await fetch("/admin/api/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      var body = await response.json();
      if (!response.ok) {
        showMessage("Fehler: " + body.error, "error");
      } else {
        data = body.trip;
        renderAll();
        showMessage("Gespeichert.", "success");
      }
    } catch (error) {
      showMessage("Netzwerkfehler: " + error.message, "error");
    } finally {
      saveBtn.disabled = false;
      setStatus("");
    }
  });

  reloadBtn.addEventListener("click", load);

  load();
})();
</script>
</body>
</html>
`;
